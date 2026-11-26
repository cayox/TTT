import Database from 'better-sqlite3'
import { migrations } from './migrations'
import { backup } from './backup'

export type DB = Database.Database

/** Opens (and migrates) the database. With backupDir, an existing database is backed up before it is migrated. */
export function openDb(file: string, opts: { backupDir?: string } = {}): DB {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const version = db.pragma('user_version', { simple: true }) as number
  if (opts.backupDir && file !== ':memory:' && version > 0 && version < migrations.length) {
    try {
      backup(db, opts.backupDir, 'migration', Date.now(), `v${version}`)
    } catch (e) {
      console.error('[db] backup before migration failed', e)
    }
  }
  migrate(db)
  return db
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}
