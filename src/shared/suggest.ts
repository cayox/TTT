import { weekdayIndex, dateKey, startOfDay } from './time'
import type { Session } from './types'

const WEEKS = 8
const HOUR = 3600000

/**
 * The project you usually work on at this time: same weekday, within an hour either side, over the
 * last 8 weeks. Needs at least two different days with that project to count as a habit.
 */
export function suggestProject(sessions: Session[], now: number, activeIds: number[]): number | null {
  const wd = weekdayIndex(dateKey(now))
  const tod = now - startOfDay(now)
  const since = now - WEEKS * 7 * 864e5
  const minutes = new Map<number, number>()
  const days = new Map<number, Set<string>>()
  for (const s of sessions) {
    if (s.projectId == null || !activeIds.includes(s.projectId) || s.endTs === null || s.startTs < since) continue
    const date = dateKey(s.startTs)
    if (weekdayIndex(date) !== wd || date === dateKey(now)) continue
    const day = startOfDay(s.startTs)
    const a = Math.max(s.startTs, day + tod - HOUR)
    const b = Math.min(s.endTs, day + tod + HOUR)
    if (b <= a) continue
    minutes.set(s.projectId, (minutes.get(s.projectId) ?? 0) + (b - a) / 60000)
    ;(days.get(s.projectId) ?? days.set(s.projectId, new Set()).get(s.projectId)!).add(date)
  }
  let best: number | null = null
  for (const [id, m] of minutes) if ((days.get(id)?.size ?? 0) >= 2 && (best === null || m > minutes.get(best)!)) best = id
  return best
}
