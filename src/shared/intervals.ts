import type { Session } from './types'

export interface Interval {
  a: number
  b: number
}

/** Sorted, non-overlapping union of the intervals (touching ones are merged). Empty ones are dropped. */
export function union(list: Interval[]): Interval[] {
  const sorted = list.filter((x) => x.b > x.a).sort((x, y) => x.a - y.a)
  const out: Interval[] = []
  for (const x of sorted) {
    const last = out[out.length - 1]
    if (last && x.a <= last.b) last.b = Math.max(last.b, x.b)
    else out.push({ a: x.a, b: x.b })
  }
  return out
}

/** Total length of the union, so time covered twice only counts once. */
export function unionLength(list: Interval[]): number {
  return union(list).reduce((acc, x) => acc + (x.b - x.a), 0)
}

/** True when [a1, b1) and [a2, b2) share any time. */
export const intersects = (a1: number, b1: number, a2: number, b2: number): boolean => a1 < b2 && a2 < b1

/** Ids of sessions that overlap another one. Running sessions run until `now`. */
export function overlappingIds(sessions: Session[], now: number): Set<number> {
  const out = new Set<number>()
  const sorted = [...sessions].sort((x, y) => x.startTs - y.startTs)
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    const sEnd = s.endTs ?? now
    for (let j = i + 1; j < sorted.length; j++) {
      const t = sorted[j]
      if (t.startTs >= sEnd) break
      if (intersects(s.startTs, sEnd, t.startTs, t.endTs ?? now)) (out.add(s.id), out.add(t.id))
    }
  }
  return out
}
