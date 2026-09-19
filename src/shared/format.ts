const pad = (n: number): string => String(n).padStart(2, '0')

/** 'H:MM' (e.g. 8:05). */
export function formatDuration(min: number): string {
  const m = Math.round(Math.abs(min))
  return `${min < 0 ? '−' : ''}${Math.floor(m / 60)}:${pad(m % 60)}`
}

/** 'Hh Mm' (e.g. 8h 5m). */
export function formatDurationLong(min: number): string {
  const m = Math.round(Math.abs(min))
  return `${min < 0 ? '−' : ''}${Math.floor(m / 60)}h ${m % 60}m`
}

/** '+1:05' / '−0:30' / '0:00'. */
export function formatDelta(min: number): string {
  const r = Math.round(min)
  if (r === 0) return '0:00'
  return `${r > 0 ? '+' : '−'}${formatDuration(Math.abs(r))}`
}

/** Local 'HH:MM'. */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
