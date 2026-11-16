export interface SecureEnv {
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }
export function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }) }

export function configured(env: SecureEnv) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function serviceRequest(env: SecureEnv, path: string, init: RequestInit = {}) {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...jsonHeaders,
      ...(init.headers ?? {}),
    },
  })
}

export async function authenticatedAdmin(request: Request, env: SecureEnv) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const auth = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization },
  })
  if (!auth.ok) return null
  const user = await auth.json() as { id: string }
  const profile = await serviceRequest(env, `/rest/v1/ts_employee_profiles?select=user_id,role,status,active&user_id=eq.${encodeURIComponent(user.id)}&limit=1`)
  const rows = profile.ok ? await profile.json() as Array<{ user_id: string; role: string; status: string; active: boolean }> : []
  return rows[0]?.role === 'admin' && rows[0]?.status === 'active' && rows[0]?.active ? user : null
}
