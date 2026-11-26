import { app, dialog, shell, type BrowserWindow } from 'electron'
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { DB } from './db'
import type { Repos } from './db/repos'
import { backup, dailyBackup, listBackups } from './db/backup'
import type { BackupInfo } from '@shared/types'
import { parseDump, sessionsCsv, type DataDump } from '@shared/data'
import { cleanPatch } from '@shared/settings'
import { dateKey } from '@shared/time'


/** Full JSON export/import, CSV of everything, and the backup folder. */
export function createDataTools(o: {
  db: DB
  repos: Repos
  dbFile: string
  backupDir: string
  saveText: (parent: BrowserWindow | null, title: string, name: string, ext: string, text: string) => Promise<string | null>
  /** Called after an import replaced the data, so every view reloads. */
  onReplaced: () => void
}) {
  const r = o.repos

  function dump(): DataDump {
    return {
      app: 'TTT',
      format: 1,
      exportedAt: Date.now(),
      version: app.getVersion(),
      sessions: r.sessions.list(0, Number.MAX_SAFE_INTEGER),
      projects: r.projects.list(),
      schedule: r.schedule.get(),
      overrides: r.overrides.list('0000-01-01', '9999-12-31'),
      settings: r.settings.get()
    }
  }

  /** Replaces all data with the dump, in one transaction. Device-specific settings stay as they are. */
  function replaceAll(d: DataDump): void {
    const keep = r.settings.get()
    const { clean } = cleanPatch(d.settings as Record<string, unknown>)
    // These belong to this Mac, not to the data.
    const local = {
      launchAtLogin: keep.launchAtLogin,
      autoCheckUpdates: keep.autoCheckUpdates,
      skippedUpdate: keep.skippedUpdate,
      onboarded: true,
      globalShortcut: keep.globalShortcut
    }
    o.db.transaction(() => {
      o.db.exec('DELETE FROM sessions; DELETE FROM projects; DELETE FROM schedule; DELETE FROM day_overrides; DELETE FROM settings;')
      const p = o.db.prepare('INSERT INTO projects (id, name, color, archived) VALUES (?, ?, ?, ?)')
      for (const x of d.projects) p.run(x.id, x.name, x.color, x.archived ? 1 : 0)
      const s = o.db.prepare('INSERT INTO sessions (id, start_ts, end_ts, source, note, project_id) VALUES (?, ?, ?, ?, ?, ?)')
      for (const x of d.sessions) s.run(x.id, x.startTs, x.endTs, x.source, x.note, x.projectId)
      const ov = o.db.prepare('INSERT OR REPLACE INTO day_overrides (date, kind, expected_minutes) VALUES (?, ?, ?)')
      for (const x of d.overrides) ov.run(x.date, x.kind, x.expectedMinutes)
      r.schedule.set(d.schedule)
      r.settings.set({ ...clean, ...local })
      if (!d.projects.length) o.db.prepare("INSERT INTO projects (name, color) VALUES ('General', 'brass')").run()
    })()
  }

  return {
    async exportJson(parent: BrowserWindow | null): Promise<string | null> {
      return o.saveText(parent, 'Export all data', `TTT data ${dateKey(Date.now())}.json`, 'json', JSON.stringify(dump(), null, 2))
    },
    async exportCsv(parent: BrowserWindow | null): Promise<string | null> {
      const text = '﻿' + sessionsCsv(r.sessions.list(0, Number.MAX_SAFE_INTEGER), r.projects.list(), Date.now())
      return o.saveText(parent, 'Export all sessions as CSV', `TTT sessions ${dateKey(Date.now())}.csv`, 'csv', text)
    },
    /** Asks for a TTT JSON export, confirms, backs up the current data, then replaces it. Returns false when cancelled. */
    async importJson(parent: BrowserWindow | null): Promise<boolean> {
      const opts = { title: 'Import TTT data', properties: ['openFile' as const], filters: [{ name: 'TTT export', extensions: ['json'] }] }
      const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || !res.filePaths[0]) return false
      const d = parseDump(readFileSync(res.filePaths[0], 'utf8'))
      const ask = {
        type: 'warning' as const,
        message: 'Replace all data with this export?',
        detail: `It has ${d.sessions.length} sessions and ${d.projects.length} projects${d.exportedAt ? `, exported ${new Date(d.exportedAt).toLocaleString()}` : ''}. Everything in TTT now is replaced. A backup of your current data is saved first, so you can go back.`,
        buttons: ['Replace data', 'Cancel'],
        defaultId: 1,
        cancelId: 1
      }
      const { response } = parent ? await dialog.showMessageBox(parent, ask) : await dialog.showMessageBox(ask)
      if (response !== 0) return false
      backup(o.db, o.backupDir, 'import')
      replaceAll(d)
      o.onReplaced()
      return true
    },
    info(): BackupInfo {
      return { dir: o.backupDir, backups: listBackups(o.backupDir).map(({ path: _p, ...b }) => b) }
    },
    backupNow(): string {
      return backup(o.db, o.backupDir, 'manual')
    },
    daily(): void {
      try {
        dailyBackup(o.db, o.backupDir)
      } catch (e) {
        console.error('[backup] daily backup failed', e)
      }
    },
    openFolder(): void {
      void shell.openPath(o.backupDir)
    },
    /**
     * Restores a backup by name: confirms, backs up the current data, swaps the file and restarts.
     * Returns false when cancelled. Never returns otherwise (the app relaunches).
     */
    async restore(parent: BrowserWindow | null, name: string): Promise<boolean> {
      const b = listBackups(o.backupDir).find((x) => x.name === name)
      if (!b) throw new Error('That backup no longer exists')
      const ask = {
        type: 'warning' as const,
        message: `Restore the backup from ${new Date(b.at).toLocaleString()}?`,
        detail: 'Everything tracked since then is replaced by the backup. Your current data is backed up first. TTT restarts afterwards.',
        buttons: ['Restore and restart', 'Cancel'],
        defaultId: 1,
        cancelId: 1
      }
      const { response } = parent ? await dialog.showMessageBox(parent, ask) : await dialog.showMessageBox(ask)
      if (response !== 0) return false
      backup(o.db, o.backupDir, 'manual', Date.now(), 'before-restore')
      o.db.close()
      for (const ext of ['-wal', '-shm']) if (existsSync(o.dbFile + ext)) unlinkSync(o.dbFile + ext)
      copyFileSync(b.path, o.dbFile)
      app.relaunch()
      app.exit(0)
      return true
    }
  }
}

/** Where backups live, next to the database. */
export const backupDirFor = (userData: string): string => join(userData, 'backups')
