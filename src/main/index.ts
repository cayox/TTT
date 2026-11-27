import { app, BrowserWindow, dialog, globalShortcut, nativeTheme, powerMonitor, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { arch, release } from 'node:os'
import { createTray } from './tray'
import { staleSessionEnd } from './recovery'
import { EVENT_DATA_REPLACED, EVENT_NAVIGATE, EVENT_PROJECTS_CHANGED, EVENT_SESSIONS_CHANGED, EVENT_UPDATE_CHANGED } from '@shared/ipc'
import { join } from 'node:path'
import { openDb, type DB } from './db'
import { registerIpc } from './ipc'
import { createRepos } from './db/repos'
import { integrity, listBackups } from './db/backup'
import { rangeStats, totalBalance, dateKey, startOfDay, projectTotals, addDays, expectedMinutesForDay, workByDay, workedMinutesByDay } from '@shared/time'
import { unionLength } from '@shared/intervals'
import { createWifiWatcher } from './wifi/watcher'
import { getCurrentNetwork } from './wifi/ssid'
import { locate, locationStatus, openLocationSettings, recentFix, registerHelper, requestLocation } from './wifi/location'
import { createExporter } from './export'
import { monthHours, monthTotals } from '@shared/hours'
import { parseChangelog } from '@shared/changelog'
import { createUpdater } from './update'
import { REPO } from './update/releases'
import { createDataTools, backupDirFor } from './data'
import { initLog, recentLog } from './log'
import { createNotifier } from './notify'
import { createAwayWatcher, type AwayChoice } from './away'
import { dueReminders } from './coach'
import { suggestProject } from '@shared/suggest'
import { missingDays } from '@shared/missing'
import { parseTttUrl } from './url'
import { formatClock, formatDuration, formatDurationLong } from '@shared/format'
import type { Session, UpdateState } from '@shared/types'
import type { ChangelogEntry } from '@shared/changelog'

let db: DB
let mainWin: BrowserWindow | null = null
let quitting = false
/** ttt:// links that arrived before the app was ready. */
const pendingUrls: string[] = []
let handleUrl: (url: string) => void = (url) => void pendingUrls.push(url)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    // Matches --bg so there is no flash before the renderer paints.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1917' : '#e8e4dc',
    // The preload only uses contextBridge and ipcRenderer, which work in the sandbox.
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true }
  })
  mainWin = win
  win.on('close', (e) => {
    if (!quitting) (e.preventDefault(), win.hide())
  })
  win.on('closed', () => (mainWin = null))
  win.once('ready-to-show', () => win.show())
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.error('[renderer]', e.message)
  })
  win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer] gone', d.reason))
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function showWindow(): void {
  if (!mainWin) createWindow()
  else (mainWin.show(), mainWin.focus())
}

if (!app.requestSingleInstanceLock()) app.quit()
else app.on('second-instance', showWindow)
app.on('before-quit', () => (quitting = true))
// macOS delivers ttt:// links here, also when the click launched the app.
app.on('open-url', (e, url) => {
  e.preventDefault()
  handleUrl(url)
})

