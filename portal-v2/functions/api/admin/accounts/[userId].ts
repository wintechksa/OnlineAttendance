import { authenticatedAdmin, configured, json, serviceRequest, type SecureEnv } from '../../../_shared/supabaseAdmin'

type ActionBody = { action?: 'approve' | 'reject' | 'deactivate'; departmentId?: string; workCategoryId?: string; role?: 'employee' | 'reviewer' | 'admin' }

export const onRequestPatch: PagesFunction<SecureEnv, 'userId'> = async ({ request, env, params }) => {
  if (!configured(env)) return json({ error: 'Admin account management is not configured yet.' }, 503)
  const admin = await authenticatedAdmin(request, env)
  if (!admin) return json({ error: 'Forbidden' }, 403)
  const userId = String(params.userId)
  const body = await request.json().catch(() => ({})) as ActionBody
  let update: Record<string, unknown>
  if (body.action === 'approve') {
    if (!body.departmentId || !body.workCategoryId || !['employee', 'reviewer', 'admin'].includes(body.role ?? 'employee')) return json({ error: 'Department and work category are required.' }, 400)
    update = { department_id: body.departmentId, work_category_id: body.workCategoryId, role: body.role ?? 'employee', active: true, status: 'active', approved_by: admin.id, approved_at: new Date().toISOString() }
  } else if (body.action === 'reject') update = { active: false, status: 'rejected' }
  else if (body.action === 'deactivate') update = { active: false, status: 'exited' }
  else return json({ error: 'Invalid account action.' }, 400)
  if (userId === admin.id && body.action !== 'approve') return json({ error: 'You cannot deactivate your own admin account.' }, 400)

  const result = await serviceRequest(env, `/rest/v1/ts_employee_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(update),
  })
  if (!result.ok) return json({ error: 'Account could not be updated.' }, 502)
  const rows = await result.json() as Record<string, unknown>[]
  if (!rows.length) return json({ error: 'Account not found.' }, 404)
  await serviceRequest(env, '/rest/v1/ts_audit_log', {
    method: 'POST', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ actor_id: admin.id, action: `ACCOUNT_${body.action!.toUpperCase()}`, entity_table: 'ts_employee_profiles', entity_id: userId, after_data: rows[0] }),
  })
  return json({ message: 'Account updated.' })
}

export const onRequestDelete: PagesFunction<SecureEnv, 'userId'> = async ({ request, env, params }) => {
  if (!configured(env)) return json({ error: 'Admin account management is not configured yet.' }, 503)
  const admin = await authenticatedAdmin(request, env)
  if (!admin) return json({ error: 'Forbidden' }, 403)
  const userId = String(params.userId)
  if (userId === admin.id) return json({ error: 'You cannot delete your own admin account.' }, 400)
  const beforeResult = await serviceRequest(env, `/rest/v1/ts_employee_profiles?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`)
  const beforeRows = beforeResult.ok ? await beforeResult.json() as Record<string, unknown>[] : []
  const result = await serviceRequest(env, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
  if (!result.ok) return json({ error: 'Account could not be deleted.' }, 502)
  await serviceRequest(env, '/rest/v1/ts_audit_log', {
    method: 'POST', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ actor_id: admin.id, action: 'ACCOUNT_DELETE', entity_table: 'ts_employee_profiles', entity_id: userId, before_data: beforeRows[0] ?? null }),
  })
  return json({ message: 'Account permanently deleted.' })
}

