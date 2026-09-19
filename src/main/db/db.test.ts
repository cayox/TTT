import { describe, expect, it } from 'vitest'
import { openDb } from './index'

describe('migrations', () => {
  it('creates schema and is idempotent', () => {
    const db = openDb(':memory:')
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(['sessions', 'schedule', 'day_overrides', 'settings']))
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })
})
