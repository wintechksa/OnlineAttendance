export type AttendanceStatus = 'complete' | 'incomplete' | 'holiday' | 'friday'

export interface TimesheetRow {
  id: string
  workDate: string
  amIn: string | null
  amOut: string | null
  pmIn: string | null
  pmOut: string | null
  basicMinutes: number
  overtimeMinutes: number
  totalMinutes: number
  status: AttendanceStatus
}

export interface EmployeeProfile {
  user_id: string
  employee_number: string
  full_name: string
  role: 'employee' | 'admin' | 'reviewer'
  department: { name: string } | null
  work_category: { name: string; regular_minutes: number } | null
}
