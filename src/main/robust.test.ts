import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAwayWatcher, type AwayDeps } from './away'
import { currentStretch, dueReminders } from './coach'
import { parseTttUrl } from './url'
import { openDb } from './db'
import { createRepos } from './db/repos'
import { backup, dailyBackup, integrity, KEEP_DAILY, listBackups, prune } from './db/backup'
import { DEFAULT_SETTINGS, type Session } from '@shared/types'

const M = 60000
const H = 60 * M

function away(over: Partial<AwayDeps> & { session?: Session | null } = {}) {
  let now = 10 * H
  let idle = 0
  let cur: Session | null = over.session === undefined ? { id: 1, startTs: 8 * H, endTs: null, source: 'manual', note: '', projectId: 3 } : over.session
  const calls: string[] = []
  const deps: AwayDeps = {
    now: () => now,
    idleSeconds: () => idle,
    current: () => cur,
    idleMinutes: () => 15,
    maxSessionHours: () => 12,
    ask: vi.fn(async () => 'dropContinue' as const),
    stopAt: (ts) => (calls.push(`stop@${ts / M}`), cur && (cur = { ...cur, endTs: ts })),
    resumeAt: (ts) => void calls.push(`resume@${ts / M}`),
    onForgotten: (e) => void calls.push(`forgotten:${e.kind}`),
    ...over
  }
  const w = createAwayWatcher(deps)
  return {
    w,
    deps,
    calls,
    set: (n: number, i: number) => ((now = n), (idle = i)),
    stopped: () => cur?.endTs
  }
}

describe('away watcher', () => {
  it('asks once you are back after being idle, and removes the time on request', async () => {
    const a = away()
    a.set(12 * H, 20 * 60) // idle since 11:40
    a.w.tick()
    expect(a.deps.ask).not.toHaveBeenCalled()
    a.set(12 * H + 30 * M, 5) // back at 12:29:55
    a.w.tick()
    await vi.waitFor(() => expect(a.calls).toEqual([`stop@${11 * 60 + 40}`, `resume@${12 * 60 + 30 - 5 / 60}`]))
    expect(a.deps.ask).toHaveBeenCalledWith(expect.objectContaining({ from: 11 * H + 40 * M }))
  })
  it('ignores short absences', () => {
    const a = away()
    a.set(12 * H, 5 * 60)
    a.w.tick()
    a.set(12 * H + M, 0)
    a.w.tick()
    expect(a.deps.ask).not.toHaveBeenCalled()
  })
  it('treats sleep as away, but forgets a short nap', async () => {
    const a = away()
    a.w.suspended(11 * H)
    a.set(11 * H + 5 * M, 0)
    a.w.resumed()
    a.w.tick()
    expect(a.deps.ask).not.toHaveBeenCalled()
    a.w.suspended(12 * H)
    a.set(13 * H, 0)
    a.w.resumed()
    a.w.tick()
    await vi.waitFor(() => expect(a.deps.ask).toHaveBeenCalledWith(expect.objectContaining({ from: 12 * H })))
  })
  it('keeps the time when you say it was work', async () => {
    const a = away({ ask: vi.fn(async () => 'keep' as const) })
    a.set(12 * H, 20 * 60)
    a.w.tick()
    a.set(12 * H + 30 * M, 0)
    a.w.tick()
    await vi.waitFor(() => expect(a.deps.ask).toHaveBeenCalled())
    expect(a.calls).toEqual([])
  })
  it('stops a forgotten session at the last input when you are away', () => {
    const a = away()
    a.set(20 * H + M, 2 * 3600) // 12 h after start, idle for 2 h
    a.w.tick()
    expect(a.calls).toEqual([`stop@${18 * 60 + 1}`, 'forgotten:stopped'])
  })
  it('only warns about a long session while you are at the Mac, once', () => {
    const a = away()
    a.set(20 * H + M, 10)
    a.w.tick()
    a.set(20 * H + 2 * M, 10)
    a.w.tick()
    expect(a.calls).toEqual(['forgotten:long'])
  })
})

