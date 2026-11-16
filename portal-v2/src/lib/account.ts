export type AccountStatus = 'pending' | 'active' | 'rejected' | 'exited'

export function normalizeEmployeeId(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidEmployeeId(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalizeEmployeeId(value))
}

export function signupValidation(input: { employeeId?: unknown; fullName?: unknown; password?: unknown }) {
  const employeeId = typeof input.employeeId === 'string' ? normalizeEmployeeId(input.employeeId) : ''
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim().replace(/\s+/g, ' ') : ''
  const password = typeof input.password === 'string' ? input.password : ''
  if (!isValidEmployeeId(employeeId)) return { error: 'Enter a valid employee ID.' } as const
  if (fullName.length < 2 || fullName.length > 120) return { error: 'Enter the employee full name.' } as const
  if (password.length < 10 || password.length > 128) return { error: 'Password must be at least 10 characters.' } as const
  return { value: { employeeId, fullName, password } } as const
}
