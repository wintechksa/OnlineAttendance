import { describe, expect, it } from 'vitest'
import { normalizeEmployeeId, signupValidation } from './account'

describe('employee registration validation', () => {
  it('normalizes a valid employee ID', () => expect(normalizeEmployeeId(' wt-s-004 ')).toBe('WT-S-004'))
  it('rejects unsafe employee IDs', () => expect(signupValidation({ employeeId: 'x@y', fullName: 'Test User', password: 'long-password' })).toHaveProperty('error'))
  it('requires a strong minimum password length', () => expect(signupValidation({ employeeId: 'WT-100', fullName: 'Test User', password: 'short' })).toHaveProperty('error'))
  it('accepts valid signup input', () => expect(signupValidation({ employeeId: 'WT-100', fullName: 'Test User', password: 'long-password' })).toHaveProperty('value.employeeId', 'WT-100'))
})
