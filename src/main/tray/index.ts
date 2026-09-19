import { Menu, Tray } from 'electron'
import type { Session } from '@shared/types'
import { trayIcon } from './icon'

export interface TrayDeps {
  current: () => Session | null
  todayMs: () => number
  toggle: () => void
  open: () => void
  quit: () => void
}

export function fmtHM(ms: number): string {
  const m = Math.floor(ms / 60000)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export function createTray(d: TrayDeps): { refresh: () => void } {
  const tray = new Tray(trayIcon())
  tray.setToolTip('TTT')
  let timer: NodeJS.Timeout | null = null
  const refresh = (): void => {
    const running = !!d.current()
    const ms = d.todayMs()
    tray.setTitle(running || ms > 0 ? ` ${fmtHM(ms)}` : '')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: running ? 'Pause' : 'Start', click: d.toggle },
        { label: `Today: ${fmtHM(ms)}`, enabled: false },
        { type: 'separator' },
        { label: 'Open TTT', click: d.open },
        { label: 'Quit', click: d.quit }
      ])
    )
    if (running && !timer) timer = setInterval(refresh, 1000)
    if (!running && timer) (clearInterval(timer), (timer = null))
  }
  tray.on('click', d.open)
  refresh()
  return { refresh }
}
