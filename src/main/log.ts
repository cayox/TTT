import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'

const MAX_BYTES = 1024 * 1024
const RING = 300

const ring: string[] = []
let file: string | null = null

function write(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${format(...args)}`
  ring.push(line)
  if (ring.length > RING) ring.shift()
  if (!file) return
  try {
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) renameSync(file, file + '.1')
  } catch {
    /* ignore */
  }
  try {
    appendFileSync(file, line + '\n')
  } catch {
    /* disk full or gone: the ring still has it */
  }
}

/**
 * Keeps a log of warnings and errors in <userData>/logs/ttt.log (rotated at 1 MB) and the last
 * lines in memory, for Settings → Copy diagnostics. Console output still goes to the terminal.
 */
export function initLog(dir: string): string {
  mkdirSync(dir, { recursive: true })
  file = join(dir, 'ttt.log')
  for (const level of ['warn', 'error', 'info'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      write(level, args)
      orig(...args)
    }
  }
  process.on('uncaughtException', (e) => write('fatal', ['uncaught', e]))
  process.on('unhandledRejection', (e) => write('error', ['unhandled rejection', e]))
  return file
}

export const logLine = (level: string, ...args: unknown[]): void => write(level, args)
export const recentLog = (): string[] => [...ring]
