import { union, type Interval } from './intervals'

/**
 * Break rules of the German Working Hours Act (ArbZG):
 * - §4: more than 6 h of work needs 30 min of breaks, more than 9 h needs 45 min;
 *   only breaks of at least 15 min count, and no one works more than 6 h in a row without one.
 * - §3: no more than 10 h of work a day.
 */
export const BREAK_MIN_CHUNK = 15
export const MAX_STRETCH_MIN = 6 * 60
export const MAX_DAY_MIN = 10 * 60

/** Break required for this much work, in minutes. */
export function requiredBreak(workedMin: number): number {
  return workedMin > 9 * 60 ? 45 : workedMin > 6 * 60 ? 30 : 0
}

export interface BreakCheck {
  /** Union of the day's work, in minutes. */
  workedMin: number
  /** Gaps of at least 15 min between work, in minutes. */
  breakMin: number
  requiredMin: number
  /** Break still owed for the work done. */
  missingMin: number
  /** Longest run of work without a 15 min break. */
  longestStretchMin: number
  /** Something on this day breaks a rule. */
  violation: boolean
  overMax: boolean
  stretchTooLong: boolean
}

/** Checks one day's work (intervals in epoch ms, already clipped to the day). */
export function checkBreaks(work: Interval[]): BreakCheck {
  const u = union(work)
  const workedMin = u.reduce((a, x) => a + (x.b - x.a), 0) / 60000
  let breakMin = 0
  let stretch = 0
  let longest = 0
  for (let i = 0; i < u.length; i++) {
    if (i > 0) {
      const gap = (u[i].a - u[i - 1].b) / 60000
      if (gap >= BREAK_MIN_CHUNK) ((breakMin += gap), (stretch = 0))
    }
    stretch += (u[i].b - u[i].a) / 60000
    longest = Math.max(longest, stretch)
  }
  const requiredMin = requiredBreak(workedMin)
  const missingMin = Math.max(0, requiredMin - breakMin)
  const overMax = workedMin > MAX_DAY_MIN
  const stretchTooLong = longest > MAX_STRETCH_MIN
  return {
    workedMin,
    breakMin,
    requiredMin,
    missingMin,
    longestStretchMin: longest,
    violation: missingMin > 0.5 || overMax || stretchTooLong,
    overMax,
    stretchTooLong
  }
}

/**
 * Minutes to take off a day so the remaining work and its breaks satisfy §4, the way payroll systems
 * deduct a missed break. Never takes the day below the threshold that made the break necessary
 * (6 h 10 min with no break becomes 6 h, not 5 h 40 min).
 */
export function breakDeduction(workedMin: number, breakMin: number): number {
  const need30 = Math.max(0, 30 - breakMin)
  const need45 = Math.max(0, 45 - breakMin)
  if (workedMin > 9 * 60) return Math.min(need45, Math.max(need30, workedMin - 9 * 60))
  if (workedMin > 6 * 60) return Math.min(need30, workedMin - 6 * 60)
  return 0
}
