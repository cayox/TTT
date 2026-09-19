import type { Session } from '@shared/types'

/**
 * Decide the end timestamp for an open session left over from a previous run.
 * Returns null if the session is not stale (started today or later).
 * Ends at the last heartbeat (clamped to [start, now]); falls back to start when no heartbeat.
 */
export function staleSessionEnd(s: Session, heartbeat: number | null, dayStart: number, now: number): number | null {
  if (s.endTs !== null || s.startTs >= dayStart) return null
  const hb = heartbeat ?? s.startTs
  return Math.min(Math.max(hb, s.startTs), now)
}
