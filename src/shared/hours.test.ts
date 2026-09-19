import { describe, expect, it } from 'vitest'
import { flexNow, monthHours, monthTotals } from './hours'
import { DEFAULT_SETTINGS, type Session } from './types'

// September 2026 starts on a Tuesday: 22 weekdays.
const t = (d: number, h: number, m = 8): number => new Date(2026, m, d, h).getTime()
const s = (id: number, a: number, b: number | null, projectId = 1): Session => ({ id, startTs: a, endTs: b, source: 'manual', note: '', projectId })
const base = {
  schedule: [480, 480, 480, 480, 480, 0, 0],
  overrides: [{ date: '2026-09-03', kind: 'vacation' as const, expectedMinutes: null }],
  settings: DEFAULT_SETTINGS
}

describe('monthHours', () => {
  it('counts worked and credited time, and spreads the rest over remaining workdays', () => {
    const h = monthHours({ ...base, contractMin: 160 * 60, sessions: [s(1, t(1, 9), t(1, 17)), s(2, t(2, 9), t(2, 13))], now: t(19, 18) })
    expect(h).toMatchObject({ month: '2026-09', contractMin: 9600, countedMin: 1200, remainingMin: 8400, workdaysLeft: 8, scheduleMin: 22 * 480 })
    expect(h.perWorkdayMin).toBe(1050)
  })
  it('measures flextime against the schedule-shaped pace', () => {
    // Contract equals the schedule, so each workday's share is 8h. Days 1-2 worked 12h, day 3 credited 8h, 11 more workdays before the 19th.
    const h = monthHours({ ...base, contractMin: 22 * 480, sessions: [s(1, t(1, 9), t(1, 17)), s(2, t(2, 9), t(2, 13))], now: t(19, 18) })
    expect(h.flexBeforeTodayMin).toBeCloseTo(1200 - 14 * 480)
    expect(h.todayShareMin).toBe(0) // Saturday
  })
  it('does not count a day in progress as behind', () => {
    const h = monthHours({ ...base, contractMin: 22 * 480, sessions: [s(1, t(21, 9), t(21, 12))], now: t(21, 12) })
    expect(h.todayCountedMin).toBe(180)
    expect(h.todayShareMin).toBe(480)
    expect(flexNow(h, 180)).toBe(h.flexBeforeTodayMin)
    expect(flexNow(h, 540)).toBe(h.flexBeforeTodayMin + 60)
  })
  it('splits by project and totals the project hours', () => {
    const h = monthHours({
      ...base,
      contractMin: 0,
      projectMin: { '1': 80 * 60, '2': 40 * 60, '3': 0 },
      sessions: [s(1, t(1, 9), t(1, 17), 1), s(2, t(2, 9), t(2, 11), 2)],
      now: t(19, 18)
    })
    expect(h.contractMin).toBe(120 * 60)
    expect(h.projects).toEqual([
      { projectId: 1, contractMin: 4800, countedMin: 480 },
      { projectId: 2, contractMin: 2400, countedMin: 120 }
    ])
  })
})

describe('monthTotals', () => {
  it('returns the last months oldest first with schedule totals', () => {
    const out = monthTotals({ ...base, sessions: [s(1, t(10, 9, 7), t(10, 17, 7)), s(2, t(1, 9), t(1, 17))], now: t(19, 18), count: 2 })
    expect(out).toEqual([
      { month: '2026-08', countedMin: 480, scheduleMin: 21 * 480 },
      { month: '2026-09', countedMin: 480 + 480, scheduleMin: 22 * 480 }
    ])
  })
})
