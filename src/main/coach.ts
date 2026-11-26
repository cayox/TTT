import { checkBreaks, BREAK_MIN_CHUNK, MAX_DAY_MIN } from '@shared/breaks'
import { union, type Interval } from '@shared/intervals'
import { formatDurationLong } from '@shared/format'

export type ReminderKind = 'target' | 'breaks'

export interface Reminder {
  /** Sent at most once a day per key. */
  key: string
  kind: ReminderKind
  title: string
  body: string
}

/** Minutes of work since the last break of 15 min or more (0 when not working). */
export function currentStretch(work: Interval[], now: number): number {
  const u = union(work)
  if (!u.length || u[u.length - 1].b < now - 60000) return 0
  let start = u[u.length - 1].a
  for (let i = u.length - 2; i >= 0; i--) {
    if ((start - u[i].b) / 60000 >= BREAK_MIN_CHUNK) break
    start = u[i].a
  }
  return (now - start) / 60000
}

/**
 * Reminders that apply right now, given today's work (running session up to now included).
 * The caller sends each key once a day.
 */
export function dueReminders(o: {
  now: number
  work: Interval[]
  running: boolean
  expectedMin: number
  credited: boolean
  breakRules: boolean
  countedMin?: number
}): Reminder[] {
  if (!o.running) return []
  const out: Reminder[] = []
  const c = checkBreaks(o.work)
  const counted = o.countedMin ?? c.workedMin
  if (o.expectedMin > 0 && !o.credited && counted >= o.expectedMin)
    out.push({
      key: 'target',
      kind: 'target',
      title: "Today's hours are done",
      body: `${formatDurationLong(counted)} worked. Anything from now on is overtime.`
    })
  if (!o.breakRules) return out
  const stretch = currentStretch(o.work, o.now)
  if (stretch >= 5 * 60 + 45 && c.breakMin < 30)
    out.push({
      key: 'stretch',
      kind: 'breaks',
      title: 'Break due soon',
      body: `${formatDurationLong(stretch)} without a break. The law allows at most 6 hours in a row.`
    })
  if (c.workedMin >= 6 * 60 && c.breakMin < 30)
    out.push({
      key: 'b30',
      kind: 'breaks',
      title: 'Time for a break',
      body: `After 6 hours of work, 30 minutes of breaks are required. You have had ${Math.round(c.breakMin)} so far.`
    })
  if (c.workedMin >= 9 * 60 && c.breakMin < 45)
    out.push({
      key: 'b45',
      kind: 'breaks',
      title: 'Another break is due',
      body: `After 9 hours of work, 45 minutes of breaks are required. You have had ${Math.round(c.breakMin)} so far.`
    })
  if (c.workedMin >= MAX_DAY_MIN - 15)
    out.push({ key: 'max', kind: 'breaks', title: 'Almost 10 hours today', body: 'Ten hours of work a day is the legal maximum. Time to wrap up.' })
  return out
}
