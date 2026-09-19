import { BrowserWindow, ShareMenu, app, clipboard, dialog, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Repos } from '../db/repos'
import { addDays, dateKey, startOfDay, totalBalance } from '@shared/time'
import { buildMonthReport, whatsappText, type MonthReport } from '@shared/report'
import { timesheetHtml } from './timesheet'

const pad = (n: number): string => String(n).padStart(2, '0')

export function createExporter(r: Repos, statsInput: () => { first: number | null; overrides: ReturnType<Repos['overrides']['list']>; sessions: ReturnType<Repos['sessions']['list']> }) {
  let lastPdf: string | null = null

  function report(year: number, month: number): MonthReport {
    const now = Date.now()
    const first = `${year}-${pad(month + 1)}-01`
    const next = dateKey(new Date(year, month + 1, 1).getTime())
    const settings = r.settings.get()
    const schedule = r.schedule.get()
    const all = statsInput()
    // Balance as of the end of this month (or now, for the current month).
    const asOf = Math.min(now, startOfDay(next) - 1)
    const balanceAtEnd = settings.startingBalance + totalBalance(all.sessions, schedule, all.overrides, settings, asOf, all.first)
    return buildMonthReport({
      year,
      month,
      sessions: r.sessions.list(startOfDay(addDays(first, -1)), startOfDay(next)),
      schedule,
      overrides: r.overrides.list(first, addDays(next, -1)),
      settings,
      projects: r.projects.list(),
      balanceAtEnd,
      now
    })
  }

  async function pdf(parent: BrowserWindow | null, year: number, month: number): Promise<string | null> {
    const rep = report(year, month)
    const opts = {
      title: 'Export timesheet',
      defaultPath: join(app.getPath('documents'), `Timesheet ${year}-${pad(month + 1)}${rep.name ? ` ${rep.name}` : ''}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const res = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null

    // Render in a throwaway hidden window; no preload, no scripts needed.
    const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } })
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(timesheetHtml(rep))}`)
      const data = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
      await writeFile(res.filePath, data)
    } catch (e) {
      console.error('[export] PDF failed', e)
      throw e
    } finally {
      win.destroy()
    }
    lastPdf = res.filePath
    return res.filePath
  }

  return {
    pdf,
    copyText(year: number, month: number): string {
      const text = whatsappText(report(year, month))
      clipboard.writeText(text)
      return text
    },
    async openWhatsapp(year: number, month: number): Promise<boolean> {
      const text = whatsappText(report(year, month))
      try {
        await shell.openExternal(`whatsapp://send?text=${encodeURIComponent(text)}`)
        return true
      } catch {
        return false
      }
    },
    openLast: (): void => void (lastPdf && shell.openPath(lastPdf)),
    revealLast: (): void => void (lastPdf && shell.showItemInFolder(lastPdf)),
    /** macOS share sheet with the PDF, e.g. to send it through WhatsApp, Mail or AirDrop. */
    shareLast(win: BrowserWindow | null): void {
      if (!lastPdf || !win) return
      new ShareMenu({ filePaths: [lastPdf] }).popup({ window: win })
    }
  }
}