app.whenReady().then(async () => {
  if (quitting) return
  const userData = app.getPath('userData')
  const logFile = initLog(join(userData, 'logs'))
  // Packaged builds get the icon from build/icon.icns; in dev the Dock would show Electron's.
  if (!app.isPackaged) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  app.setAboutPanelOptions({ applicationName: 'TTT', credits: 'Time Tracking Tool' })
  if (app.isPackaged) app.setAsDefaultProtocolClient('ttt')
  nativeTheme.themeSource = 'system'
  const dbFile = join(userData, 'ttt.db')
  const backupDir = backupDirFor(userData)
  db = openDb(dbFile, { backupDir })
  const r = createRepos(db)

  // A damaged database: offer the newest backup before anything writes to it.
  const health = integrity(db)
  if (!health.ok) {
    console.error('[db] integrity check failed:', health.detail)
    const latest = listBackups(backupDir)[0]
    const { response } = await dialog.showMessageBox({
      type: 'error',
      message: "TTT's database looks damaged",
      detail: `SQLite reports: ${health.detail.slice(0, 300)}\n\n${latest ? `The newest backup is from ${new Date(latest.at).toLocaleString()}.` : 'There is no backup to restore.'}`,
      buttons: latest ? ['Restore backup', 'Continue anyway', 'Quit'] : ['Continue anyway', 'Quit'],
      defaultId: 0,
      cancelId: latest ? 2 : 1
    })
    const choice = latest ? ['restore', 'continue', 'quit'][response] : ['continue', 'quit'][response]
    if (choice === 'quit') return app.quit()
    if (choice === 'restore' && latest) {
      const { copyFileSync, existsSync, unlinkSync } = await import('node:fs')
      db.close()
      for (const ext of ['-wal', '-shm']) if (existsSync(dbFile + ext)) unlinkSync(dbFile + ext)
      copyFileSync(join(backupDir, latest.name), dbFile)
      app.relaunch()
      return app.exit(0)
    }
  }

  const statsInput = () => {
    const first = r.sessions.firstStart()
    const from = dateKey(Math.min(first ?? Date.now(), Date.now() - 400 * 864e5))
    return { first, overrides: r.overrides.list(from, '9999-12-31'), sessions: r.sessions.list(0, Date.now() + 864e5) }
  }
  const meta = {
    get: (k: string): number | null => {
      const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(k) as { value: string } | undefined
      return row ? Number(row.value) : null
    },
    set: (k: string, v: number): void => void db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(k, String(v)),
    del: (k: string): void => void db.prepare('DELETE FROM meta WHERE key = ?').run(k)
  }
  const notify = createNotifier({ enabled: () => r.settings.get().notifications, onClick: showWindow })
  const projectName = (id: number | null | undefined): string | null => (id == null ? null : (r.projects.get(id)?.name ?? null))

  // Auto-tracking by work network or work place: sessions started here go to its project.
  const watcher = createWifiWatcher({
    getNetwork: getCurrentNetwork,
    getLocation: () => recentFix(),
    getSettings: () => r.settings.get(),
    now: Date.now,
    isRunning: () => !!r.sessions.current(),
    isWifiSession: () => r.sessions.current()?.source === 'wifi',
    learnRouter: (name, routerId) => {
      r.settings.set({ networkRouters: { ...r.settings.get().networkRouters, [name]: routerId } })
    },
    onStart: (ssid) => {
      const s = r.sessions.start('wifi', Date.now(), r.projects.forSsid(ssid))
      changed()
      const p = projectName(s.projectId)
      notify('autoTrack', 'Tracking started', `At ${ssid}${p ? `, for ${p}` : ''}. Pause any time from the menu bar.`)
    },
    onStop: (endTs) => {
      r.sessions.stop(endTs)
      changed()
      notify(
        'autoTrack',
        'Tracking stopped',
        `You left work. The session ended at ${formatClock(endTs)}; ${formatDuration(todayMs() / 60000)} today.`
      )
    }
  })

  const now0 = Date.now()
  const stale = r.sessions.current()
  const staleEnd = stale ? staleSessionEnd(stale, meta.get('heartbeat'), startOfDay(now0), now0) : null
  if (staleEnd !== null) r.sessions.stop(staleEnd)

  // Planned clock-out ("stop at 17:00"), kept in meta so it survives a restart.
  let stopTimer: NodeJS.Timeout | null = null
  let warnTimer: NodeJS.Timeout | null = null
  const clearTimers = (): void => {
    if (stopTimer) (clearTimeout(stopTimer), (stopTimer = null))
    if (warnTimer) (clearTimeout(warnTimer), (warnTimer = null))
  }
  const clearPlannedStop = (): void => {
    clearTimers()
    meta.del('plannedStop')
  }
  /** Ends the running session at ts, and keeps Wi-Fi from starting a new one before you have left. */
  const clockOut = (ts: number = Date.now()) => {
    clearPlannedStop()
    watcher.holdUntilLeave()
    return r.sessions.stop(ts)
  }
  const WARN_BEFORE = 10 * 60000
  const armPlannedStop = (): void => {
    clearTimers()
    const at = meta.get('plannedStop')
    if (at === null) return
    if (!r.sessions.current()) return clearPlannedStop()
    const fire = (): void => {
      if (r.sessions.current()) {
        clockOut(at)
        notify('clockOut', `Clocked out at ${formatClock(at)}`, `${formatDuration(todayMs() / 60000)} today. Have a good evening.`)
      } else clearPlannedStop()
      changed()
    }
    // setTimeout tops out around 24.8 days; a plan is never that far out, but re-check in steps anyway.
    const wait = at - Date.now()
    if (wait <= 0) return fire()
    stopTimer = setTimeout(() => (Date.now() >= at ? fire() : armPlannedStop()), Math.min(wait, 3600000))
    if (wait > WARN_BEFORE && wait - WARN_BEFORE <= 3600000)
      warnTimer = setTimeout(() => {
        if (r.sessions.current() && meta.get('plannedStop') === at)
          notify('clockOut', `Clocking out at ${formatClock(at)}`, 'In 10 minutes. Change or cancel it on Today.')
      }, wait - WARN_BEFORE)
  }

  const applyLogin = (): void => {
    if (app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32'))
      app.setLoginItemSettings({ openAtLogin: r.settings.get().launchAtLogin })
  }
  applyLogin()

  /** Today's work, time covered twice counted once. */
  const todayMs = (): number => {
    const now = Date.now()
    const ds = startOfDay(now)
    return unionLength(r.sessions.list(ds, now + 1).map((s) => ({ a: Math.max(s.startTs, ds), b: Math.min(s.endTs ?? now, now) })))
  }
  let hb: NodeJS.Timeout | null = null
  const syncHeartbeat = (): void => {
    const running = !!r.sessions.current()
    if (running && !hb) {
      meta.set('heartbeat', Date.now())
      hb = setInterval(() => meta.set('heartbeat', Date.now()), 30000)
    } else if (!running && hb) (clearInterval(hb), (hb = null))
  }
  const suggest = (): number | null => {
    const now = Date.now()
    return suggestProject(
      r.sessions.list(now - 57 * 864e5, now),
      now,
      r.projects.list(false).map((p) => p.id)
    )
  }
  /** projectId undefined = your usual project at this time, else the default. */
  const startManual = (projectId?: number | null) => {
    watcher.markManual()
    clearPlannedStop()
    return r.sessions.start('manual', Date.now(), projectId === undefined ? (suggest() ?? undefined) : projectId)
  }
  const toggle = (): Session | null => {
    const res = r.sessions.current() ? clockOut() : startManual()
    changed()
    return res
  }
  const tray = createTray({
    current: () => r.sessions.current(),
    todayMs,
    todayExpectedMin: () => {
      const d = dateKey(Date.now())
      const { expectedMin, credited } = expectedMinutesForDay(d, r.schedule.get(), r.overrides.list(d, d)[0], r.settings.get())
      // A credited day off is already complete; there is nothing to fill.
      return credited ? 0 : expectedMin
    },
    toggle: () => void toggle(),
    plannedStop: () => meta.get('plannedStop'),
    projects: () => r.projects.list(false),
    startOn: (id) => {
      const cur = r.sessions.current()
      if (cur) r.sessions.update(cur.id, { projectId: id })
      else startManual(id)
      changed()
    },
    open: showWindow,
    quit: () => app.quit()
  })
  function broadcast(channel: string, ...args: unknown[]): void {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
  function changed(): void {
    if (!r.sessions.current() && meta.get('plannedStop') !== null) clearPlannedStop()
    syncHeartbeat()
    tray.refresh()
    broadcast(EVENT_SESSIONS_CHANGED)
  }
  function projectsChanged(): void {
    tray.refresh()
    broadcast(EVENT_PROJECTS_CHANGED)
  }
  const notifyProjects =
    <A extends unknown[], R>(f: (...a: A) => R) =>
    (...a: A): R => {
      const res = f(...a)
      projectsChanged()
      return res
    }
  const notifyChanged =
    <A extends unknown[], R>(f: (...a: A) => R) =>
    (...a: A): R => {
      const res = f(...a)
      changed()
      return res
    }
  syncHeartbeat()
  armPlannedStop()

  // Time away from the Mac: idle or asleep while a session runs. Asks once you are back.
  const askAway = async ({ from, to }: { from: number; to: number }): Promise<AwayChoice> => {
    const opts = {
      type: 'question' as const,
      message: `You were away from ${formatClock(from)} to ${formatClock(to)}`,
      detail: `${formatDurationLong((to - from) / 60000)} without using your Mac while the timer ran. Was that work?`,
      buttons: ['Keep it as work', 'Remove it, keep tracking', 'Remove it and pause'],
      defaultId: 1,
      cancelId: 0
    }
    app.focus({ steal: true })
    const res = mainWin?.isVisible() ? await dialog.showMessageBox(mainWin, opts) : await dialog.showMessageBox(opts)
    return (['keep', 'dropContinue', 'dropPause'] as const)[res.response] ?? 'keep'
  }
  const away = createAwayWatcher({
    now: Date.now,
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    current: () => r.sessions.current(),
    idleMinutes: () => r.settings.get().idleMinutes,
    maxSessionHours: () => r.settings.get().maxSessionHours,
    ask: askAway,
    stopAt: (ts) => {
      clockOut(ts)
      changed()
    },
    resumeAt: (ts, like) => {
      r.sessions.add({ startTs: ts, endTs: null, source: like.source, note: '', projectId: like.projectId })
      changed()
    },
    onForgotten: (e) => {
      if (e.kind === 'stopped')
        notify(
          'forgotten',
          'Stopped a forgotten session',
          `It had been running since ${formatClock(e.session.startTs)}. It now ends at ${formatClock(e.at)}, when you were last at your Mac.`
        )
      else notify('forgotten', `Tracking for ${e.hours} hours`, 'Still working? Pause from the menu bar if you forgot to stop.')
    }
  })
  powerMonitor.on('suspend', () => {
    // Wi-Fi sessions handle sleep themselves (the watcher ends them at the last sighting).
    if (r.sessions.current()?.source === 'manual') away.suspended(Date.now())
  })
  powerMonitor.on('resume', () => {
    away.resumed()
    tray.refresh()
    broadcast(EVENT_SESSIONS_CHANGED)
  })
  const awayTimer = setInterval(() => {
    try {
      away.tick()
    } catch (e) {
      console.error('[away] tick failed', e)
    }
  }, 15000)

  // Reminders during the day: hours done, breaks due. Each at most once a day.
  const sent = new Map<string, string>()
  const coachTick = (): void => {
    const cur = r.sessions.current()
    if (!cur) return
    const now = Date.now()
    const today = dateKey(now)
    const settings = r.settings.get()
    const sessions = r.sessions.list(startOfDay(now), now + 1)
    const work = workByDay(sessions, now)[today] ?? []
    const ov = r.overrides.list(today, today)[0]
    const { expectedMin, credited } = expectedMinutesForDay(today, r.schedule.get(), ov, settings)
    const countedMin = workedMinutesByDay(sessions, now, settings)[today] ?? 0
    for (const rem of dueReminders({ now, work, running: true, expectedMin, credited, breakRules: settings.breakRules, countedMin })) {
      const k = `notified:${rem.key}`
      if (sent.get(k) === today || meta.get(k) === startOfDay(now)) continue
      sent.set(k, today)
      meta.set(k, startOfDay(now))
      notify(rem.kind, rem.title, rem.body)
    }
  }
  const coachTimer = setInterval(() => {
    try {
      coachTick()
    } catch (e) {
      console.error('[coach] tick failed', e)
    }
  }, 30000)

  const exporter = createExporter(r, statsInput)
  const data = createDataTools({
    db,
    repos: r,
    dbFile,
    backupDir,
    saveText: exporter.saveText,
    onReplaced: () => {
      clearPlannedStop()
      changed()
      projectsChanged()
      broadcast(EVENT_DATA_REPLACED)
    }
  })
  // One backup a day: at launch, and checked every few hours for Macs that never quit TTT.
  data.daily()
  const backupTimer = setInterval(() => data.daily(), 3 * 3600000)

  // Start or pause from anywhere.
  let shortcut = ''
  const applyShortcut = (accel: string): boolean => {
    if (accel === shortcut) return true
    if (shortcut) globalShortcut.unregister(shortcut)
    shortcut = ''
    if (!accel) return true
    const ok = globalShortcut.register(accel, () => {
      const s = toggle()
      const running = !!r.sessions.current()
      const p = projectName(s?.projectId)
      notify(
        'always',
        running ? 'Tracking started' : 'Paused',
        running ? (p ? `On ${p}.` : 'Timer is running.') : `${formatDuration(todayMs() / 60000)} today.`
      )
    })
    if (ok) shortcut = accel
    return ok
  }
  if (!applyShortcut(r.settings.get().globalShortcut)) console.warn('[shortcut] could not register', r.settings.get().globalShortcut)

  // ttt://start?project=Name, ttt://pause, ttt://toggle, ttt://open?page=history
  handleUrl = (url: string): void => {
    const a = parseTttUrl(url)
    if (!a) return console.warn('[url] ignored', url)
    if (a.kind === 'start') {
      const want = a.project?.toLowerCase()
      const p = want ? r.projects.list(false).find((x) => String(x.id) === want || x.name.trim().toLowerCase() === want) : undefined
      const cur = r.sessions.current()
      if (cur && p) r.sessions.update(cur.id, { projectId: p.id })
      else if (!cur) startManual(p?.id)
    } else if (a.kind === 'pause') {
      if (r.sessions.current()) clockOut()
    } else if (a.kind === 'toggle') return void toggle()
    else if (a.kind === 'open') {
      showWindow()
      if (a.page) broadcast(EVENT_NAVIGATE, a.page)
      return
    }
    changed()
  }
  for (const u of pendingUrls.splice(0)) handleUrl(u)

  // Bundled as an extra resource; in dev it is read straight from the repo.
  let changelog: ChangelogEntry[] | null = null
  const readChangelog = (): ChangelogEntry[] => {
    if (changelog) return changelog
    const paths = [join(process.resourcesPath ?? '', 'CHANGELOG.md'), join(app.getAppPath(), '../../CHANGELOG.md'), join(process.cwd(), 'CHANGELOG.md')]
    for (const p of paths) {
      try {
        return (changelog = parseChangelog(readFileSync(p, 'utf8')))
      } catch {
        /* try the next one */
      }
    }
    return (changelog = [])
  }

  const updater = createUpdater({
    currentVersion: app.getVersion(),
    tempDir: app.getPath('temp'),
    getSettings: () => r.settings.get(),
    setSettings: (patch) => void r.settings.set(patch),
    onChange: (state: UpdateState) => broadcast(EVENT_UPDATE_CHANGED, state),
    quit: () => app.quit()
  })
  app.on('before-quit', () => {
    updater.stop()
    clearInterval(awayTimer)
    clearInterval(coachTimer)
    clearInterval(backupTimer)
    globalShortcut.unregisterAll()
  })

  const diagnostics = (): string => {
    const s = r.settings.get()
    const counts = db.prepare('SELECT COUNT(*) AS n, MIN(start_ts) AS first FROM sessions').get() as { n: number; first: number | null }
    const b = listBackups(backupDir)
    // No session contents, notes, names or network names: only shapes and counts.
    return [
      `TTT ${app.getVersion()} (${app.isPackaged ? 'packaged' : 'dev'})`,
      `Electron ${process.versions.electron}, macOS ${process.getSystemVersion?.() ?? release()}, ${arch()}`,
      `Sessions: ${counts.n}${counts.first ? `, since ${dateKey(counts.first)}` : ''}; running: ${r.sessions.current() ? 'yes' : 'no'}`,
      `Projects: ${r.projects.list().length}; work networks: ${s.workSsids.length}; work places: ${s.workPlaces.length}; auto-track: ${s.autoTrack}`,
      `Monthly hours: ${s.monthlyHoursByProject ? 'per project' : s.monthlyHoursMin ? 'total' : 'off'}; break rules: ${s.breakRules}; deduct: ${s.deductBreaks}`,
      `Idle ask: ${s.idleMinutes} min; forgotten after: ${s.maxSessionHours} h; shortcut: ${shortcut || 'off'}`,
      `Database: ${integrity(db).detail}; schema v${db.pragma('user_version', { simple: true })}; backups: ${b.length}${b[0] ? `, newest ${new Date(b[0].at).toISOString()}` : ''}`,
      '',
      'Recent log:',
      ...recentLog().slice(-80)
    ].join('\n')
  }

  registerIpc({
    'app:ping': () => 'pong',
    'app:version': () => app.getVersion(),
    'app:changelog': () => readChangelog(),
    'app:diagnostics': () => diagnostics(),
    'app:revealLog': () => shell.showItemInFolder(logFile),
    'sessions:current': () => r.sessions.current(),
    'sessions:start': notifyChanged((projectId) => startManual(projectId)),
    'sessions:stop': notifyChanged(() => clockOut()),
    'sessions:stopAt': notifyChanged((endTs) => {
      const cur = r.sessions.current()
      if (!cur || !Number.isFinite(endTs)) return cur
      if (endTs <= Date.now()) return clockOut(Math.max(endTs, cur.startTs))
      meta.set('plannedStop', endTs)
      armPlannedStop()
      return cur
    }),
    'sessions:plannedStop': () => (r.sessions.current() ? meta.get('plannedStop') : null),
    'sessions:cancelPlannedStop': notifyChanged(() => clearPlannedStop()),
    'sessions:list': (a, b) => r.sessions.list(a, b),
    'sessions:add': notifyChanged((s) => r.sessions.add(s)),
    'sessions:update': notifyChanged((id, patch) => r.sessions.update(id, patch)),
    'sessions:remove': notifyChanged((id) => r.sessions.remove(id)),
    'sessions:suggest': () => suggest(),
    'schedule:get': () => r.schedule.get(),
    'schedule:set': (s) => (r.schedule.set(s), r.schedule.get()),
    'overrides:list': (a, b) => r.overrides.list(a, b),
    'overrides:set': (o) => r.overrides.set(o),
    'overrides:remove': (d) => r.overrides.remove(d),
    'projects:list': () => r.projects.list(),
    'projects:add': notifyProjects((p) => r.projects.add(p)),
    'projects:update': notifyProjects((id, patch) => r.projects.update(id, patch)),
    'projects:remove': notifyProjects((id) => {
      r.projects.remove(id)
      changed()
    }),
    'projects:usage': () => r.projects.usage(),
    'wifi:current': () => getCurrentNetwork(),
    'wifi:locationStatus': () => locationStatus(),
    'wifi:requestLocation': () => requestLocation(mainWin),
    'wifi:openLocationSettings': () => openLocationSettings(),
    'wifi:location': () => locate(),
    'export:pdf': (y, m) => exporter.pdf(mainWin, y, m),
    'export:copyText': (y, m) => exporter.copyText(y, m),
    'export:openWhatsapp': (y, m) => exporter.openWhatsapp(y, m),
    'export:csv': (y, m) => exporter.csv(mainWin, y, m),
    'export:ics': (y, m) => exporter.ics(mainWin, y, m),
    'export:openLast': () => exporter.openLast(),
    'export:revealLast': () => exporter.revealLast(),
    'export:shareLast': () => exporter.shareLast(mainWin),
    'data:exportJson': () => data.exportJson(mainWin),
    'data:exportCsv': () => data.exportCsv(mainWin),
    'data:import': () => data.importJson(mainWin),
    'data:backups': () => data.info(),
    'data:backupNow': () => data.backupNow(),
    'data:openBackups': () => data.openFolder(),
    'data:restore': (name) => data.restore(mainWin, name),
    'update:state': () => updater.state(),
    'update:check': () => updater.check(true),
    'update:download': () => updater.download(),
    'update:install': () => updater.install(),
    'update:skip': (version) => updater.skip(version),
    'update:dismiss': () => updater.dismiss(),
    'update:openRelease': (version) => {
      const v = version ?? updater.state().releases[0]?.version
      void shell.openExternal(v ? `https://github.com/${REPO}/releases/tag/v${v}` : `https://github.com/${REPO}/releases`)
    },
    'settings:get': () => r.settings.get(),
    'settings:set': (p) => {
      // Claim the shortcut first: when another app holds it, nothing is saved.
      if (p.globalShortcut !== undefined && !applyShortcut(p.globalShortcut))
        throw new Error('That shortcut is already used by another app or by macOS. Pick another one.')
      const res = r.settings.set(p)
      applyLogin()
      return res
    },
    'stats:range': (range) => {
      const i = statsInput()
      const settings = r.settings.get()
      const st = rangeStats(range, i.sessions, r.schedule.get(), i.overrides, settings, Date.now(), i.first)
      // All time includes the carried-over starting balance, matching the running balance.
      return range === 'all' ? { ...st, balance: st.balance + settings.startingBalance } : st
    },
    'stats:month': () => {
      const i = statsInput()
      const settings = r.settings.get()
      // Split hours only count active projects.
      const active = r.projects.list(false).map((p) => String(p.id))
      const projectMin = settings.monthlyHoursByProject ? Object.fromEntries(active.map((id) => [id, settings.projectMonthlyMin[id] ?? 0])) : null
      return monthHours({
        contractMin: settings.monthlyHoursMin,
        projectMin,
        sessions: i.sessions,
        schedule: r.schedule.get(),
        overrides: i.overrides,
        settings,
        now: Date.now()
      })
    },
    'stats:months': (count) => {
      const i = statsInput()
      return monthTotals({
        count: Math.max(1, Math.min(24, count)),
        sessions: i.sessions,
        schedule: r.schedule.get(),
        overrides: i.overrides,
        settings: r.settings.get(),
        now: Date.now()
      })
    },
    'stats:projects': (range) => {
      const i = statsInput()
      const now = Date.now()
      const days = rangeStats(range, i.sessions, r.schedule.get(), i.overrides, r.settings.get(), now, i.first).days
      if (!days.length) return []
      return projectTotals(i.sessions, startOfDay(days[0].date), startOfDay(addDays(dateKey(now), 1)), now)
    },
    'stats:balance': () => {
      const i = statsInput()
      const settings = r.settings.get()
      return settings.startingBalance + totalBalance(i.sessions, r.schedule.get(), i.overrides, settings, Date.now(), i.first)
    },
    'stats:missing': () => {
      const now = Date.now()
      const today = dateKey(now)
      const first = r.sessions.firstStart()
      if (first === null) return []
      // Only the last few weeks: older gaps are history, not something to fix today.
      const from = [dateKey(first), addDays(today, -42)].sort()[1]
      const sessions = r.sessions.list(startOfDay(from), startOfDay(today))
      return missingDays({
        from,
        today,
        worked: workedMinutesByDay(sessions, now),
        schedule: r.schedule.get(),
        overrides: r.overrides.list(from, today),
        settings: r.settings.get()
      })
    }
  })
  // Register the helper before the first poll, so macOS knows it as an app even right after an update.
  void registerHelper().finally(() => watcher.start())
  updater.start()
  createWindow()
  app.on('activate', showWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
