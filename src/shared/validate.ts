import type { Session } from './types'
import { intersects } from './intervals'
import { formatClock } from './format'

/** Longest a single session may be. */
export const MAX_SESSION_MS = 24 * 3600000
/** Clock drift allowed for "now" (an end time a few seconds ahead is fine). */
const SLACK_MS = 60000

/** A session that would break the data rules: overlaps, backwards times, the future. Thrown by the repos. */
export class SessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionError'
  }
}

const when = (ts: number, now: number): string => {
  const d = new Date(ts)
  const sameDay = new Date(now).toDateString() === d.toDateString()
  return sameDay ? formatClock(ts) : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${formatClock(ts)}`
}

/**
 * Why a session with these times cannot be saved, or null when it can.
 * `others` are the existing sessions (the one being edited already left out).
 */
export function sessionProblem(s: { startTs: number; endTs: number | null }, others: Session[], now: number): string | null {
  if (!Number.isFinite(s.startTs)) return 'The start time is missing'
  if (s.endTs !== null && !Number.isFinite(s.endTs)) return 'The end time is missing'
  if (s.startTs > now + SLACK_MS) return 'The start is in the future'
  if (s.endTs !== null) {
    if (s.endTs <= s.startTs) return 'The end must be after the start'
    if (s.endTs > now + SLACK_MS) return 'The end is in the future'
    if (s.endTs - s.startTs > MAX_SESSION_MS) return 'A session cannot be longer than 24 hours'
  } else if (others.some((o) => o.endTs === null)) return 'Another session is already running'
  const end = s.endTs ?? now
  const clash = others.filter((o) => intersects(s.startTs, end, o.startTs, o.endTs ?? Math.max(now, o.startTs + 1))).sort((x, y) => x.startTs - y.startTs)[0]
  if (clash) return `It overlaps the session ${when(clash.startTs, now)}–${clash.endTs ? formatClock(clash.endTs) : 'now'}`
  return null
}
