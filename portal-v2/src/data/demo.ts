import type { EmployeeProfile, TimesheetRow } from '../types'

export const demoProfile: EmployeeProfile = {
  user_id: 'demo',
  employee_number: 'WT-S-004',
  full_name: 'Maynard Perey',
  role: 'employee',
  active: true,
  status: 'active',
  department: { name: 'ADMIN' },
  work_category: { name: 'Staff', regular_minutes: 600 },
}

export const demoRows: TimesheetRow[] = [
  { id: '1', workDate: '2026-11-09', amIn: '07:02', amOut: '12:01', pmIn: '13:00', pmOut: '18:04', basicMinutes: 600, overtimeMinutes: 3, totalMinutes: 603, status: 'complete' },
  { id: '2', workDate: '2026-11-10', amIn: '06:58', amOut: '12:00', pmIn: '12:58', pmOut: '18:00', basicMinutes: 600, overtimeMinutes: 4, totalMinutes: 604, status: 'complete' },
  { id: '3', workDate: '2026-11-11', amIn: '07:04', amOut: '12:03', pmIn: '13:00', pmOut: '17:58', basicMinutes: 597, overtimeMinutes: 0, totalMinutes: 597, status: 'complete' },
  { id: '4', workDate: '2026-11-12', amIn: '07:00', amOut: '12:00', pmIn: null, pmOut: null, basicMinutes: 300, overtimeMinutes: 0, totalMinutes: 300, status: 'incomplete' },
  { id: '5', workDate: '2026-11-13', amIn: '07:01', amOut: '12:00', pmIn: '13:00', pmOut: '17:01', basicMinutes: 0, overtimeMinutes: 540, totalMinutes: 540, status: 'friday' },
]
