import { describe, expect, it } from 'vitest'
import {
  addDays, dateKey, dayBalance, expectedMinutesForDay, rangeStats, splitSessionsByDay,
  startOfDay, totalBalance, weekdayIndex, weeklyTotals, workedMinutesByDay
} from './time'
import { formatClock, formatDelta, formatDuration, formatDurationLong } from './format'
import { DEFAULT_SCHEDULE, DEFAULT_SETTINGS, type Session } from './types'

const t = (y: number, m: number, d: number, h = 0, mi = 0): number => new Date(y, m - 1, d, h, mi).getTime()
const sess = (start: number, end: number | null, id = 1): Session => ({ id, startTs: start, endTs: end, source: 'manual', note: '' })
const S = DEFAULT_SETTINGS

describe('date helpers', () => {
  it('dateKey / startOfDay / addDays / weekday', () => {
    expect(dateKey(t(2026, 1, 5, 23, 59))).toBe('2026-01-05')
    expect(startOfDay(t(2026, 1, 5, 13))).toBe(t(2026, 1, 5))
    expect(startOfDay('2026-01-05')).toBe(t(2026, 1, 5))
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(weekdayIndex('2026-09-14')).toBe(0) // Monday
    expect(weekdayIndex('2026-09-20')).toBe(6)
  })
  it('addDays across DST change', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
  })
})

describe('sessions', () => {
  it('splits midnight-crossing sessions', () => {
    const segs = splitSessionsByDay([sess(t(2026, 9, 14, 22), t(2026, 9, 15, 2))], t(2026, 9, 16))
    expect(segs.map((s) => s.date)).toEqual(['2026-09-14', '2026-09-15'])
    expect(workedMinutesByDay([sess(t(2026, 9, 14, 22), t(2026, 9, 15, 2))], 0)).toEqual({
      '2026-09-14': 120, '2026-09-15': 120
    })
  })
  it('open session counts until now', () => {
    expect(workedMinutesByDay([sess(t(2026, 9, 14, 9), null)], t(2026, 9, 14, 10, 30))).toEqual({ '2026-09-14': 90 })
  })
  it('spans multiple days and ignores empty', () => {
    const w = workedMinutesByDay([sess(t(2026, 9, 14, 12), t(2026, 9, 17, 12)), sess(5, 5, 2)], 0)
    expect(w['2026-09-15']).toBe(1440)
    expect(Object.keys(w)).toHaveLength(4)
  })
  it('DST day has 23 hours in local time (when zone observes DST)', () => {
    // Whole-day span of the local day; DST-independent assertion using real day length
    const day = '2026-03-29'
    const len = (startOfDay(addDays(day, 1)) - startOfDay(day)) / 60000
    const w = workedMinutesByDay([sess(startOfDay(day), startOfDay(addDays(day, 1)))], 0)
    expect(w[day]).toBe(len)
    expect(Object.keys(w)).toEqual([day])
  })
  it('empty', () => {
    expect(workedMinutesByDay([], 0)).toEqual({})
  })
})

describe('expected / balance', () => {
  const mon = '2026-09-14'
  const sat = '2026-09-19'
  it('schedule and no override', () => {
    expect(expectedMinutesForDay(mon, DEFAULT_SCHEDULE, null, S).expectedMin).toBe(480)
    expect(expectedMinutesForDay(sat, DEFAULT_SCHEDULE, undefined, S).expectedMin).toBe(0)
  })
  it('credited vacation: worked = expected, delta 0', () => {
    const d = dayBalance(mon, 0, DEFAULT_SCHEDULE, { date: mon, kind: 'vacation', expectedMinutes: null }, S)
    expect(d).toMatchObject({ workedMin: 480, expectedMin: 480, deltaMin: 0, credited: true })
  })
  it('credited vacation with extra work gives overtime', () => {
    const d = dayBalance(mon, 600, DEFAULT_SCHEDULE, { date: mon, kind: 'holiday', expectedMinutes: null }, S)
    expect(d.deltaMin).toBe(120)
  })
  it('non-credited kind: expected 0', () => {
    const s = { ...S, creditKinds: [] }
    const d = dayBalance(mon, 0, DEFAULT_SCHEDULE, { date: mon, kind: 'sick', expectedMinutes: null }, s)
    expect(d).toMatchObject({ expectedMin: 0, workedMin: 0, deltaMin: 0, credited: false })
  })
  it('custom expectedMinutes replaces', () => {
    const d = dayBalance(mon, 200, DEFAULT_SCHEDULE, { date: mon, kind: 'custom', expectedMinutes: 240 }, S)
    expect(d).toMatchObject({ expectedMin: 240, workedMin: 200, deltaMin: -40 })
  })
})

