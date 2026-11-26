import { addDays, expectedMinutesForDay } from './time'
import type { DayOverride, Schedule, Settings } from './types'

/**
 * Past workdays with nothing tracked and no day off marked: probably forgotten. `from` is the first
 * day to look at (inclusive), `today` is never included since it is still going.
 */
export function missingDays(o: {
  from: string
  today: string
  worked: Record<string, number>
  schedule: Schedule
  overrides: DayOverride[]
  settings: Pick<Settings, 'creditKinds'>
}): string[] {
  const ov = new Map(o.overrides.map((x) => [x.date, x]))
  const out: string[] = []
  for (let d = o.from; d < o.today; d = addDays(d, 1)) {
    if (ov.has(d) || (o.worked[d] ?? 0) > 0) continue
    if (expectedMinutesForDay(d, o.schedule, undefined, o.settings).expectedMin > 0) out.push(d)
  }
  return out
}
