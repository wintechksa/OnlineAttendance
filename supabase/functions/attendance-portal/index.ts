// The gateway verifies the browser's anon JWT. Portal tokens are checked below.
// SUPABASE_SERVICE_ROLE_KEY is read only from the server environment.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const profileFields = 'id,employee_number,email,mobile_number,korean_name,job_title,nationality,mobile_ksa,mobile_home,religion,birthdate,blood_type,arrival_date,contract_expiry,full_name,department,designation,site_location,emergency_contact,role,status,admin_otp_enabled,created_at,updated_at,must_change_password'.split(',');
const ownEditable = 'full_name,email,mobile_number,korean_name,job_title,nationality,mobile_ksa,mobile_home,religion,birthdate,blood_type,arrival_date,contract_expiry,department'.split(',');
const tableFields: Record<string, string[]> = {
  employee_profiles: profileFields,
  admin_profiles: 'id,admin_number,employee_number,email,full_name,status,mobile_number,must_change_password'.split(','),
  employee_timesheets: 'id,employee_number,full_name,work_date,clock_in,clock_out,hours,status,notes,am_in,am_out,pm_in,pm_out,total_hours,created_at,updated_at'.split(','),
  employee_import_files: 'id,file_name,uploaded_by,uploaded_at,row_count,is_active'.split(','),
  employee_feedback: 'id,employee_number,full_name,message,rating,created_at,feedback_type,subject,is_read,contact_email,contact_mobile'.split(','),
};
class HttpError extends Error { constructor(message: string, public status = 400) { super(message); } }
function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function text(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || value.length > max) throw new HttpError('Invalid request.');
  return value;
}
async function db(path: string, method = 'GET', body?: unknown, prefer?: string) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/' + path, {
    method, headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!res.ok) {
    if (data?.code === '23505') throw new HttpError('An account already uses these details.');
    if (data?.code === 'P0001') throw new HttpError(data.message);
    throw new HttpError('Unable to complete this request. Please contact your administrator.', 500);
  }
  return data;
}
const rpc = (name: string, args: unknown) => db('rpc/' + name, 'POST', args);
async function digest(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
    .map(n => n.toString(16).padStart(2, '0')).join('');
}
async function identity(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError('Session expired. Please sign in again.', 401);
  const query = new URLSearchParams({ token_hash: 'eq.' + await digest(token), expires_at: 'gt.' + new Date().toISOString(), select: 'employee_number,admin_number,role', limit: '1' });
  const session = (await db('portal_sessions?' + query))[0];
  if (!session) throw new HttpError('Session expired. Please sign in again.', 401);
  const table = session.role === 'admin' ? 'admin_profiles' : 'employee_profiles';
  const column = session.role === 'admin' ? 'admin_number' : 'employee_number';
  const account = (await db(table + '?' + new URLSearchParams({ [column]: 'eq.' + (session.admin_number || session.employee_number), select: 'status', limit: '1' })))[0];
  if (!account || account.status?.toLowerCase() !== 'active') throw new HttpError('Account inactive. Contact your administrator.', 401);
  return session;
}
async function queryData(body: any, session: any) {
  const table = text(body.table, 60);
  const allowed = tableFields[table];
  if (!allowed) throw new HttpError('This operation is not available.', 403);
  const operation = body.operation;
  if (!['select', 'insert', 'update', 'upsert', 'delete'].includes(operation)) throw new HttpError('Invalid operation.');
  const admin = session.role === 'admin';
  if (!admin && !(table === 'employee_profiles' && ['select', 'update'].includes(operation)) && !(table === 'employee_timesheets' && operation === 'select')) {
    throw new HttpError('Administrator access required.', 403);
  }
  const params = new URLSearchParams();
  const filters = body.filters || [];
  if (!Array.isArray(filters) || filters.length > 10) throw new HttpError('Invalid filters.');
  for (const filter of filters) {
    if (!allowed.includes(filter.column) || !['string', 'boolean', 'number'].includes(typeof filter.value)) throw new HttpError('Invalid filter.');
    params.append(filter.column, 'eq.' + filter.value);
  }
  // Authorization uses the stored server identity, never the role/number in localStorage.
  if (!admin) params.append('employee_number', 'eq.' + session.employee_number);
  if (['delete', 'update'].includes(operation) && filters.length === 0) throw new HttpError('Choose a record first.');
  if (operation === 'select') {
    const columns = body.columns === '*' || !body.columns ? allowed : String(body.columns).split(',').filter((c: string) => allowed.includes(c));
    if (!columns.length) throw new HttpError('Invalid columns.');
    params.set('select', columns.join(','));
    if (body.order) {
      if (!allowed.includes(body.order.column)) throw new HttpError('Invalid sort.');
      params.set('order', body.order.column + (body.order.ascending === false ? '.desc' : '.asc'));
    }
    const data = await db(table + '?' + params);
    if (body.single && data.length > 1) throw new HttpError('Multiple matching accounts. Contact your administrator.');
    return body.single ? data[0] || null : data;
  }
  let rows = body.rows;
  if (operation !== 'delete') {
    if (!rows || typeof rows !== 'object') throw new HttpError('Invalid records.');
    const records = Array.isArray(rows) ? rows : [rows];
    if (!records.length || records.length > 1000) throw new HttpError('Upload between 1 and 1000 records at a time.');
    rows = [];
    for (const record of records) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (key === 'login_password' && admin && table === 'employee_profiles') {
          if (value) {
            sanitized.login_password_hash = await rpc('attendance_password_hash', { p_password: text(value, 72) });
            sanitized.login_password = null;
            sanitized.must_change_password = true;
          }
          continue;
        }
        if ((key === 'admin_password' || key === 'login_password') && table === 'admin_profiles') {
          if (key === 'admin_password' && value) sanitized.admin_password_hash = await rpc('attendance_password_hash', { p_password: text(value, 72) });
          continue;
        }
        if (!allowed.includes(key) || (!admin && !ownEditable.includes(key))) throw new HttpError('This field cannot be changed.', 403);
        if (value !== null && !['string','number','boolean'].includes(typeof value)) throw new HttpError('Invalid field value.');
        sanitized[key] = value;
      }
      if (typeof sanitized.email === 'string') {
        sanitized.email = sanitized.email.trim().toLowerCase();
        if (sanitized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized.email as string)) throw new HttpError('Enter a valid email address.');
      }
      if (sanitized.role && !['admin','employee'].includes(sanitized.role as string)) throw new HttpError('Invalid role.');
      if (sanitized.status && !['active','disabled'].includes(sanitized.status as string)) throw new HttpError('Invalid status.');
      rows.push(sanitized);
    }
    if (operation === 'update') {
      if (rows.length !== 1) throw new HttpError('Update one record at a time.');
      rows = rows[0];
    }
  }
  if (operation === 'upsert') {
    const conflicts: Record<string, string> = { employee_profiles: 'employee_number', admin_profiles: 'admin_number', employee_timesheets: 'employee_number,work_date' };
    if (!conflicts[table] || body.onConflict !== conflicts[table]) throw new HttpError('Invalid upsert.');
    params.set('on_conflict', conflicts[table]);
  }
  if (operation === 'upsert') {
    // Rows with blank passwords omit the hash column; group equal column sets so
    // PostgREST accepts mixed imports without clearing an existing password hash.
    const groups = new Map<string, any[]>();
    for (const row of rows) {
      const key = Object.keys(row).sort().join(',');
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    for (const group of groups.values()) await db(table + '?' + params, 'POST', group, 'resolution=merge-duplicates,return=minimal');
  } else {
    await db(table + '?' + params, operation === 'delete' ? 'DELETE' : operation === 'update' ? 'PATCH' : 'POST', operation === 'delete' ? undefined : rows, 'return=minimal');
  }
  return null;
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 2_000_000) throw new HttpError('Request is too large.', 413);
    let body;
    try { body = JSON.parse(raw); } catch (_) { throw new HttpError('Invalid request.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError('Invalid request.');
    if (body.action === 'signup') {
      const data = await rpc('attendance_register_employee', {
        p_employee_number: text(body.employeeNumber, 80), p_email: text(body.email, 254),
        p_full_name: text(body.fullName, 200), p_mobile_number: text(body.mobileNumber, 40),
        p_password: text(body.password, 72), p_source: req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown',
      });
      return data.error ? reply({ error: data.error }, data.error.includes('Too many') ? 429 : 400) : reply({ data });
    }
    if (body.action === 'login') {
      const data = await rpc('attendance_login', { p_identifier: text(body.identifier, 254), p_password: text(body.password, 200) });
      return data.error ? reply({ error: data.error }, data.error.includes('Too many') ? 429 : 401) : reply({ data });
    }
    const session = await identity(body.token);
    if (body.action === 'logout') return reply({ data: await rpc('portal_logout', { p_token: body.token }) });
    if (body.action === 'change_password') {
      const newPassword = text(body.newPassword, 72);
      if (newPassword.length < 8 || new TextEncoder().encode(newPassword).length > 72) throw new HttpError('Password must contain at least 8 characters and at most 72 UTF-8 bytes.');
      await rpc('portal_change_password', { p_token: body.token, p_current_password: text(body.currentPassword, 200), p_new_password: newPassword });
      await db('portal_sessions?' + new URLSearchParams({ employee_number: 'eq.' + session.employee_number, token_hash: 'neq.' + await digest(body.token) }), 'DELETE');
      return reply({ data: null });
    }
    if (body.action === 'query') return reply({ data: await queryData(body, session) });
    throw new HttpError('Unknown request.');
  } catch (error) {
    return reply({ error: error instanceof HttpError ? error.message : 'Unable to complete this request. Please try again.' }, error instanceof HttpError ? error.status : 500);
  }
});
