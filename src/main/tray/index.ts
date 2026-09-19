import { Menu, Tray } from 'electron'
import type { Project, Session } from '@shared/types'
import { trayIcon } from './icon'

export interface TrayDeps {
  current: () => Session | null
  todayMs: () => number
  /** Today's expected minutes; 0 on days off. */
  todayExpectedMin: () => number
  toggle: () => void
  projects: () => Project[]
  /** Start on a project, or move the running session to it. */
  startOn: (projectId: number) => void
  open: () => void
  quit: () => void
}

export function fmtHM(ms: number): string {
  const m = Math.floor(ms / 60000)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export function createTray(d: TrayDeps): { refresh: () => void } {
  const tray = new Tray(trayIcon({ progress: 0, running: false }))
  tray.setToolTip('TTT')
  let timer: NodeJS.Timeout | null = null
  let glyph = ''
  const refresh = (): void => {
    const cur = d.current()
    const running = !!cur
    const ms = d.todayMs()
    const projects = d.projects().filter((p) => !p.archived)
    const curName = projects.find((p) => p.id === cur?.projectId)?.name
    const expected = d.todayExpectedMin()
    // Quantized so the icon is only redrawn when the arc visibly moves.
    const progress = expected > 0 ? Math.min(1, Math.floor((ms / (expected * 60000)) * 72) / 72) : 0
    const key = `${progress}:${running}`
    if (key !== glyph) (tray.setImage(trayIcon({ progress, running })), (glyph = key))
    tray.setTitle(running || ms > 0 ? ` ${fmtHM(ms)}` : '', { fontType: 'monospacedDigit' })
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: running ? `Pause${curName ? ` (${curName})` : ''}` : 'Start', click: d.toggle },
        {
          label: running ? 'Switch project' : 'Start on',
          enabled: projects.length > 0,
          submenu: projects.map((p) => ({
            label: p.name,
            type: 'radio' as const,
            checked: running && p.id === cur?.projectId,
            click: () => d.startOn(p.id)
          }))
        },
        { label: `Today: ${fmtHM(ms)}${expected > 0 ? ` of ${fmtHM(expected * 60000)}` : ''}`, enabled: false },
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
