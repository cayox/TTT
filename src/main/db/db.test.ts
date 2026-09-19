import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate, openDb } from './index'
import { migrations } from './migrations'

describe('migrations', () => {
  it('creates schema and is idempotent', () => {
    const db = openDb(':memory:')
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(['sessions', 'schedule', 'day_overrides', 'settings', 'projects']))
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length)
    migrate(db)
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length)
  })
  it('assigns existing sessions to General when adding projects', () => {
    const db = new Database(':memory:')
    for (let v = 0; v < 2; v++) db.exec(migrations[v])
    db.pragma('user_version = 2')
    db.prepare("INSERT INTO sessions (start_ts, end_ts, source, note) VALUES (1, 2, 'manual', '')").run()
    migrate(db)
    const row = db.prepare('SELECT s.project_id AS pid, p.name FROM sessions s JOIN projects p ON p.id = s.project_id').get() as { pid: number; name: string }
    expect(row.name).toBe('General')
  })
})