describe('coach', () => {
  const at = (h: number, m = 0): number => h * H + m * M
  it('measures the current stretch since the last real break', () => {
    const work = [
      { a: at(8), b: at(10) },
      { a: at(10, 5), b: at(12) },
      { a: at(12, 30), b: at(14) }
    ]
    expect(currentStretch(work, at(14))).toBe(90)
    expect(currentStretch(work, at(16))).toBe(0) // not working right now
  })
  it('reminds about the target and due breaks', () => {
    const keys = (work: { a: number; b: number }[], now: number) =>
      dueReminders({ now, work, running: true, expectedMin: 480, credited: false, breakRules: true }).map((r) => r.key)
    expect(keys([{ a: at(8), b: at(13, 50) }], at(13, 50))).toEqual(['stretch'])
    expect(keys([{ a: at(8), b: at(14, 5) }], at(14, 5))).toEqual(['stretch', 'b30'])
    expect(
      keys(
        [
          { a: at(8), b: at(12) },
          { a: at(12, 30), b: at(17) }
        ],
        at(17)
      )
    ).toEqual(['target'])
    expect(dueReminders({ now: at(17), work: [{ a: at(8), b: at(17) }], running: false, expectedMin: 480, credited: false, breakRules: true })).toEqual([])
  })
})

describe('ttt:// links', () => {
  it('parses the supported actions', () => {
    expect(parseTttUrl('ttt://start?project=Acme%20GmbH')).toEqual({ kind: 'start', project: 'Acme GmbH' })
    expect(parseTttUrl('ttt://start')).toEqual({ kind: 'start', project: null })
    expect(parseTttUrl('ttt://pause')).toEqual({ kind: 'pause' })
    expect(parseTttUrl('ttt://toggle')).toEqual({ kind: 'toggle' })
    expect(parseTttUrl('ttt://open?page=history')).toEqual({ kind: 'open', page: 'history' })
    expect(parseTttUrl('ttt://open?page=nope')).toEqual({ kind: 'open', page: null })
    expect(parseTttUrl('https://start')).toBeNull()
    expect(parseTttUrl('ttt://format-disk')).toBeNull()
  })
})

describe('repos validation', () => {
  it('refuses overlapping and backwards sessions', () => {
    const r = createRepos(openDb(':memory:'))
    const now = Date.now()
    const a = r.sessions.add({ startTs: now - 5 * H, endTs: now - 3 * H, source: 'manual' })
    expect(() => r.sessions.add({ startTs: now - 4 * H, endTs: now - 2 * H, source: 'manual' })).toThrow(/overlaps/)
    expect(() => r.sessions.update(a.id, { endTs: now - 6 * H })).toThrow(/after the start/)
    r.sessions.start('manual', now - H)
    expect(() => r.sessions.add({ startTs: now - 30 * M, endTs: null, source: 'manual' })).toThrow(/already running|overlaps/)
    // Changing only the project skips the time checks.
    expect(r.sessions.update(a.id, { note: 'ok' })?.note).toBe('ok')
  })
  it('refuses invalid settings and saves nothing', () => {
    const r = createRepos(openDb(':memory:'))
    expect(() => r.settings.set({ graceMinutes: 5, theme: 'neon' as never })).toThrow(/theme/)
    expect(r.settings.get().graceMinutes).toBe(DEFAULT_SETTINGS.graceMinutes)
    r.settings.set({ idleMinutes: 30 })
    expect(r.settings.get().idleMinutes).toBe(30)
  })
})

describe('backups', () => {
  it('writes a restorable snapshot, one daily per day, and prunes old ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttt-backup-'))
    const db = openDb(':memory:')
    createRepos(db).projects.add({ name: 'Snap', color: 'teal' })
    const day = new Date(2026, 10, 2).getTime()
    expect(dailyBackup(db, dir, day)).toMatch(/daily-2026-11-02\.db$/)
    expect(dailyBackup(db, dir, day + H)).toBeNull()
    const copy = openDb(join(dir, 'daily-2026-11-02.db'))
    expect(
      createRepos(copy)
        .projects.list()
        .map((p) => p.name)
    ).toContain('Snap')
    expect(integrity(copy).ok).toBe(true)
    copy.close()

    for (let i = 0; i < KEEP_DAILY + 3; i++) {
      const f = join(dir, `daily-2025-01-${String(i + 1).padStart(2, '0')}.db`)
      writeFileSync(f, '')
      utimesSync(f, new Date(2025, 0, i + 1), new Date(2025, 0, i + 1))
    }
    prune(dir)
    expect(listBackups(dir).filter((b) => b.kind === 'daily')).toHaveLength(KEEP_DAILY)
    expect(readdirSync(dir)).toContain('daily-2026-11-02.db')
    expect(backup(db, dir, 'manual', day)).toMatch(/manual-2026-11-02-\d{6}\.db$/)
  })
})
