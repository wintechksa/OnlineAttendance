import { signupValidation } from '../../../src/lib/account'
import { configured, json, jsonHeaders, serviceRequest, type SecureEnv } from '../../_shared/supabaseAdmin'

export const onRequestPost: PagesFunction<SecureEnv> = async ({ request, env }) => {
  if (!configured(env)) return json({ error: 'Account registration is not configured yet.' }, 503)
  const parsed = signupValidation(await request.json().catch(() => ({})) as Record<string, unknown>)
  if ('error' in parsed) return json({ error: parsed.error }, 400)
  const { employeeId, fullName, password } = parsed.value
  const email = `${employeeId.toLowerCase()}@employees.wintech.invalid`

  const created = await serviceRequest(env, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { employee_number: employeeId } }),
  })
  if (!created.ok) {
    const details = await created.json().catch(() => ({})) as { message?: string; msg?: string }
    const duplicate = created.status === 422 || /already|registered|exists/i.test(details.message ?? details.msg ?? '')
    return json({ error: duplicate ? 'This employee ID is already registered.' : 'Registration could not be completed.' }, duplicate ? 409 : 502)
  }

  const user = await created.json() as { id: string }
  const profile = await serviceRequest(env, '/rest/v1/ts_employee_profiles', {
    method: 'POST', headers: { ...jsonHeaders, prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: user.id, employee_number: employeeId, full_name: fullName, role: 'employee', active: false, status: 'pending' }),
  })
  if (!profile.ok) {
    await serviceRequest(env, `/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' })
    return json({ error: profile.status === 409 ? 'This employee ID is already registered.' : 'Registration could not be completed.' }, profile.status === 409 ? 409 : 502)
  }
  return json({ message: 'Registration received. An administrator must approve the account before access is enabled.' }, 201)
}

export const onRequestGet: PagesFunction = async () => json({ error: 'Method not allowed.' }, 405)
