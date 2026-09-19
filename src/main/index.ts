import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { openDb, type DB } from './db'
import { registerIpc } from './ipc'
import { createRepos } from './db/repos'
import { rangeStats, totalBalance, dateKey } from '@shared/time'

let db: DB

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
  win.once('ready-to-show', () => win.show())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'system'
  db = openDb(join(app.getPath('userData'), 'ttt.db'))
  const r = createRepos(db)
  const statsInput = () => {
    const first = r.sessions.firstStart()
    const from = dateKey(Math.min(first ?? Date.now(), Date.now() - 400 * 864e5))
    return { first, overrides: r.overrides.list(from, '9999-12-31'), sessions: r.sessions.list(0, Date.now() + 864e5) }
  }
  registerIpc({
    'app:ping': () => 'pong',
    'sessions:current': () => r.sessions.current(),
    'sessions:start': () => r.sessions.start('manual'),
    'sessions:stop': () => r.sessions.stop(),
    'sessions:list': (a, b) => r.sessions.list(a, b),
    'sessions:add': (s) => r.sessions.add(s),
    'sessions:update': (id, patch) => r.sessions.update(id, patch),
    'sessions:remove': (id) => r.sessions.remove(id),
    'schedule:get': () => r.schedule.get(),
    'schedule:set': (s) => (r.schedule.set(s), r.schedule.get()),
    'overrides:list': (a, b) => r.overrides.list(a, b),
    'overrides:set': (o) => r.overrides.set(o),
    'overrides:remove': (d) => r.overrides.remove(d),
    'settings:get': () => r.settings.get(),
    'settings:set': (p) => r.settings.set(p),
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
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
