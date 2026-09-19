import type { DayOverride, Schedule, Session, Settings } from './types'

export type Range = '7d' | '30d' | '90d' | '1y' | 'all'

export interface DaySegment {
  date: string
  startTs: number
  endTs: number
}

export interface DayStat {
  date: string
  workedMin: number
  expectedMin: number
  deltaMin: number
  credited: boolean
}

export interface RangeStats {
  days: DayStat[]
  totalWorked: number
  totalExpected: number
  balance: number
  avgWorkedPerWorkday: number
  overtimeDays: number
  undertimeDays: number
  bestDay: DayStat | null
  longestStreak: number
}

export interface WeekTotal {
  weekStart: string
  workedMin: number
  expectedMin: number
  deltaMin: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local 'YYYY-MM-DD' for an epoch ms. */
export function dateKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m - 1, d]
}

/** Epoch ms of local midnight of the day containing ts (or of a 'YYYY-MM-DD'). */
export function startOfDay(tsOrDate: number | string): number {
  if (typeof tsOrDate === 'string') {
    const [y, m, d] = parseDate(tsOrDate)
    return new Date(y, m, d).getTime()
  }
  const d = new Date(tsOrDate)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Calendar-day arithmetic (DST safe). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = parseDate(date)
  return dateKey(new Date(y, m, d + n).getTime())
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = parseDate(date)
  return (new Date(y, m, d).getDay() + 6) % 7
}

/** Split sessions at local midnights. Open sessions run until `now`. */
export function splitSessionsByDay(sessions: Session[], now: number): DaySegment[] {
  const out: DaySegment[] = []
  for (const s of sessions) {
    const end = s.endTs ?? now
    if (end <= s.startTs) continue
    let cur = s.startTs
    let date = dateKey(cur)
    while (cur < end) {
      const next = startOfDay(addDays(date, 1))
      const segEnd = Math.min(end, next)
      out.push({ date, startTs: cur, endTs: segEnd })
      cur = segEnd
      date = addDays(date, 1)
    }
  }
  return out
}

/** Minutes worked per local date (rounded to whole minutes per day). */
export function workedMinutesByDay(sessions: Session[], now: number): Record<string, number> {
  const ms: Record<string, number> = {}
  for (const seg of splitSessionsByDay(sessions, now)) {
    ms[seg.date] = (ms[seg.date] ?? 0) + (seg.endTs - seg.startTs)
  }
  const out: Record<string, number> = {}
  for (const k of Object.keys(ms)) out[k] = Math.round(ms[k] / 60000)
  return out
}

/**
 * Expected minutes for a day.
 * - override.expectedMinutes (non-null) replaces the weekly schedule value
 * - override without expectedMinutes: kind credited => schedule value, else 0
 * - `credited` is true when override.kind is in settings.creditKinds; the caller
 *   then counts worked = max(actual, expected).
 */
export function expectedMinutesForDay(
  date: string,
  schedule: Schedule,
  override: DayOverride | undefined | null,
  settings: Pick<Settings, 'creditKinds'>
): { expectedMin: number; credited: boolean } {
  const base = schedule[weekdayIndex(date)] ?? 0
  if (!override) return { expectedMin: base, credited: false }
  const credited = settings.creditKinds.includes(override.kind)
  if (override.expectedMinutes != null) return { expectedMin: override.expectedMinutes, credited }
  return { expectedMin: credited ? base : 0, credited }
}

export function dayBalance(
  date: string,
  actualWorkedMin: number,
  schedule: Schedule,
  override: DayOverride | undefined | null,
  settings: Pick<Settings, 'creditKinds'>
): DayStat {
  const { expectedMin, credited } = expectedMinutesForDay(date, schedule, override, settings)
  const workedMin = credited ? Math.max(actualWorkedMin, expectedMin) : actualWorkedMin
  return { date, workedMin, expectedMin, deltaMin: workedMin - expectedMin, credited }
}

function rangeDays(range: Range): number | null {
  return { '7d': 7, '30d': 30, '90d': 90, '1y': 365, all: null }[range]
}

export function rangeStats(
  range: Range,
  sessions: Session[],
  schedule: Schedule,
  overrides: DayOverride[],
  settings: Pick<Settings, 'creditKinds'>,
  now: number,
  firstStartTs: number | null
): RangeStats {
  const today = dateKey(now)
  const n = rangeDays(range)
  let from: string
  if (n !== null) from = addDays(today, -(n - 1))
  else if (firstStartTs == null) from = addDays(today, 1) // empty
  else from = dateKey(firstStartTs)

  const worked = workedMinutesByDay(sessions, now)
  const ovMap = new Map(overrides.map((o) => [o.date, o]))
  const days: DayStat[] = []
  for (let d = from; d <= today; d = addDays(d, 1)) {
    days.push(dayBalance(d, worked[d] ?? 0, schedule, ovMap.get(d), settings))
  }

  let totalWorked = 0
  let totalExpected = 0
  let overtimeDays = 0
  let undertimeDays = 0
  let bestDay: DayStat | null = null
  let streak = 0
  let longestStreak = 0
  let workdayCount = 0
  let workdayWorked = 0
  for (const s of days) {
    totalWorked += s.workedMin
    totalExpected += s.expectedMin
    if (s.deltaMin > 0) overtimeDays++
    if (s.deltaMin < 0) undertimeDays++
    if (s.workedMin > 0 && (!bestDay || s.workedMin > bestDay.workedMin)) bestDay = s
    if (s.workedMin > 0) longestStreak = Math.max(longestStreak, ++streak)
    else streak = 0
    if (!s.credited && (s.expectedMin > 0 || s.workedMin > 0)) {
      workdayCount++
      workdayWorked += s.workedMin
    }
  }
  return {
    days,
    totalWorked,
    totalExpected,
    balance: totalWorked - totalExpected,
    avgWorkedPerWorkday: workdayCount ? workdayWorked / workdayCount : 0,
    overtimeDays,
    undertimeDays,
    bestDay,
    longestStreak
  }
}

/** Running overtime balance (minutes) since the first session, through today. */
export function totalBalance(
  sessions: Session[],
  schedule: Schedule,
  overrides: DayOverride[],
  settings: Pick<Settings, 'creditKinds'>,
  now: number,
  firstStartTs: number | null
): number {
  return rangeStats('all', sessions, schedule, overrides, settings, now, firstStartTs).balance
}

/** Group day stats into weeks. weekStart: 0 = Monday, 6 = Sunday. */
export function weeklyTotals(days: DayStat[], weekStart: 0 | 6 = 0): WeekTotal[] {
  const map = new Map<string, WeekTotal>()
  for (const s of days) {
    const idx = (weekdayIndex(s.date) - weekStart + 7) % 7
    const key = addDays(s.date, -idx)
    const w = map.get(key) ?? { weekStart: key, workedMin: 0, expectedMin: 0, deltaMin: 0 }
    w.workedMin += s.workedMin
    w.expectedMin += s.expectedMin
    w.deltaMin += s.deltaMin
    map.set(key, w)
  }
  return [...map.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
}
