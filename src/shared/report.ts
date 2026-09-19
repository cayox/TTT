import { addDays, dateKey, dayBalance, startOfDay, weekdayIndex } from './time'
import { formatClock, formatDelta, formatDuration } from './format'
import type { DayKind, DayOverride, Project, ProjectColor, Schedule, Session, Settings } from './types'

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const KIND_NAMES: Record<DayKind, string> = { vacation: 'Vacation', sick: 'Sick', holiday: 'Holiday', custom: 'Custom' }

export interface ReportSegment {
  startTs: number
  endTs: number
  running: boolean
  project: string | null
  note: string
}

export interface ReportDay {
  date: string
  /** 0 = Monday */
  weekday: number
  segments: ReportSegment[]
  /** Time actually tracked. */
  trackedMin: number
  /** Time counted toward the target (credited days count as at least the expected time). */
  countedMin: number
  expectedMin: number
  deltaMin: number
  credited: boolean
  kind: DayKind | null
  /** After today: shown blank on the sheet. */
  future: boolean
}

export interface MonthReport {
  year: number
  /** 0-based */
  month: number
  title: string
  name: string
  days: ReportDay[]
  trackedMin: number
  countedMin: number
  expectedMin: number
  deltaMin: number
  byProject: { name: string | null; color: ProjectColor | null; minutes: number }[]
  /** Running balance at the end of the month (or today), starting balance included. */
  balanceAtEnd: number
  generatedAt: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function buildMonthReport(o: {
  year: number
  month: number
  sessions: Session[]
  schedule: Schedule
  overrides: DayOverride[]
  settings: Pick<Settings, 'creditKinds' | 'exportName'>
  projects: Project[]
  balanceAtEnd: number
  now: number
}): MonthReport {
  const first = `${o.year}-${pad(o.month + 1)}-01`
  const next = dateKey(new Date(o.year, o.month + 1, 1).getTime())
  const today = dateKey(o.now)
  const ov = new Map(o.overrides.map((x) => [x.date, x]))
  const names = new Map(o.projects.map((p) => [p.id, p.name]))
  const colors = new Map(o.projects.map((p) => [p.name, p.color]))
  const byProject = new Map<string | null, number>()
  const days: ReportDay[] = []

  for (let d = first; d < next; d = addDays(d, 1)) {
    const a = startOfDay(d)
    const b = startOfDay(addDays(d, 1))
    const segments: ReportSegment[] = []
    for (const s of o.sessions) {
      const end = s.endTs ?? o.now
      const from = Math.max(s.startTs, a)
      const to = Math.min(end, b)
      if (to <= from) continue
      const project = s.projectId != null ? (names.get(s.projectId) ?? null) : null
      segments.push({ startTs: from, endTs: to, running: s.endTs === null && to === end, project, note: s.note })
      byProject.set(project, (byProject.get(project) ?? 0) + (to - from) / 60000)
    }
    segments.sort((x, y) => x.startTs - y.startTs)
    const trackedMin = segments.reduce((acc, s) => acc + (s.endTs - s.startTs) / 60000, 0)
    const future = d > today
    const stat = dayBalance(d, trackedMin, o.schedule, ov.get(d), o.settings)
    days.push({
      date: d,
      weekday: weekdayIndex(d),
      segments,
      trackedMin,
      countedMin: future ? 0 : stat.workedMin,
      expectedMin: future ? 0 : stat.expectedMin,
      deltaMin: future ? 0 : stat.deltaMin,
      credited: stat.credited,
      kind: ov.get(d)?.kind ?? null,
      future
    })
  }

  const sum = (f: (d: ReportDay) => number): number => days.reduce((acc, d) => acc + f(d), 0)
  return {
    year: o.year,
    month: o.month,
    title: `${MONTH_NAMES[o.month]} ${o.year}`,
    name: o.settings.exportName.trim(),
    days,
    trackedMin: sum((d) => d.trackedMin),
    countedMin: sum((d) => d.countedMin),
    expectedMin: sum((d) => d.expectedMin),
    deltaMin: sum((d) => d.deltaMin),
    byProject: [...byProject.entries()].map(([name, minutes]) => ({ name, color: name !== null ? (colors.get(name) ?? null) : null, minutes })).sort((x, y) => y.minutes - x.minutes),
    balanceAtEnd: o.balanceAtEnd,
    generatedAt: o.now
  }
}

/** "Mon 01" */
export const dayLabel = (d: ReportDay): string => `${WEEKDAY_SHORT[d.weekday]} ${d.date.slice(8)}`

/**
 * Month summary for a chat message. Uses WhatsApp formatting: *bold*, _italic_ and a ``` block
 * so the day lines stay aligned. Days with nothing tracked and no day-off marker are skipped.
 */
export function whatsappText(r: MonthReport): string {
  const lines: string[] = [`*Timesheet ${r.title}*`]
  if (r.name) lines.push(`_${r.name}_`)
  lines.push('')

  const rows = r.days.filter((d) => !d.future && (d.trackedMin >= 1 || d.kind))
  if (rows.length) {
    lines.push('```')
    for (const d of rows) {
      const span = d.segments.length
        ? `${formatClock(d.segments[0].startTs)}–${d.segments[d.segments.length - 1].running ? 'now  ' : formatClock(d.segments[d.segments.length - 1].endTs)}`
        : (d.kind ? KIND_NAMES[d.kind] : '')
      const delta = d.expectedMin > 0 || d.countedMin > 0 ? formatDelta(d.deltaMin) : ''
      lines.push(`${dayLabel(d)}  ${span.padEnd(11)}  ${formatDuration(d.countedMin).padStart(5)}  ${delta.padStart(6)}`.trimEnd())
    }
    lines.push('```')
  } else {
    lines.push('_Nothing tracked this month._')
  }

  lines.push('')
  lines.push(`*Worked:* ${formatDuration(r.countedMin)} of ${formatDuration(r.expectedMin)}`)
  lines.push(`*This month:* ${formatDelta(r.deltaMin)}`)
  lines.push(`*Balance:* ${formatDelta(r.balanceAtEnd)}`)
  const named = r.byProject.filter((p) => p.minutes >= 1)
  if (named.length > 1 || (named.length === 1 && named[0].name)) {
    lines.push('')
    lines.push('*By project*')
    for (const p of named) lines.push(`• ${p.name ?? 'No project'}: ${formatDuration(p.minutes)}`)
  }
  return lines.join('\n')
}
