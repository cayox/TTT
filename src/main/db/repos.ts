import type { DB } from './index'
import {
  DEFAULT_SCHEDULE,
  DEFAULT_SETTINGS,
  PROJECT_COLORS,
  type DayOverride,
  type Project,
  type ProjectColor,
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
  project_id: number | null
}

const toSession = (r: SessionRow): Session => ({
  id: r.id,
  startTs: r.start_ts,
  endTs: r.end_ts,
  source: r.source as SessionSource,
  note: r.note,
  projectId: r.project_id
})

interface ProjectRow {
  id: number
  name: string
  color: string
  archived: number
}
const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  color: (PROJECT_COLORS as readonly string[]).includes(r.color) ? (r.color as ProjectColor) : 'brass',
  archived: !!r.archived
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
    /** Returns the existing open session if one is already running. projectId undefined = default project. */
    start(source: SessionSource, ts: number = Date.now(), projectId?: number | null): Session {
      const cur = sessions.current()
      if (cur) return cur
      const pid = projectId === undefined ? projects.defaultId() : projectId
      const info = db
        .prepare("INSERT INTO sessions (start_ts, end_ts, source, note, project_id) VALUES (?, NULL, ?, '', ?)")
        .run(ts, source, pid)
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
    add(s: { startTs: number; endTs: number | null; source: SessionSource; note?: string; projectId?: number | null }): Session {
      const info = db
        .prepare('INSERT INTO sessions (start_ts, end_ts, source, note, project_id) VALUES (?, ?, ?, ?, ?)')
        .run(s.startTs, s.endTs, s.source, s.note ?? '', s.projectId === undefined ? projects.defaultId() : s.projectId)
      return getSession(Number(info.lastInsertRowid))!
    },
    update(id: number, patch: Partial<Omit<Session, 'id'>>): Session | null {
      const cur = getSession(id)
      if (!cur) return null
      const n = { ...cur, ...patch }
      db.prepare('UPDATE sessions SET start_ts=?, end_ts=?, source=?, note=?, project_id=? WHERE id=?').run(
        n.startTs,
        n.endTs,
        n.source,
        n.note,
        n.projectId,
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

  const projects = {
    list(includeArchived = true): Project[] {
      const rows = db
        .prepare(`SELECT * FROM projects ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY archived, id`)
        .all() as ProjectRow[]
      return rows.map(toProject)
    },
    get(id: number): Project | null {
      const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
      return r ? toProject(r) : null
    },
    add(p: { name: string; color: ProjectColor }): Project {
      const info = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)').run(p.name.trim() || 'Untitled', p.color)
      return projects.get(Number(info.lastInsertRowid))!
    },
    update(id: number, patch: Partial<Omit<Project, 'id'>>): Project | null {
      const cur = projects.get(id)
      if (!cur) return null
      const n = { ...cur, ...patch }
      db.prepare('UPDATE projects SET name=?, color=?, archived=? WHERE id=?').run(n.name.trim() || cur.name, n.color, n.archived ? 1 : 0, id)
      return projects.get(id)
    },
    /** Deletes the project; its sessions become unassigned (FK ON DELETE SET NULL). */
    remove(id: number): void {
      db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    },
    /** Session count per project id, to decide between archive and delete. */
    usage(): Record<number, number> {
      const rows = db.prepare('SELECT project_id AS p, COUNT(*) AS n FROM sessions WHERE project_id IS NOT NULL GROUP BY project_id').all() as { p: number; n: number }[]
      return Object.fromEntries(rows.map((r) => [r.p, r.n]))
    },
    /** Configured default if it is still active, else the first active project, else null. */
    defaultId(): number | null {
      const want = settings.get().defaultProjectId
      const active = projects.list(false)
      return active.find((p) => p.id === want)?.id ?? active[0]?.id ?? null
    },
    /** Project for a Wi-Fi started session on this SSID (case-insensitive), falling back to the default. */
    forSsid(ssid: string): number | null {
      const map = settings.get().ssidProjects
      const key = Object.keys(map).find((k) => k.trim().toLowerCase() === ssid.trim().toLowerCase())
      const id = key !== undefined ? map[key] : undefined
      return id !== undefined && projects.get(id) && !projects.get(id)!.archived ? id : projects.defaultId()
    }
  }

  return { sessions, schedule, overrides, settings, projects }
}

export type Repos = ReturnType<typeof createRepos>
