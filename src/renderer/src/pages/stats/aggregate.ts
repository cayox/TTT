import { weekdayIndex, weeklyTotals } from '../../../../shared/time'
import type { DayStat, Range } from '../../../../shared/time'
import type { BarDatum } from '../../components/ui'

export type ChartPoint = BarDatum & { expected: number }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const md = (date: string): string => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`

export function granularity(range: Range): 'day' | 'week' | 'month' {
  return range === '7d' || range === '30d' ? 'day' : range === 'all' ? 'month' : 'week'
}

/** Values in hours so the chart axis reads naturally. */
export function chartPoints(days: DayStat[], range: Range, delta: boolean): ChartPoint[] {
  const g = granularity(range)
  const pick = (w: number, e: number, d: number): number => (delta ? d : w) / 60
  if (g === 'day') return days.map((s) => ({ label: md(s.date), value: pick(s.workedMin, s.expectedMin, s.deltaMin), expected: s.expectedMin / 60 }))
  if (g === 'week') return weeklyTotals(days).map((w) => ({ label: md(w.weekStart), value: pick(w.workedMin, w.expectedMin, w.deltaMin), expected: w.expectedMin / 60 }))
  const map = new Map<string, { w: number; e: number; d: number }>()
  for (const s of days) {
    const k = s.date.slice(0, 7)
    const m = map.get(k) ?? { w: 0, e: 0, d: 0 }
    m.w += s.workedMin
    m.e += s.expectedMin
    m.d += s.deltaMin
    map.set(k, m)
  }
  return [...map.entries()].sort().map(([k, m]) => ({ label: `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}`, value: pick(m.w, m.e, m.d), expected: m.e / 60 }))
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Average worked/expected minutes per weekday over days that were workdays or had work. */
export function weekdayAverages(days: DayStat[]): { label: string; worked: number; expected: number; n: number }[] {
  const acc = WEEKDAYS.map((label) => ({ label, worked: 0, expected: 0, n: 0 }))
  for (const s of days) {
    if (s.credited || (s.expectedMin === 0 && s.workedMin === 0)) continue
    const a = acc[weekdayIndex(s.date)]
    a.worked += s.workedMin
    a.expected += s.expectedMin
    a.n++
  }
  return acc.map((a) => ({ ...a, worked: a.n ? a.worked / a.n : 0, expected: a.n ? a.expected / a.n : 0 }))
}
