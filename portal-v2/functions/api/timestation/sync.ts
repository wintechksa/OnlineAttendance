import { calculateWorkMinutes } from '../../../src/lib/timeCalculations'

interface Env {
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  TIMESTATION_API_KEY: string
}

interface Profile {
  user_id: string
  timestation_employee_id: string | null
  ts_work_categories: { regular_minutes: number } | null
}

interface Shift {
  shift_id: string
  employee_id: string
  total_minutes: string
  in?: { time?: string }
  out?: { time?: string }
}

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

async function supabaseRequest(env: Env, path: string, init: RequestInit = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...jsonHeaders,
      ...(init.headers ?? {}),
    },
  })
}

async function authenticatedUser(request: Request, env: Env) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const result = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization },
  })
  return result.ok ? result.json() as Promise<{ id: string }> : null
}

function toTime(value?: string): string | null {
  if (!value) return null
  const match = value.match(/T(\d{2}:\d{2})/)
  return match?.[1] ?? null
}

function groupByWorkDate(shifts: Shift[]) {
  const grouped = new Map<string, Shift[]>()
  for (const shift of shifts) {
    const date = shift.in?.time?.slice(0, 10)
    if (!date) continue
    grouped.set(date, [...(grouped.get(date) ?? []), shift])
  }
  return grouped
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.TIMESTATION_API_KEY) {
    return response({ error: 'Server integration is not configured.' }, 503)
  }

  const user = await authenticatedUser(request, env)
  if (!user) return response({ error: 'Unauthorized' }, 401)

  const roleResult = await supabaseRequest(env, `ts_employee_profiles?select=role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`)
  const roleRows = roleResult.ok ? await roleResult.json() as Array<{ role: string }> : []
  if (!['admin', 'reviewer'].includes(roleRows[0]?.role)) return response({ error: 'Forbidden' }, 403)

  const body = await request.json().catch(() => ({})) as { startDate?: string; endDate?: string; employeeId?: string }
  if (!validDate(body.startDate) || !validDate(body.endDate) || body.startDate > body.endDate) return response({ error: 'Valid startDate and endDate are required.' }, 400)
  const rangeDays = (Date.parse(`${body.endDate}T00:00:00Z`) - Date.parse(`${body.startDate}T00:00:00Z`)) / 86_400_000
  if (rangeDays > 31) return response({ error: 'Sync range cannot exceed 31 days.' }, 400)

  const profileFilter = body.employeeId ? `&user_id=eq.${encodeURIComponent(body.employeeId)}` : ''
  const profilesResult = await supabaseRequest(env, `ts_employee_profiles?select=user_id,timestation_employee_id,ts_work_categories(regular_minutes)&active=eq.true&timestation_employee_id=not.is.null${profileFilter}`)
  if (!profilesResult.ok) return response({ error: 'Could not load employee mappings.' }, 502)
  const profiles = await profilesResult.json() as Profile[]

  const settingsResult = await supabaseRequest(env, 'ts_timesheet_settings?select=break_minutes,timestation_already_deducts_break&id=eq.true&limit=1')
  const settings = (await settingsResult.json() as Array<{ break_minutes: number; timestation_already_deducts_break: boolean }>)[0] ?? { break_minutes: 60, timestation_already_deducts_break: true }
  const holidaysResult = await supabaseRequest(env, `ts_holidays?select=holiday_date&holiday_date=gte.${body.startDate}&holiday_date=lte.${body.endDate}`)
  const holidays = new Set((await holidaysResult.json() as Array<{ holiday_date: string }>).map(x => x.holiday_date))

  const rows: Record<string, unknown>[] = []
  for (const profile of profiles) {
    const url = new URL('https://api.mytimestation.com/v1.2/shifts')
    url.searchParams.set('employee_id', profile.timestation_employee_id!)
    url.searchParams.set('start_date', body.startDate)
    url.searchParams.set('end_date', body.endDate)
    const shiftResult = await fetch(url, { headers: { authorization: `Bearer ${env.TIMESTATION_API_KEY}`, accept: 'application/json' } })
    if (!shiftResult.ok) return response({ error: `TimeStation sync failed (${shiftResult.status}). No key or response body was logged.` }, 502)
    const { shifts = [] } = await shiftResult.json() as { shifts: Shift[] }

    for (const [workDate, daily] of groupByWorkDate(shifts)) {
      daily.sort((a, b) => (a.in?.time ?? '').localeCompare(b.in?.time ?? ''))
      const reportedMinutes = daily.reduce((sum, shift) => sum + Math.max(0, Number.parseInt(shift.total_minutes || '0', 10) || 0), 0)
      const calculated = calculateWorkMinutes({
        workDate,
        reportedMinutes,
        regularMinutes: profile.ts_work_categories?.regular_minutes ?? 480,
        breakMinutes: settings.break_minutes,
        sourceAlreadyDeductedBreak: settings.timestation_already_deducts_break,
        isHoliday: holidays.has(workDate),
      })
      const first = daily[0]; const last = daily[daily.length - 1]
      rows.push({
        employee_id: profile.user_id, work_date: workDate,
        am_in: toTime(first.in?.time), am_out: daily.length > 1 ? toTime(first.out?.time) : null,
        pm_in: daily.length > 1 ? toTime(daily[1].in?.time) : null, pm_out: toTime(last.out?.time),
        source_shift_ids: daily.map(x => x.shift_id), source_reported_minutes: reportedMinutes,
        break_deducted_minutes: calculated.breakDeductedMinutes, basic_minutes: calculated.basicMinutes,
        overtime_minutes: calculated.overtimeMinutes, is_friday: calculated.allOvertime && !holidays.has(workDate),
        is_holiday: holidays.has(workDate), source: 'timestation', synced_at: new Date().toISOString(),
      })
    }
  }

  if (rows.length) {
    const write = await supabaseRequest(env, 'ts_attendance_entries?on_conflict=employee_id,work_date', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    })
    if (!write.ok) return response({ error: 'Attendance could not be saved.' }, 502)
  }
  return response({ syncedEmployees: profiles.length, syncedEntries: rows.length, startDate: body.startDate, endDate: body.endDate })
}

export const onRequestGet: PagesFunction = async () => response({ error: 'Method not allowed. TimeStation access is read-only and sync uses POST.' }, 405)
