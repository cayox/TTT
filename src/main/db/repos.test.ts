import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from './index'
import { createRepos, type Repos } from './repos'
import { DEFAULT_SCHEDULE, DEFAULT_SETTINGS } from '@shared/types'

let r: Repos
beforeEach(() => {
  r = createRepos(openDb(':memory:'))
})

describe('sessions', () => {
  it('start/stop/current', () => {
    expect(r.sessions.current()).toBeNull()
    const s = r.sessions.start('manual', 1000)
    expect(r.sessions.start('wifi', 2000).id).toBe(s.id)
    expect(r.sessions.current()?.endTs).toBeNull()
    expect(r.sessions.stop(5000)).toMatchObject({ startTs: 1000, endTs: 5000 })
    expect(r.sessions.current()).toBeNull()
    expect(r.sessions.stop()).toBeNull()
  })
  it('list overlaps range, add/update/remove/firstStart', () => {
    expect(r.sessions.firstStart()).toBeNull()
    const a = r.sessions.add({ startTs: 100, endTs: 200, source: 'manual', note: 'a' })
    r.sessions.add({ startTs: 300, endTs: 400, source: 'wifi', note: '' })
    r.sessions.add({ startTs: 500, endTs: null, source: 'manual', note: '' })
    expect(r.sessions.list(150, 350).map((s) => s.startTs)).toEqual([100, 300])
    expect(r.sessions.list(450, 600).map((s) => s.startTs)).toEqual([500])
    expect(r.sessions.firstStart()).toBe(100)
    expect(r.sessions.update(a.id, { note: 'x', endTs: 250 })).toMatchObject({ note: 'x', endTs: 250 })
    r.sessions.remove(a.id)
    expect(r.sessions.firstStart()).toBe(300)
  })
})

describe('schedule/overrides/settings', () => {
  it('schedule defaults and set', () => {
    expect(r.schedule.get()).toEqual(DEFAULT_SCHEDULE)
    r.schedule.set([1, 2, 3, 4, 5, 6, 7])
    expect(r.schedule.get()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it('overrides', () => {
    r.overrides.set({ date: '2026-01-02', kind: 'vacation', expectedMinutes: null })
    r.overrides.set({ date: '2026-01-05', kind: 'custom', expectedMinutes: 120 })
    r.overrides.set({ date: '2026-01-02', kind: 'sick', expectedMinutes: null })
    expect(r.overrides.list('2026-01-01', '2026-01-04')).toEqual([
      { date: '2026-01-02', kind: 'sick', expectedMinutes: null }
    ])
    r.overrides.remove('2026-01-02')
    expect(r.overrides.list('2026-01-01', '2026-01-31')).toHaveLength(1)
  })
  it('settings merge', () => {
    expect(r.settings.get()).toEqual(DEFAULT_SETTINGS)
    r.settings.set({ theme: 'dark', workSsids: ['x'] })
    expect(r.settings.get()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', workSsids: ['x'] })
  })
})
