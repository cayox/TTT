import { app, BrowserWindow, nativeTheme } from 'electron'
import { createTray } from './tray'
import { staleSessionEnd } from './recovery'
import { EVENT_SESSIONS_CHANGED } from '@shared/ipc'
import { join } from 'node:path'
import { openDb, type DB } from './db'
import { registerIpc } from './ipc'
import { createRepos } from './db/repos'
import { rangeStats, totalBalance, dateKey, startOfDay } from '@shared/time'

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
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'sidebar',
    backgroundColor: '#00000000',
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
  const tray = createTray({
    current: () => r.sessions.current(),
    todayMs,
    toggle: () => (r.sessions.current() ? r.sessions.stop() : r.sessions.start('manual'), changed()),
    open: showWindow,
    quit: () => app.quit()
  })
  function changed(): void {
    syncHeartbeat()
    tray.refresh()
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(EVENT_SESSIONS_CHANGED)
  }
  const notify = <A extends unknown[], R>(f: (...a: A) => R) => (...a: A): R => {
    const res = f(...a)
    changed()
    return res
  }
  syncHeartbeat()

  registerIpc({
    'app:ping': () => 'pong',
    'sessions:current': () => r.sessions.current(),
    'sessions:start': notify(() => r.sessions.start('manual')),
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
    'settings:get': () => r.settings.get(),
    'settings:set': (p) => {
      const res = r.settings.set(p)
      applyLogin()
      return res
    },
    'stats:range': (range) => {
      const i = statsInput()
      return rangeStats(range, i.sessions, r.schedule.get(), i.overrides, r.settings.get(), Date.now(), i.first)
    },
    'stats:balance': () => {
      const i = statsInput()
      return totalBalance(i.sessions, r.schedule.get(), i.overrides, r.settings.get(), Date.now(), i.first)
    }
  })
  createWindow()
  app.on('activate', showWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
