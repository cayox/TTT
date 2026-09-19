import { describe, expect, it } from 'vitest'
import { buildMonthReport, whatsappText } from './report'
import { DEFAULT_SETTINGS, type Session } from './types'

const t = (d: number, h: number, mi = 0): number => new Date(2026, 8, d, h, mi).getTime() // September 2026
const s = (id: number, a: number, b: number | null, projectId: number | null = 1, note = ''): Session => ({ id, startTs: a, endTs: b, source: 'manual', note, projectId })
const projects = [
  { id: 1, name: 'General', color: 'brass' as const, archived: false },
  { id: 2, name: 'Client B', color: 'sage' as const, archived: false }
]
const schedule = [480, 480, 480, 480, 480, 0, 0]

function build(sessions: Session[], now = t(19, 18)) {
  return buildMonthReport({
    year: 2026,
    month: 8,
    sessions,
    schedule,
    overrides: [{ date: '2026-09-03', kind: 'vacation', expectedMinutes: null }],
    settings: { ...DEFAULT_SETTINGS, exportName: ' Nico Päller ' },
    projects,
    balanceAtEnd: 75,
    now
  })
}

describe('buildMonthReport', () => {
  it('lists every day, splits overnight sessions and marks future days', () => {
    const r = build([s(1, t(1, 9), t(1, 17, 30)), s(2, t(2, 22), t(3, 1), 2)])
    expect(r.days).toHaveLength(30)
    expect(r.title).toBe('September 2026')
    expect(r.name).toBe('Nico Päller')
    const [d1, d2, d3] = r.days
    expect(d1).toMatchObject({ trackedMin: 510, expectedMin: 480, deltaMin: 30 })
    expect(d2.segments).toHaveLength(1)
    expect(d2.trackedMin).toBe(120)
    expect(d3).toMatchObject({ kind: 'vacation', credited: true, trackedMin: 60, countedMin: 480, deltaMin: 0 })
    expect(r.days[19]).toMatchObject({ date: '2026-09-20', future: true, expectedMin: 0 })
    expect(r.byProject).toEqual([
      { name: 'General', color: 'brass', minutes: 510 },
      { name: 'Client B', color: 'sage', minutes: 180 }
    ])
  })
})

describe('whatsappText', () => {
  it('formats aligned day lines and totals with WhatsApp markup', () => {
    const text = whatsappText(build([s(1, t(1, 9), t(1, 17, 30)), s(2, t(2, 9), t(2, 12), 2)]))
    expect(text).toContain('*Timesheet September 2026*\n_Nico Päller_')
    expect(text).toContain('```\nTue 01  09:00–17:30   8:30   +0:30\nWed 02  09:00–12:00   3:00   −5:00\nThu 03  Vacation      8:00    0:00')
    expect(text).toContain('*Balance:* +1:15')
    expect(text).toContain('*By project*\n• General: 8:30\n• Client B: 3:00')
  })
  it('handles an empty month', () => {
    const text = whatsappText({ ...build([]), days: build([]).days.map((d) => ({ ...d, kind: null })) })
    expect(text).toContain('_Nothing tracked this month._')
    expect(text).not.toContain('By project')
  })
})
