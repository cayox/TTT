import { formatClock } from './format'
import { dateKey } from './time'
import type { MonthReport } from './report'
import { PROJECT_COLORS, type DayOverride, type Project, type Schedule, type Session, type Settings } from './types'

/** Everything TTT stores, as one JSON file: a full backup that another Mac can import. */
export interface DataDump {
  app: 'TTT'
  format: 1
  exportedAt: number
  version: string
  sessions: Session[]
  projects: Project[]
  schedule: Schedule
  overrides: DayOverride[]
  settings: Partial<Settings>
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Parses and checks a dump; throws with a readable reason when it is not one. */
export function parseDump(text: string): DataDump {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON')
  }
  if (!isObj(v) || v.app !== 'TTT') throw new Error('This is not a TTT data export')
  if (v.format !== 1) throw new Error(`Unknown export format ${String(v.format)}; update TTT and try again`)
  const fail = (what: string): never => {
    throw new Error(`The export has a broken ${what}`)
  }
  if (!Array.isArray(v.projects)) fail('project list')
  const projects: Project[] = (v.projects as unknown[]).map((p) => {
    if (!isObj(p) || !isInt(p.id) || typeof p.name !== 'string') return fail('project')
    return {
      id: p.id,
      name: p.name,
      color: (PROJECT_COLORS as readonly unknown[]).includes(p.color) ? (p.color as Project['color']) : 'brass',
      archived: !!p.archived
    }
  })
  const ids = new Set(projects.map((p) => p.id))
  if (!Array.isArray(v.sessions)) fail('session list')
  const sessions: Session[] = (v.sessions as unknown[]).map((s) => {
    if (!isObj(s) || !isInt(s.id) || !isInt(s.startTs) || !(s.endTs === null || isInt(s.endTs))) return fail('session')
    if (s.endTs !== null && (s.endTs as number) < (s.startTs as number)) return fail('session (ends before it starts)')
    const pid = isInt(s.projectId) && ids.has(s.projectId) ? s.projectId : null
    return {
      id: s.id,
      startTs: s.startTs,
      endTs: s.endTs as number | null,
      source: s.source === 'wifi' ? 'wifi' : 'manual',
      note: typeof s.note === 'string' ? s.note : '',
      projectId: pid
    }
  })
  if (sessions.filter((s) => s.endTs === null).length > 1) fail('session list (more than one running)')
  const schedule =
    Array.isArray(v.schedule) && v.schedule.length === 7 && v.schedule.every((n) => isInt(n) && n >= 0 && n <= 1440)
      ? (v.schedule as Schedule)
      : fail('schedule')
  if (!Array.isArray(v.overrides)) fail('day list')
  const overrides: DayOverride[] = (v.overrides as unknown[]).map((o) => {
    if (!isObj(o) || typeof o.date !== 'string' || !DATE.test(o.date)) return fail('day marker')
    const kind = ['holiday', 'vacation', 'sick', 'custom'].includes(o.kind as string) ? (o.kind as DayOverride['kind']) : fail('day marker')
    return { date: o.date, kind, expectedMinutes: isInt(o.expectedMinutes) ? o.expectedMinutes : null }
  })
  return {
    app: 'TTT',
    format: 1,
    exportedAt: isInt(v.exportedAt) ? v.exportedAt : 0,
    version: typeof v.version === 'string' ? v.version : '',
    sessions,
    projects,
    schedule,
    overrides,
    settings: isObj(v.settings) ? (v.settings as Partial<Settings>) : {}
  }
}

/** One CSV field, quoted when needed (RFC 4180). */
const csv = (v: string | number): string => {
  const s = String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const row = (cells: (string | number)[]): string => cells.map(csv).join(',')

/** Every session as CSV, one row each, for spreadsheets. */
export function sessionsCsv(sessions: Session[], projects: Project[], now: number): string {
  const names = new Map(projects.map((p) => [p.id, p.name]))
  const lines = [row(['Date', 'Start', 'End', 'Minutes', 'Project', 'Note', 'Source'])]
  for (const s of [...sessions].sort((a, b) => a.startTs - b.startTs)) {
    const end = s.endTs ?? now
    lines.push(
      row([
        dateKey(s.startTs),
        formatClock(s.startTs),
        s.endTs === null ? '' : `${dateKey(end) !== dateKey(s.startTs) ? `${dateKey(end)} ` : ''}${formatClock(end)}`,
        Math.round((end - s.startTs) / 60000),
        s.projectId != null ? (names.get(s.projectId) ?? '') : '',
        s.note,
        s.source
      ])
    )
  }
  return lines.join('\r\n') + '\r\n'
}

/** The month's sessions as CSV, split at midnight and rounded like the timesheet. */
export function reportCsv(r: MonthReport): string {
  const lines = [row(['Date', 'Start', 'End', 'Minutes', 'Project', 'Note'])]
  for (const d of r.days)
    for (const s of d.segments)
      lines.push(
        row([d.date, formatClock(s.startTs), s.running ? '' : formatClock(s.endTs), Math.round((s.endTs - s.startTs) / 60000), s.project ?? '', s.note])
      )
  return lines.join('\r\n') + '\r\n'
}

const icsDate = (ts: number): string =>
  new Date(ts)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
/** Escapes text for an iCalendar value. */
const icsText = (s: string): string =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/[,;]/g, (c) => `\\${c}`)

/** The month's sessions as calendar events (.ics), e.g. to see them next to meetings. */
export function reportIcs(r: MonthReport): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TTT//Time Tracking Tool//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText(`TTT ${r.title}`)}`]
  for (const d of r.days)
    for (const s of d.segments) {
      if (s.running) continue
      lines.push(
        'BEGIN:VEVENT',
        `UID:ttt-${s.startTs}-${s.endTs}@ttt.local`,
        `DTSTAMP:${icsDate(r.generatedAt)}`,
        `DTSTART:${icsDate(s.startTs)}`,
        `DTEND:${icsDate(s.endTs)}`,
        `SUMMARY:${icsText(s.project ? `Work: ${s.project}` : 'Work')}`,
        ...(s.note.trim() ? [`DESCRIPTION:${icsText(s.note.trim())}`] : []),
        'TRANSP:TRANSPARENT',
        'END:VEVENT'
      )
    }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
