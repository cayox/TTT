import { addDays, dateKey, dayBalance, expectedMinutesForDay, projectTotals, startOfDay, workedMinutesByDay } from './time'
import type { DayOverride, Schedule, Session, Settings } from './types'

/**
 * Monthly hours from a work contract with flextime (Gleitzeit): the month's total is what counts,
 * spread over the days however you like. "Pace" is the share of the monthly hours due so far,
 * distributed like the weekly schedule, so being ahead or behind it is this month's flextime.
 */
export interface MonthHours {
  /** 'YYYY-MM' */
  month: string
  /** Hours due this month, in minutes (the sum of the project hours when split by project). */
  contractMin: number
  /** Counted so far (credited days count as their expected time). */
  countedMin: number
  remainingMin: number
  /** Scheduled workdays from today to month end, today included. */
  workdaysLeft: number
  /** What each remaining workday needs to average to finish the month. */
  perWorkdayMin: number
  /** What the weekly schedule adds up to for the whole month (a sensible default). */
  scheduleMin: number
  /** Counted minus pace, for the days before today. */
  flexBeforeTodayMin: number
  /** Counted today, and today's share of the monthly hours. Flextime now = before + max(0, today - share). */
  todayCountedMin: number
  todayShareMin: number
  /** Per project, when the hours are split by project. Counted is actual time on the project. */
  projects: { projectId: number; contractMin: number; countedMin: number }[]
}

export interface MonthTotal {
  month: string
  countedMin: number
  scheduleMin: number
}

const pad = (n: number): string => String(n).padStart(2, '0')
const monthStart = (y: number, m: number): string => dateKey(new Date(y, m, 1).getTime())

interface Input {
  sessions: Session[]
  schedule: Schedule
  overrides: DayOverride[]
  settings: Pick<Settings, 'creditKinds'>
  now: number
}

/** Counted and scheduled minutes per day for one month, only counting days up to today. */
function monthDays(o: Input, y: number, m: number, worked: Record<string, number>) {
  const ov = new Map(o.overrides.map((x) => [x.date, x]))
  const today = dateKey(o.now)
  const first = monthStart(y, m)
  const next = monthStart(y, m + 1)
  const days: { date: string; countedMin: number; expectedMin: number }[] = []
  for (let d = first; d < next; d = addDays(d, 1)) {
    const stat = dayBalance(d, worked[d] ?? 0, o.schedule, ov.get(d), o.settings)
    days.push({ date: d, countedMin: d <= today ? stat.workedMin : 0, expectedMin: expectedMinutesForDay(d, o.schedule, ov.get(d), o.settings).expectedMin })
  }
  return days
}

/** Progress through the monthly hours for the month containing `now`. projectMin (id -> minutes) splits them by project. */
export function monthHours(o: Input & { contractMin: number; projectMin?: Record<string, number> | null }): MonthHours {
  const d = new Date(o.now)
  const y = d.getFullYear()
  const m = d.getMonth()
  const today = dateKey(o.now)
  const days = monthDays(o, y, m, workedMinutesByDay(o.sessions, o.now))

  const split = o.projectMin ? Object.entries(o.projectMin).filter(([, v]) => v > 0) : null
  const contractMin = split ? split.reduce((a, [, v]) => a + v, 0) : o.contractMin
  const countedMin = days.reduce((a, x) => a + x.countedMin, 0)
  const scheduleMin = days.reduce((a, x) => a + x.expectedMin, 0)

  // Pace follows the schedule; without one, every calendar day carries the same share.
  const weight = (x: { expectedMin: number }): number => (scheduleMin > 0 ? x.expectedMin : 1)
  const totalWeight = scheduleMin > 0 ? scheduleMin : days.length
  const share = (x: { expectedMin: number }): number => (contractMin * weight(x)) / totalWeight

  let workdaysLeft = 0
  let flexBeforeTodayMin = 0
  let todayCountedMin = 0
  let todayShareMin = 0
  for (const x of days) {
    if (x.date < today) flexBeforeTodayMin += x.countedMin - share(x)
    else if (x.date === today) ((todayCountedMin = x.countedMin), (todayShareMin = share(x)))
    if (x.date >= today && x.expectedMin > 0) workdaysLeft++
  }
  const remainingMin = Math.max(0, contractMin - countedMin)

  const from = startOfDay(monthStart(y, m))
  const worked = new Map(projectTotals(o.sessions, from, o.now, o.now).map((t) => [t.projectId, t.minutes]))
  return {
    month: `${y}-${pad(m + 1)}`,
    contractMin,
    countedMin,
    remainingMin,
    workdaysLeft,
    perWorkdayMin: workdaysLeft ? remainingMin / workdaysLeft : remainingMin,
    scheduleMin,
    flexBeforeTodayMin,
    todayCountedMin,
    todayShareMin,
    projects: (split ?? []).map(([id, v]) => ({ projectId: Number(id), contractMin: v, countedMin: worked.get(Number(id)) ?? 0 }))
  }
}

/** Flextime right now: today only adds once its share is covered, so a day in progress never reads as behind. */
export function flexNow(h: Pick<MonthHours, 'flexBeforeTodayMin' | 'todayShareMin'>, todayCountedMin: number): number {
  return h.flexBeforeTodayMin + Math.max(0, todayCountedMin - h.todayShareMin)
}

/** The monthly hours in effect: one total, or the sum over active projects when split by project. 0 = not tracked. */
export function contractMinutes(s: Pick<Settings, 'monthlyHoursMin' | 'monthlyHoursByProject' | 'projectMonthlyMin'>, activeProjectIds: number[]): number {
  if (!s.monthlyHoursByProject) return s.monthlyHoursMin
  return activeProjectIds.reduce((a, id) => a + (s.projectMonthlyMin[String(id)] ?? 0), 0)
}

/** Counted and scheduled totals for the last `count` months, oldest first, current month last. */
export function monthTotals(o: Input & { count: number }): MonthTotal[] {
  const d = new Date(o.now)
  const worked = workedMinutesByDay(o.sessions, o.now)
  const out: MonthTotal[] = []
  for (let i = o.count - 1; i >= 0; i--) {
    const at = new Date(d.getFullYear(), d.getMonth() - i, 1)
    const days = monthDays(o, at.getFullYear(), at.getMonth(), worked)
    out.push({
      month: `${at.getFullYear()}-${pad(at.getMonth() + 1)}`,
      countedMin: days.reduce((a, x) => a + x.countedMin, 0),
      scheduleMin: days.reduce((a, x) => a + x.expectedMin, 0)
    })
  }
  return out
}
