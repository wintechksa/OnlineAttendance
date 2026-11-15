import { createClient } from '@supabase/supabase-js'

const [employeeNumber, password, fullName, departmentName, categoryName, timeStationEmployeeId = ''] = process.argv.slice(2)
if (![employeeNumber, password, fullName, departmentName, categoryName].every(Boolean)) {
  console.error('Usage: node scripts/provision-user.mjs EMPLOYEE_ID PASSWORD "Full Name" "DEPARTMENT" "Workers|Staff|Safety" [TIMESTATION_EMPLOYEE_ID]')
  process.exit(1)
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the current shell. Do not save the service key in VITE_ variables.')
  process.exit(1)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const normalized = employeeNumber.trim().toUpperCase()
const email = `${normalized.toLowerCase().replace(/[^a-z0-9_-]/g, '')}@employees.wintech.invalid`
const [{ data: department }, { data: category }] = await Promise.all([
  supabase.from('ts_departments').select('id').eq('name', departmentName.toUpperCase()).single(),
  supabase.from('ts_work_categories').select('id').eq('name', categoryName).single(),
])
if (!department || !category) throw new Error('Department or category was not found. Apply seed.sql first.')
const { data: created, error: authError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { employee_number: normalized } })
if (authError) throw authError
const { error: profileError } = await supabase.from('ts_employee_profiles').insert({
  user_id: created.user.id, employee_number: normalized, full_name: fullName,
  department_id: department.id, work_category_id: category.id,
  timestation_employee_id: timeStationEmployeeId || null,
})
if (profileError) {
  await supabase.auth.admin.deleteUser(created.user.id)
  throw profileError
}
console.log(`Created ${normalized}. The password was not printed.`)
