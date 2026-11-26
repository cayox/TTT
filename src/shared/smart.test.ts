import { describe, expect, it } from 'vitest'
import { parseDump, reportCsv, reportIcs, sessionsCsv } from './data'
import { buildMonthReport, roundTs } from './report'
import { suggestProject } from './suggest'
import { missingDays } from './missing'
import { monthHours } from './hours'
import { DEFAULT_SCHEDULE, DEFAULT_SETTINGS, type Project, type Session } from './types'

const t = (y: number, mo: number, d: number, h = 0, m = 0): number => new Date(y, mo, d, h, m).getTime()
const s = (id: number, a: number, b: number | null, extra: Partial<Session> = {}): Session => ({
  id,
  startTs: a,
  endTs: b,
  source: 'manual',
  note: '',
  projectId: 1,
  ...extra
})
const projects: Project[] = [
  { id: 1, name: 'Acme', color: 'sage', archived: false },
  { id: 2, name: 'Beta, Inc', color: 'clay', archived: false }
]

describe('data export', () => {
  const dump = {
    app: 'TTT',
    format: 1,
    exportedAt: 1,
    version: '1',
    sessions: [s(1, 1000, 2000), s(2, 3000, null, { projectId: 9 })],
    projects,
    schedule: DEFAULT_SCHEDULE,
    overrides: [{ date: '2026-11-03', kind: 'sick', expectedMinutes: null }],
    settings: { theme: 'dark' }
  }
  it('round-trips a dump and drops dangling project ids', () => {
    const d = parseDump(JSON.stringify(dump))
    expect(d.sessions).toHaveLength(2)
    expect(d.sessions[1].projectId).toBeNull()
    expect(d.overrides[0].kind).toBe('sick')
  })
  it('rejects files that are not a TTT export', () => {
    expect(() => parseDump('nope')).toThrow(/JSON/)
    expect(() => parseDump('{"app":"Other"}')).toThrow(/not a TTT/)
    expect(() => parseDump(JSON.stringify({ ...dump, format: 2 }))).toThrow(/format/)
    expect(() => parseDump(JSON.stringify({ ...dump, sessions: [s(1, 5, 1)] }))).toThrow(/session/)
    expect(() => parseDump(JSON.stringify({ ...dump, sessions: [s(1, 5, null), s(2, 9, null)] }))).toThrow(/running/)
  })
  it('writes CSV with quoting', () => {
    const csv = sessionsCsv([s(1, t(2026, 10, 2, 8), t(2026, 10, 2, 9, 30), { projectId: 2, note: 'Said "hi"' })], projects, 0)
    expect(csv.split('\r\n')[1]).toBe('2026-11-02,08:00,09:30,90,"Beta, Inc","Said ""hi""",manual')
  })
})

describe('month report', () => {
  const now = t(2026, 10, 30, 20)
  const build = (sessions: Session[], extra = {}) =>
    buildMonthReport({
      year: 2026,
      month: 10,
      sessions,
      schedule: DEFAULT_SCHEDULE,
      overrides: [],
      settings: { ...DEFAULT_SETTINGS, ...extra },
      projects,
      balanceAtEnd: 0,
      now
    })
  it('rounds times to the chosen step', () => {
    expect(roundTs(t(2026, 10, 2, 8, 7), 15)).toBe(t(2026, 10, 2, 8, 0))
    expect(roundTs(t(2026, 10, 2, 8, 8), 15)).toBe(t(2026, 10, 2, 8, 15))
    const r = build([s(1, t(2026, 10, 2, 8, 7), t(2026, 10, 2, 16, 53))], { exportRoundMin: 15 })
    const d = r.days[1]
    expect(d.trackedMin).toBe(9 * 60)
    expect(r.roundMin).toBe(15)
  })
  it('flags break issues and deducts when asked', () => {
    const r = build([s(1, t(2026, 10, 2, 8), t(2026, 10, 2, 16))], { breakRules: true, deductBreaks: true })
    expect(r.days[1]).toMatchObject({ trackedMin: 480, deductedMin: 30, countedMin: 450, breakIssue: '30 min break missing' })
    expect(r.breakIssues).toBe(1)
  })
  it('counts overlapping sessions once', () => {
    const r = build([s(1, t(2026, 10, 2, 8), t(2026, 10, 2, 12)), s(2, t(2026, 10, 2, 11), t(2026, 10, 2, 13))])
    expect(r.days[1].trackedMin).toBe(300)
  })
  it('exports the month as CSV and calendar events', () => {
    const r = build([s(1, t(2026, 10, 2, 8), t(2026, 10, 2, 12), { note: 'Plan; review' })])
    expect(reportCsv(r)).toContain('2026-11-02,08:00,12:00,240,Acme,Plan; review'.replace('Plan; review', '"Plan; review"'))
    const ics = reportIcs(r)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Work: Acme')
    expect(ics).toContain('DESCRIPTION:Plan\\; review')
  })
})

