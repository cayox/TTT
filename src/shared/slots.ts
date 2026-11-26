/** Minute grid for time pickers (Settings → time interval). */

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Minute values on the grid, e.g. step 15 -> [0, 15, 30, 45]. Invalid steps fall back to every minute. */
export function minuteOptions(step: number): number[] {
  const s = Number.isInteger(step) && step > 0 && step <= 60 && 60 % step === 0 ? step : 1
  return Array.from({ length: 60 / s }, (_, i) => i * s)
}

/** "HH:MM" rounded to the nearest grid slot (23:53 with step 15 stays on the same day as 23:45). */
export function snapClock(hhmm: string, step: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const opts = minuteOptions(step)
  const s = opts[1] ?? 60
  const total = Number(m[1]) * 60 + Number(m[2])
  const snapped = Math.min(23 * 60 + opts[opts.length - 1], Math.round(total / s) * s)
  return `${pad2(Math.floor(snapped / 60))}:${pad2(snapped % 60)}`
}

/** First grid slot at or after ts (local time), as epoch ms. */
export function nextSlot(ts: number, step: number): number {
  const s = (minuteOptions(step)[1] ?? 60) * 60000
  const d = new Date(ts)
  d.setSeconds(0, 0)
  const offset = d.getHours() * 3600000 + d.getMinutes() * 60000
  const dayStart = d.getTime() - offset
  return dayStart + Math.ceil((ts - dayStart) / s) * s
}
