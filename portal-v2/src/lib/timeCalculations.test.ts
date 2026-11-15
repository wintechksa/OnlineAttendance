import { describe, expect, it } from 'vitest'
import { calculateWorkMinutes, isFriday } from './timeCalculations'

describe('timesheet work rules', () => {
  it('splits regular and overtime using the employee category', () => {
    expect(calculateWorkMinutes({
      workDate: '2026-11-12', reportedMinutes: 660, regularMinutes: 600,
      breakMinutes: 60, sourceAlreadyDeductedBreak: true,
    })).toMatchObject({ basicMinutes: 600, overtimeMinutes: 60, breakDeductedMinutes: 0 })
  })

  it('deducts the full configured break exactly once', () => {
    const raw = calculateWorkMinutes({
      workDate: '2026-11-12', reportedMinutes: 660, regularMinutes: 600,
      breakMinutes: 60, sourceAlreadyDeductedBreak: false,
    })
    const alreadyDeducted = calculateWorkMinutes({
      workDate: '2026-11-12', reportedMinutes: 600, regularMinutes: 600,
      breakMinutes: 60, sourceAlreadyDeductedBreak: true,
    })
    expect(raw.payableMinutes).toBe(600)
    expect(alreadyDeducted.payableMinutes).toBe(600)
  })

  it('classifies every Friday minute as overtime', () => {
    expect(isFriday('2026-11-13')).toBe(true)
    expect(calculateWorkMinutes({
      workDate: '2026-11-13', reportedMinutes: 480, regularMinutes: 480,
      breakMinutes: 0, sourceAlreadyDeductedBreak: true,
    })).toMatchObject({ basicMinutes: 0, overtimeMinutes: 480, allOvertime: true })
  })

  it('classifies every holiday minute as overtime', () => {
    expect(calculateWorkMinutes({
      workDate: '2026-09-23', reportedMinutes: 600, regularMinutes: 600,
      breakMinutes: 0, sourceAlreadyDeductedBreak: true, isHoliday: true,
    })).toMatchObject({ basicMinutes: 0, overtimeMinutes: 600, allOvertime: true })
  })

  it('never returns negative minutes', () => {
    expect(calculateWorkMinutes({
      workDate: '2026-11-12', reportedMinutes: 30, regularMinutes: 480,
      breakMinutes: 60, sourceAlreadyDeductedBreak: false,
    })).toMatchObject({ payableMinutes: 0, basicMinutes: 0, overtimeMinutes: 0 })
  })
})