describe('suggestProject', () => {
  const now = t(2026, 10, 30, 9, 15) // Monday
  it('picks the project usually worked on at this weekday and hour', () => {
    const list = [
      s(1, t(2026, 10, 23, 9), t(2026, 10, 23, 12), { projectId: 2 }),
      s(2, t(2026, 10, 16, 8, 30), t(2026, 10, 16, 11), { projectId: 2 }),
      s(3, t(2026, 10, 24, 9), t(2026, 10, 24, 12), { projectId: 1 }), // Tuesday
      s(4, t(2026, 10, 23, 14), t(2026, 10, 23, 17), { projectId: 1 }) // afternoon
    ]
    expect(suggestProject(list, now, [1, 2])).toBe(2)
  })
  it('needs a habit: two days, active project', () => {
    expect(suggestProject([s(1, t(2026, 10, 23, 9), t(2026, 10, 23, 12), { projectId: 2 })], now, [1, 2])).toBeNull()
    const two = [s(1, t(2026, 10, 23, 9), t(2026, 10, 23, 12), { projectId: 2 }), s(2, t(2026, 10, 16, 9), t(2026, 10, 16, 12), { projectId: 2 })]
    expect(suggestProject(two, now, [1])).toBeNull()
  })
})

describe('missingDays', () => {
  it('lists past workdays with nothing tracked and no day off', () => {
    const out = missingDays({
      from: '2026-11-02',
      today: '2026-11-09',
      worked: { '2026-11-02': 480, '2026-11-04': 0 },
      schedule: DEFAULT_SCHEDULE,
      overrides: [{ date: '2026-11-05', kind: 'vacation', expectedMinutes: null }],
      settings: DEFAULT_SETTINGS
    })
    expect(out).toEqual(['2026-11-03', '2026-11-04', '2026-11-06'])
  })
})

describe('monthly projection', () => {
  it('projects the finish date at the pace so far', () => {
    // November 2026: 21 workdays. 8 h a day for the first 5 workdays; contract 100 h.
    const sessions: Session[] = []
    for (const d of [2, 3, 4, 5, 6]) sessions.push(s(d, t(2026, 10, d, 8), t(2026, 10, d, 16)))
    const h = monthHours({ contractMin: 100 * 60, sessions, schedule: DEFAULT_SCHEDULE, overrides: [], settings: DEFAULT_SETTINGS, now: t(2026, 10, 9, 7) })
    expect(h.workdaysPassed).toBe(5)
    // 40 h done, 60 h left at 8 h a day = 7.5 workdays from Mon 9th: Wed 18th.
    expect(h.projectedFinish).toBe('2026-11-18')
  })
  it('reports how short the pace falls', () => {
    const sessions = [s(1, t(2026, 10, 2, 8), t(2026, 10, 2, 9))]
    const h = monthHours({ contractMin: 160 * 60, sessions, schedule: DEFAULT_SCHEDULE, overrides: [], settings: DEFAULT_SETTINGS, now: t(2026, 10, 3, 7) })
    expect(h.projectedFinish).toBeNull()
    expect(h.projectedShortMin).toBe(160 * 60 - 60 - 20 * 60)
  })
})
