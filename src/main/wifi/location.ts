import { shell, type BrowserWindow } from 'electron'
import type { LocationFix, LocationStatus } from '@shared/types'
import { execFile } from 'node:child_process'
import { getCurrentSsid, helperBundle, helperPath, runHelper } from './ssid'

const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

const KNOWN: LocationStatus[] = ['granted', 'denied', 'restricted', 'notDetermined']

const run = (cmd: string, args: string[]): Promise<void> =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10000 }, (err) => {
      if (err) console.warn(`location: ${cmd} failed`, err.message)
      resolve()
    })
  })

/**
 * Makes macOS know the helper as an app. locationd only prompts for apps Launch Services knows, and
 * macOS only reveals the Wi-Fi name to a helper that Launch Services has started at least once since
 * it was installed (after an update, a directly run helper gets a redacted name). So: register the
 * bundle, then launch it once in the background (it prints its status and quits). Done at every
 * launch, since an update replaces the bundle.
 */
export async function registerHelper(): Promise<void> {
  const bundle = helperBundle()
  if (!bundle) return
  await run(LSREGISTER, ['-f', bundle])
  await run('open', ['-g', '-j', '-n', bundle, '--args', '--status'])
}

/** Current Location authorization for TTT. Never prompts. */
export async function locationStatus(): Promise<LocationStatus> {
  const out = await runHelper(['--status'])
  if (KNOWN.includes(out as LocationStatus)) return out as LocationStatus
  // Without the helper the SSID is the only signal: macOS reveals it exactly when access is granted.
  return (await getCurrentSsid()) ? 'granted' : 'unknown'
}

/**
 * Chromium's geolocation as a last resort. Electron does not implement Chrome's step that asks macOS
 * for system Location permission, so this usually just waits out its timeout; kept short.
 */
async function promptViaChromium(win: BrowserWindow | null): Promise<void> {
  if (!win || win.isDestroyed()) return
  await win.webContents
    .executeJavaScript(
      `new Promise((res) => navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(() => res(), () => res(), { timeout: 15000, maximumAge: 0 })
        : res())`
    )
    .catch(() => undefined)
}

/**
 * Prompts for Location access if the user has not decided yet, and reports where things stand
 * afterwards. Already granted, denied or restricted: returns right away without a prompt.
 * Still 'notDetermined' afterwards means macOS showed no prompt; the UI then points to System Settings.
 */
export async function requestLocation(win: BrowserWindow | null): Promise<LocationStatus> {
  const before = await locationStatus()
  if (before !== 'notDetermined' && before !== 'unknown') return before
  // The helper is its own (Dock-less) app named TTT; the prompt and the grant belong to it, and it is
  // also the process that reads the Wi-Fi name.
  if (helperPath()) {
    await registerHelper()
    const out = await runHelper(['--request'], 70000)
    if (out && out !== 'notDetermined' && KNOWN.includes(out as LocationStatus)) return out as LocationStatus
    console.warn('location: helper --request ended without an answer', out)
  }
  await promptViaChromium(win)
  const after = await locationStatus()
  if (after === 'notDetermined' || after === 'unknown') console.warn('location: no prompt reached the user', after)
  return after
}

/** Parses the helper's `--locate` line: "<lat> <lon> <accuracy>". */
export function parseFix(out: string | null): LocationFix | null {
  const [lat, lon, accuracy] = (out ?? '').trim().split(/\s+/).map(Number)
  if (![lat, lon, accuracy].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || accuracy < 0) return null
  return { lat, lon, accuracy }
}

/** A fresh location fix; null without access or when macOS has none. */
export async function locate(): Promise<LocationFix | null> {
  return parseFix(await runHelper(['--locate'], 15000))
}

/** How often auto-tracking reads the location; the Wi-Fi watcher polls far more often than places need. */
const FIX_EVERY_MS = 60000
/** A failed read keeps the last fix this long, so one miss does not count as having left. */
const FIX_KEEP_MS = 10 * 60000
let cached: { fix: LocationFix; at: number } | null = null
let lastTry = 0
let inFlight: Promise<LocationFix | null> | null = null

/** Location for the watcher: refreshed at most once a minute, last good fix kept through short gaps. */
export function recentFix(now = Date.now()): Promise<LocationFix | null> {
  const keep = (): LocationFix | null => (cached && now - cached.at < FIX_KEEP_MS ? cached.fix : null)
  if (now - lastTry < FIX_EVERY_MS) return Promise.resolve(keep())
  if (inFlight) return inFlight
  lastTry = now
  inFlight = locate()
    .then((fix) => {
      if (fix) cached = { fix, at: Date.now() }
      return fix ?? keep()
    })
    .finally(() => (inFlight = null))
  return inFlight
}

/** Opens System Settings at Privacy & Security → Location Services, for a denied prompt. */
export function openLocationSettings(): void {
  void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices')
}