describe('rangeStats', () => {
  const now = t(2026, 9, 18, 18) // Friday
  const first = t(2026, 9, 14, 9)
  const sessions = [
    sess(t(2026, 9, 14, 9), t(2026, 9, 14, 18), 1), // 540 (+60)
    sess(t(2026, 9, 15, 9), t(2026, 9, 15, 15), 2) // 360 (-120)
  ]
  const overrides = [{ date: '2026-09-16', kind: 'vacation' as const, expectedMinutes: null }]
  it('all: excludes days before first and after today', () => {
    const r = rangeStats('all', sessions, DEFAULT_SCHEDULE, overrides, S, now, first)
    expect(r.days.map((d) => d.date)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'])
    expect(r.totalWorked).toBe(540 + 360 + 480)
    expect(r.totalExpected).toBe(5 * 480)
    expect(r.balance).toBe(60 - 120 - 480 - 480)
    expect(r.overtimeDays).toBe(1)
    expect(r.undertimeDays).toBe(3)
    expect(r.bestDay?.date).toBe('2026-09-14')
    expect(r.longestStreak).toBe(3)
    expect(r.avgWorkedPerWorkday).toBe((540 + 360 + 0 + 0) / 4)
    expect(totalBalance(sessions, DEFAULT_SCHEDULE, overrides, S, now, first)).toBe(r.balance)
  })
  it('7d has 7 days ending today', () => {
    const r = rangeStats('7d', sessions, DEFAULT_SCHEDULE, overrides, S, now, first)
    expect(r.days).toHaveLength(7)
    expect(r.days[6].date).toBe('2026-09-18')
    expect(rangeStats('1y', [], DEFAULT_SCHEDULE, [], S, now, null).days).toHaveLength(365)
  })
  it('empty data', () => {
    const r = rangeStats('all', [], DEFAULT_SCHEDULE, [], S, now, null)
    expect(r).toMatchObject({ days: [], totalWorked: 0, balance: 0, bestDay: null, longestStreak: 0, avgWorkedPerWorkday: 0 })
  })
  it('weeklyTotals groups by week start', () => {
    const r = rangeStats('all', sessions, DEFAULT_SCHEDULE, [], S, t(2026, 9, 21, 12), first)
    const mon = weeklyTotals(r.days, 0)
    expect(mon.map((w) => w.weekStart)).toEqual(['2026-09-14', '2026-09-21'])
    expect(mon[0].workedMin).toBe(900)
    const sun = weeklyTotals(r.days, 6)
    expect(sun.map((w) => w.weekStart)).toEqual(['2026-09-13', '2026-09-20'])
  })
})

describe('format', () => {
  it('duration', () => {
    expect(formatDuration(485)).toBe('8:05')
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDurationLong(485)).toBe('8h 5m')
  })
  it('delta', () => {
    expect(formatDelta(65)).toBe('+1:05')
    expect(formatDelta(-30)).toBe('−0:30')
    expect(formatDelta(0)).toBe('0:00')
  })
  it('clock', () => {
    expect(formatClock(t(2026, 1, 1, 7, 5))).toBe('07:05')
  })
})
