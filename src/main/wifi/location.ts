import { shell, type BrowserWindow } from 'electron'
import type { LocationStatus } from '@shared/types'
import { getCurrentSsid, helperPath, runHelper } from './ssid'

const KNOWN: LocationStatus[] = ['granted', 'denied', 'restricted', 'notDetermined']

/** Current Location authorization for TTT. Never prompts. */
export async function locationStatus(): Promise<LocationStatus> {
  const out = await runHelper(['--status'])
  if (KNOWN.includes(out as LocationStatus)) return out as LocationStatus
  // Without the helper the SSID is the only signal: macOS reveals it exactly when access is granted.
  return (await getCurrentSsid()) ? 'granted' : 'unknown'
}

/**
 * Asks macOS for Location access as TTT itself. Chromium's geolocation provider goes through
 * CoreLocation, so answering the prompt registers the app in Location Services — which is also what
 * lets the bundled helper read the Wi-Fi name.
 */
async function promptViaApp(win: BrowserWindow | null): Promise<void> {
  if (!win || win.isDestroyed()) return
  await win.webContents
    .executeJavaScript(
      `new Promise((res) => navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(() => res(), () => res(), { timeout: 120000, maximumAge: 0 })
        : res())`
    )
    .catch(() => undefined)
}

/**
 * Prompts for Location access if the user has not decided yet, and reports where things stand
 * afterwards. Already granted, denied or restricted: returns right away without a prompt.
 */
export async function requestLocation(win: BrowserWindow | null): Promise<LocationStatus> {
  const before = await locationStatus()
  if (before !== 'notDetermined' && before !== 'unknown') return before
  await promptViaApp(win)
  const after = await locationStatus()
  if (after !== 'notDetermined') return after
  // Chromium stayed silent (no window, or it never reached CoreLocation): ask from the helper.
  if (!helperPath()) return after
  const out = await runHelper(['--request'], 130000)
  return KNOWN.includes(out as LocationStatus) ? (out as LocationStatus) : after
}

/** Opens System Settings at Privacy & Security → Location Services, for a denied prompt. */
export function openLocationSettings(): void {
  void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices')
}
