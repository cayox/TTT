import { app, BrowserWindow, nativeTheme } from 'electron'
import { createTray } from './tray'
import { staleSessionEnd } from './recovery'
import { EVENT_PROJECTS_CHANGED, EVENT_SESSIONS_CHANGED } from '@shared/ipc'
import { join } from 'node:path'
import { openDb, type DB } from './db'
import { registerIpc } from './ipc'
import { createRepos } from './db/repos'
import { rangeStats, totalBalance, dateKey, startOfDay, projectTotals, addDays, expectedMinutesForDay } from '@shared/time'
import { createWifiWatcher } from './wifi/watcher'
import { getCurrentNetwork } from './wifi/ssid'
import { createExporter } from './export'
import { monthHours, monthTotals } from '@shared/hours'

let db: DB
let mainWin: BrowserWindow | null = null
let quitting = false

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
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  mainWin = win
  win.on('close', (e) => {
    if (!quitting) (e.preventDefault(), win.hide())
  })
  win.on('closed', () => (mainWin = null))
  win.once('ready-to-show', () => win.show())
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

app.whenReady().then(() => {
  if (quitting) return
  // Packaged builds get the icon from build/icon.icns; in dev the Dock would show Electron's.
  if (!app.isPackaged) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  app.setAboutPanelOptions({ applicationName: 'TTT', credits: 'Time Tracking Tool' })
  nativeTheme.themeSource = 'system'
  db = openDb(join(app.getPath('userData'), 'ttt.db'))
  const r = createRepos(db)
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
    set: (k: string, v: number): void => void db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(k, String(v))
  }
  // Wi-Fi auto-tracking: sessions started here go to the network's project.
  const watcher = createWifiWatcher({
    getNetwork: getCurrentNetwork,
    getSettings: () => r.settings.get(),
    now: Date.now,
    isRunning: () => !!r.sessions.current(),
    onStart: (ssid) => {
      r.sessions.start('wifi', Date.now(), r.projects.forSsid(ssid))
      changed()
    },
    onStop: (endTs) => {
      r.sessions.stop(endTs)
      changed()
    }
  })

  const now0 = Date.now()
  const stale = r.sessions.current()
  const staleEnd = stale ? staleSessionEnd(stale, meta.get('heartbeat'), startOfDay(now0), now0) : null
  if (staleEnd !== null) r.sessions.stop(staleEnd)

  const applyLogin = (): void => {
    if (app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32'))
      app.setLoginItemSettings({ openAtLogin: r.settings.get().launchAtLogin })
  }
  applyLogin()

  const todayMs = (): number => {
    const now = Date.now(), ds = startOfDay(now)
    return r.sessions.list(ds, now + 1).reduce((a, s) => a + Math.max(0, Math.min(s.endTs ?? now, now) - Math.max(s.startTs, ds)), 0)
  }
  let hb: NodeJS.Timeout | null = null
  const syncHeartbeat = (): void => {
    const running = !!r.sessions.current()
    if (running && !hb) {
      meta.set('heartbeat', Date.now())
      hb = setInterval(() => meta.set('heartbeat', Date.now()), 30000)
    } else if (!running && hb) (clearInterval(hb), (hb = null))
  }
  const startManual = (projectId?: number | null) => {
    watcher.markManual()
    return r.sessions.start('manual', Date.now(), projectId)
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
    toggle: () => (r.sessions.current() ? r.sessions.stop() : startManual(), changed()),
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
  function changed(): void {
    syncHeartbeat()
    tray.refresh()
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(EVENT_SESSIONS_CHANGED)
  }
  function projectsChanged(): void {
    tray.refresh()
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(EVENT_PROJECTS_CHANGED)
  }
  const notifyProjects = <A extends unknown[], R>(f: (...a: A) => R) => (...a: A): R => {
    const res = f(...a)
    projectsChanged()
    return res
  }
  const notify = <A extends unknown[], R>(f: (...a: A) => R) => (...a: A): R => {
    const res = f(...a)
    changed()
    return res
  }
  syncHeartbeat()

  const exporter = createExporter(r, statsInput)

  registerIpc({
    'app:ping': () => 'pong',
    'app:version': () => app.getVersion(),
    'sessions:current': () => r.sessions.current(),
    'sessions:start': notify((projectId) => startManual(projectId)),
    'sessions:stop': notify(() => r.sessions.stop()),
    'sessions:list': (a, b) => r.sessions.list(a, b),
    'sessions:add': notify((s) => r.sessions.add(s)),
    'sessions:update': notify((id, patch) => r.sessions.update(id, patch)),
    'sessions:remove': notify((id) => r.sessions.remove(id)),
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
    'export:pdf': (y, m) => exporter.pdf(mainWin, y, m),
    'export:copyText': (y, m) => exporter.copyText(y, m),
    'export:openWhatsapp': (y, m) => exporter.openWhatsapp(y, m),
    'export:openLast': () => exporter.openLast(),
    'export:revealLast': () => exporter.revealLast(),
    'export:shareLast': () => exporter.shareLast(mainWin),
    'settings:get': () => r.settings.get(),
    'settings:set': (p) => {
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
      return monthHours({ contractMin: settings.monthlyHoursMin, projectMin, sessions: i.sessions, schedule: r.schedule.get(), overrides: i.overrides, settings, now: Date.now() })
    },
    'stats:months': (count) => {
      const i = statsInput()
      return monthTotals({ count: Math.max(1, Math.min(24, count)), sessions: i.sessions, schedule: r.schedule.get(), overrides: i.overrides, settings: r.settings.get(), now: Date.now() })
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
    }
  })
  watcher.start()
  createWindow()
  app.on('activate', showWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
