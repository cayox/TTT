import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { swapScript } from './script'

function run(cmd: string, args: string[], timeout = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 << 20 }, (err, stdout, stderr) =>
      err ? reject(new Error(String(stderr || err.message).trim())) : resolve(String(stdout))
    )
  })
}

/** Path of the running `.app` bundle, or null when not a packaged macOS app. */
export function appBundlePath(): string | null {
  if (!app.isPackaged || process.platform !== 'darwin') return null
  const exe = app.getPath('exe')
  const i = exe.indexOf('.app/Contents/MacOS/')
  return i > 0 ? exe.slice(0, i + 4) : null
}

/** TTT can only replace itself where it may write, so a copy on a read-only volume is out. */
export function canInstall(): boolean {
  const p = appBundlePath()
  if (!p) return false
  try {
    accessSync(dirname(p), constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** Unpacks the zip and checks it really is the version we asked for, before anything is replaced. */
export async function stageUpdate(zipPath: string, dir: string, expectedVersion: string): Promise<string> {
  // ditto keeps the extended attributes and the code signature intact, which unzip does not.
  await run('/usr/bin/ditto', ['-x', '-k', zipPath, dir])
  const bundle = (await readdir(dir)).find((f) => f.endsWith('.app'))
  if (!bundle) throw new Error('The download did not contain an app')
  const staged = join(dir, bundle)
  const version = (await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', join(staged, 'Contents/Info.plist')])).trim()
  if (version !== expectedVersion) throw new Error(`The download says it is ${version}, not ${expectedVersion}`)
  // An intact signature also proves the bundle survived the download and unpacking.
  await run('/usr/bin/codesign', ['--verify', '--strict', staged]).catch(() => {
    throw new Error('The downloaded build is not properly signed')
  })
  return staged
}

/**
 * Swaps the bundle from a detached shell script (see script.ts): the app has to be gone before it
 * can be replaced, so the script waits for this process to exit and starts the new version itself.
 */
export async function installAndRestart(staged: string, target: string, scriptPath: string): Promise<void> {
  await writeFile(scriptPath, swapScript({ pid: process.pid, target, staged, stageDir: dirname(scriptPath) }), { mode: 0o755 })
  spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' }).unref()
}
