import type { DB } from './index'
import {
  DEFAULT_SCHEDULE,
  DEFAULT_SETTINGS,
  type DayOverride,
  type Schedule,
  type Session,
  type SessionSource,
  type Settings
} from '@shared/types'

interface SessionRow {
  id: number
  start_ts: number
  end_ts: number | null
  source: string
  note: string
}

const toSession = (r: SessionRow): Session => ({
  id: r.id,
  startTs: r.start_ts,
  endTs: r.end_ts,
  source: r.source as SessionSource,
  note: r.note
})

export function createRepos(db: DB) {
  const getSession = (id: number): Session | null => {
    const r = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined
    return r ? toSession(r) : null
  }

  const sessions = {
    current(): Session | null {
      const r = db
        .prepare('SELECT * FROM sessions WHERE end_ts IS NULL ORDER BY start_ts DESC LIMIT 1')
        .get() as SessionRow | undefined
      return r ? toSession(r) : null
    },
    /** Returns the existing open session if one is already running. */
    start(source: SessionSource, ts: number = Date.now()): Session {
      const cur = sessions.current()
      if (cur) return cur
      const info = db
        .prepare("INSERT INTO sessions (start_ts, end_ts, source, note) VALUES (?, NULL, ?, '')")
        .run(ts, source)
      return getSession(Number(info.lastInsertRowid))!
    },
    stop(ts: number = Date.now()): Session | null {
      const cur = sessions.current()
      if (!cur) return null
      db.prepare('UPDATE sessions SET end_ts = ? WHERE id = ?').run(Math.max(ts, cur.startTs), cur.id)
      return getSession(cur.id)
    },
    list(fromTs: number, toTs: number): Session[] {
      const rows = db
        .prepare(
          'SELECT * FROM sessions WHERE start_ts < ? AND (end_ts IS NULL OR end_ts > ?) ORDER BY start_ts, id'
        )
        .all(toTs, fromTs) as SessionRow[]
      return rows.map(toSession)
    },
    add(s: { startTs: number; endTs: number | null; source: SessionSource; note?: string }): Session {
      const info = db
        .prepare('INSERT INTO sessions (start_ts, end_ts, source, note) VALUES (?, ?, ?, ?)')
        .run(s.startTs, s.endTs, s.source, s.note ?? '')
      return getSession(Number(info.lastInsertRowid))!
    },
    update(id: number, patch: Partial<Omit<Session, 'id'>>): Session | null {
      const cur = getSession(id)
      if (!cur) return null
      const n = { ...cur, ...patch }
      db.prepare('UPDATE sessions SET start_ts=?, end_ts=?, source=?, note=? WHERE id=?').run(
        n.startTs,
        n.endTs,
        n.source,
        n.note,
        id
      )
      return getSession(id)
    },
    remove(id: number): void {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    },
    firstStart(): number | null {
      const r = db.prepare('SELECT MIN(start_ts) AS m FROM sessions').get() as { m: number | null }
      return r.m
    }
  }

  const schedule = {
    get(): Schedule {
      const rows = db.prepare('SELECT weekday, expected_minutes FROM schedule').all() as {
        weekday: number
        expected_minutes: number
      }[]
      if (rows.length === 0) return [...DEFAULT_SCHEDULE]
      const out = [...DEFAULT_SCHEDULE]
      for (const r of rows) if (r.weekday >= 0 && r.weekday < 7) out[r.weekday] = r.expected_minutes
      return out
    },
    set(s: Schedule): void {
      const ins = db.prepare('INSERT OR REPLACE INTO schedule (weekday, expected_minutes) VALUES (?, ?)')
      db.transaction(() => {
        for (let i = 0; i < 7; i++) ins.run(i, s[i] ?? 0)
      })()
    }
  }

  const overrides = {
    list(fromDate: string, toDate: string): DayOverride[] {
      const rows = db
        .prepare('SELECT * FROM day_overrides WHERE date >= ? AND date <= ? ORDER BY date')
        .all(fromDate, toDate) as { date: string; kind: string; expected_minutes: number | null }[]
      return rows.map((r) => ({
        date: r.date,
        kind: r.kind as DayOverride['kind'],
        expectedMinutes: r.expected_minutes
      }))
    },
    set(o: DayOverride): void {
      db.prepare('INSERT OR REPLACE INTO day_overrides (date, kind, expected_minutes) VALUES (?, ?, ?)').run(
        o.date,
        o.kind,
        o.expectedMinutes
      )
    },
    remove(date: string): void {
      db.prepare('DELETE FROM day_overrides WHERE date = ?').run(date)
    }
  }

  const settings = {
    get(): Settings {
      const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
      const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
      for (const r of rows) {
        if (!(r.key in DEFAULT_SETTINGS)) continue
        try {
          out[r.key] = JSON.parse(r.value)
        } catch {
          /* keep default */
        }
      }
      return out as unknown as Settings
    },
    set(patch: Partial<Settings>): Settings {
      const ins = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      db.transaction(() => {
        for (const [k, v] of Object.entries(patch)) if (v !== undefined) ins.run(k, JSON.stringify(v))
      })()
      return settings.get()
    }
  }

  return { sessions, schedule, overrides, settings }
}

export type Repos = ReturnType<typeof createRepos>
