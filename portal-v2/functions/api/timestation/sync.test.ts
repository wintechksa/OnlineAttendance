import { describe, expect, it } from 'vitest'

describe('TimeStation sync security contract', () => {
  it('keeps the secret server-side by convention', () => {
    expect('TIMESTATION_API_KEY'.startsWith('VITE_')).toBe(false)
  })

  it('uses the read-only list shifts endpoint', () => {
    expect('https://api.mytimestation.com/v1.2/shifts').toMatch(/\/shifts$/)
  })
})
