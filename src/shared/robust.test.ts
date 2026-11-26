import { describe, expect, it } from 'vitest'
import { overlappingIds, union, unionLength } from './intervals'
import { sessionProblem } from './validate'
import { breakDeduction, checkBreaks, requiredBreak } from './breaks'
import { cleanPatch, readSettings } from './settings'
import { DEFAULT_SETTINGS, type Session } from './types'
import { workedMinutesByDay } from './time'

const H = 3600000
const M = 60000
const day = new Date(2026, 10, 2).getTime() // Mon 2 Nov 2026, local midnight
const at = (h: number, m = 0): number => day + h * H + m * M
const s = (id: number, a: number, b: number | null, extra: Partial<Session> = {}): Session => ({
  id,
  startTs: a,
  endTs: b,
  source: 'manual',
  note: '',
  projectId: 1,
  ...extra
})

describe('intervals', () => {
  it('merges overlapping and touching intervals', () => {
    expect(
      union([
        { a: 5, b: 8 },
        { a: 1, b: 3 },
        { a: 3, b: 4 },
        { a: 7, b: 10 }
      ])
    ).toEqual([
      { a: 1, b: 4 },
      { a: 5, b: 10 }
    ])
    expect(
      unionLength([
        { a: 0, b: 10 },
        { a: 5, b: 15 },
        { a: 20, b: 20 }
      ])
    ).toBe(15)
  })
  it('finds overlapping sessions, running ones until now', () => {
    const list = [s(1, at(8), at(12)), s(2, at(11), at(13)), s(3, at(14), at(15)), s(4, at(16), null), s(5, at(16, 30), at(16, 45))]
    expect([...overlappingIds(list, at(17))].sort()).toEqual([1, 2, 4, 5])
  })
  it('counts overlapping time once per day', () => {
    expect(workedMinutesByDay([s(1, at(8), at(12)), s(2, at(11), at(13))], at(20))['2026-11-02']).toBe(300)
  })
})

describe('sessionProblem', () => {
  const now = at(18)
  const others = [s(1, at(8), at(12)), s(2, at(13), at(14))]
  it('accepts a session in a free slot', () => {
    expect(sessionProblem({ startTs: at(12), endTs: at(13) }, others, now)).toBeNull()
  })
  it('rejects overlaps, naming the other session', () => {
    expect(sessionProblem({ startTs: at(11), endTs: at(12, 30) }, others, now)).toMatch(/overlaps the session 08:00–12:00/)
    expect(sessionProblem({ startTs: at(7), endTs: at(15) }, others, now)).toMatch(/overlaps/)
  })
  it('rejects backwards, future and very long sessions', () => {
    expect(sessionProblem({ startTs: at(15), endTs: at(15) }, others, now)).toMatch(/after the start/)
    expect(sessionProblem({ startTs: at(15), endTs: at(19) }, others, now)).toMatch(/future/)
    expect(sessionProblem({ startTs: at(19), endTs: null }, others, now)).toMatch(/future/)
    expect(sessionProblem({ startTs: at(15) - 25 * H, endTs: at(15) }, [], now)).toMatch(/24 hours/)
    expect(sessionProblem({ startTs: NaN, endTs: null }, [], now)).toMatch(/start/)
  })
  it('allows only one running session and checks it against later ones', () => {
    expect(sessionProblem({ startTs: at(15), endTs: null }, [s(3, at(9), null)], now)).toMatch(/already running/)
    expect(sessionProblem({ startTs: at(13, 30), endTs: null }, others, now)).toMatch(/overlaps/)
  })
})

describe('break rules', () => {
  it('requires 30 min after 6 h and 45 after 9 h', () => {
    expect([requiredBreak(360), requiredBreak(361), requiredBreak(540), requiredBreak(541)]).toEqual([0, 30, 30, 45])
  })
  it('counts only gaps of 15 min or more, and finds long stretches', () => {
    const c = checkBreaks([
      { a: at(8), b: at(11) },
      { a: at(11, 10), b: at(14) }, // 10 min gap: not a break
      { a: at(14, 30), b: at(17) }
    ])
    expect(c.breakMin).toBe(30)
    expect(c.workedMin).toBe(500)
    expect(c.longestStretchMin).toBe(350)
    expect(c.violation).toBe(false)
  })
  it('flags a missing break, a long stretch and more than 10 h', () => {
    expect(checkBreaks([{ a: at(8), b: at(15) }])).toMatchObject({ missingMin: 30, stretchTooLong: true, violation: true })
    expect(
      checkBreaks([
        { a: at(7), b: at(12) },
        { a: at(12, 45), b: at(18, 30) }
      ])
    ).toMatchObject({ missingMin: 0, overMax: true })
  })
  it('deducts a missed break without going below the threshold', () => {
    expect(breakDeduction(380, 0)).toBe(20) // 6:20 → 6:00
    expect(breakDeduction(480, 0)).toBe(30)
    expect(breakDeduction(480, 20)).toBe(10)
    expect(breakDeduction(545, 0)).toBe(30) // 9:05 → 8:35, which only needs 30
    expect(breakDeduction(600, 0)).toBe(45)
    expect(breakDeduction(545, 30)).toBe(5) // 9:05 with 30 min → 9:00
    expect(breakDeduction(300, 0)).toBe(0)
  })
  it('optionally takes the deduction off the day', () => {
    const list = [s(1, at(8), at(16))]
    expect(workedMinutesByDay(list, at(20))['2026-11-02']).toBe(480)
    expect(workedMinutesByDay(list, at(20), { deductBreaks: true })['2026-11-02']).toBe(450)
  })
})

describe('settings', () => {
  it('drops broken stored values and keeps good ones', () => {
    const r = readSettings({
      theme: 'neon',
      graceMinutes: 7,
      timeStep: 7,
      workSsids: ['Office', 3],
      weekStart: 6,
      notifications: { breaks: false, bogus: 1 },
      unknown: 1
    })
    expect(r.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(r.graceMinutes).toBe(7)
    expect(r.timeStep).toBe(DEFAULT_SETTINGS.timeStep)
    expect(r.workSsids).toEqual([])
    expect(r.weekStart).toBe(6)
    expect(r.notifications).toEqual({ ...DEFAULT_SETTINGS.notifications, breaks: false })
    expect('unknown' in r).toBe(false)
  })
  it('reports rejected keys of a patch', () => {
    const { clean, rejected } = cleanPatch({ idleMinutes: 30, maxSessionHours: 99, globalShortcut: 'Command+Q', creditKinds: ['sick', 'party'] })
    expect(clean).toEqual({ idleMinutes: 30, creditKinds: ['sick'] })
    expect(rejected.sort()).toEqual(['globalShortcut', 'maxSessionHours'])
  })
})
