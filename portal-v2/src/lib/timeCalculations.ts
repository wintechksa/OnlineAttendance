export interface WorkRuleInput {
  workDate: string
  reportedMinutes: number
  regularMinutes: number
  breakMinutes: number
  sourceAlreadyDeductedBreak: boolean
  isHoliday?: boolean
}

export interface WorkRuleResult {
  payableMinutes: number
  breakDeductedMinutes: number
  basicMinutes: number
  overtimeMinutes: number
  allOvertime: boolean
}

export function isFriday(date: string): boolean {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 5
}

export function calculateWorkMinutes(input: WorkRuleInput): WorkRuleResult {
  const reported = Math.max(0, Math.round(input.reportedMinutes))
  const breakDeductedMinutes = input.sourceAlreadyDeductedBreak
    ? 0
    : Math.min(reported, Math.max(0, Math.round(input.breakMinutes)))
  const payableMinutes = Math.max(0, reported - breakDeductedMinutes)
  const allOvertime = Boolean(input.isHoliday) || isFriday(input.workDate)
  const regularLimit = Math.max(0, Math.round(input.regularMinutes))

  return {
    payableMinutes,
    breakDeductedMinutes,
    basicMinutes: allOvertime ? 0 : Math.min(payableMinutes, regularLimit),
    overtimeMinutes: allOvertime ? payableMinutes : Math.max(0, payableMinutes - regularLimit),
    allOvertime,
  }
}

export function minutesToHours(minutes: number): string {
  return (minutes / 60).toFixed(2)
}
