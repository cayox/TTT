import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { DB } from './index'
import type { BackupEntry } from '@shared/types'

/** Daily backups kept; older ones are deleted. Pre-migration and manual backups are kept separately. */
export const KEEP_DAILY = 14
export const KEEP_OTHER = 10

export interface BackupFile extends BackupEntry {
  path: string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const stamp = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const time = (ts: number): string => {
  const d = new Date(ts)
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function kindOf(name: string): BackupFile['kind'] | null {
  if (!name.endsWith('.db')) return null
  if (name.startsWith('daily-')) return 'daily'
  if (name.startsWith('migration-')) return 'migration'
  if (name.startsWith('manual-')) return 'manual'
  if (name.startsWith('import-')) return 'import'
  return null
}

/** Copies the live database into `file` as one consistent snapshot (works with WAL, no lock held afterwards). */
export function snapshot(db: DB, file: string): void {
  db.prepare('VACUUM INTO ?').run(file)
}

export function listBackups(dir: string): BackupFile[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out: BackupFile[] = []
  for (const name of names) {
    const kind = kindOf(name)
    if (!kind) continue
    try {
      const st = statSync(join(dir, name))
      out.push({ name, path: join(dir, name), at: st.mtimeMs, size: st.size, kind })
    } catch {
      /* vanished */
    }
  }
  return out.sort((a, b) => b.at - a.at)
}

/** Deletes the oldest backups beyond the limits. */
export function prune(dir: string): void {
  const all = listBackups(dir)
  const drop = [...all.filter((b) => b.kind === 'daily').slice(KEEP_DAILY), ...all.filter((b) => b.kind !== 'daily').slice(KEEP_OTHER)]
  for (const b of drop) {
    try {
      unlinkSync(b.path)
    } catch {
      /* ignore */
    }
  }
}

/** Writes a backup of the given kind and prunes old ones. Returns its path. */
export function backup(db: DB, dir: string, kind: BackupFile['kind'], now = Date.now(), label = ''): string {
  mkdirSync(dir, { recursive: true })
  const name = kind === 'daily' ? `daily-${stamp(now)}.db` : `${kind}-${stamp(now)}-${time(now)}${label ? `-${label.replace(/[^a-z0-9]+/gi, '_')}` : ''}.db`
  const file = join(dir, name)
  try {
    unlinkSync(file) // VACUUM INTO refuses to overwrite.
  } catch {
    /* not there */
  }
  snapshot(db, file)
  prune(dir)
  return file
}

/** Makes today's daily backup unless it exists already. Returns its path, or null when there was nothing to do. */
export function dailyBackup(db: DB, dir: string, now = Date.now()): string | null {
  if (listBackups(dir).some((b) => b.kind === 'daily' && b.name === `daily-${stamp(now)}.db`)) return null
  return backup(db, dir, 'daily', now)
}

/** 'ok' when SQLite finds nothing wrong, else its first complaints. */
export function integrity(db: DB): { ok: boolean; detail: string } {
  try {
    const rows = db.pragma('quick_check') as { quick_check: string }[]
    const detail = rows.map((r) => r.quick_check).join('; ')
    return { ok: detail === 'ok', detail }
  } catch (e) {
    return { ok: false, detail: String((e as Error).message ?? e) }
  }
}
