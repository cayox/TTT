import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CurrentNetwork } from '@shared/types'

function run(cmd: string, args: string[], timeout = 4000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout) => resolve(err ? null : String(stdout)))
  })
}

async function wifiDevice(): Promise<string> {
  const out = await run('networksetup', ['-listallhardwareports'])
  const m = out?.match(/Hardware Port: (?:Wi-Fi|AirPort)\s*\nDevice: (\w+)/)
  return m?.[1] ?? 'en0'
}

export function parseNetworksetup(out: string): string | null {
  const m = out.match(/Current Wi-Fi Network:\s*(.+)/)
  const s = m?.[1]?.trim()
  return s && s !== '<redacted>' ? s : null
}

const HELPER_APP = 'TTT Location.app'
const HELPER_BIN = join(HELPER_APP, 'Contents', 'MacOS', 'ssid-helper')

/**
 * Optional CoreWLAN helper app (see helper/ssid.swift): TTT_SSID_HELPER, the packaged app's
 * resources, or build/ so `npm run dev` uses the same bundle.
 */
export function helperPath(): string | null {
  const candidates = [
    process.env.TTT_SSID_HELPER,
    join(process.resourcesPath ?? '', HELPER_BIN),
    join(process.cwd(), 'build', HELPER_BIN)
  ]
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null
}

/** The innermost .app bundle around an executable: "…/TTT.app/…/TTT Location.app/Contents/MacOS/x" -> "…/TTT Location.app". */
export function bundleOf(executable: string): string | null {
  const i = executable.lastIndexOf('.app/')
  return i >= 0 ? executable.slice(0, i + 4) : null
}

/** The helper's app bundle, for registering and launching it through Launch Services. */
export function helperBundle(): string | null {
  const p = helperPath()
  return p ? bundleOf(p) : null
}

/**
 * Runs the helper; null when it is not bundled or it failed. Run directly rather than through `open`:
 * the Location prompt only appears that way, and `open -W` loses track of a process this short-lived.
 * macOS still knows it as its own app as long as Launch Services has it registered (location.ts).
 */
export async function runHelper(args: string[], timeout?: number): Promise<string | null> {
  const p = helperPath()
  return p ? ((await run(p, args, timeout))?.trim() ?? null) || null : null
}

async function viaHelper(): Promise<string | null> {
  return runHelper([])
}

export async function getCurrentSsid(): Promise<string | null> {
  const dev = await wifiDevice()
  const out = await run('networksetup', ['-getairportnetwork', dev])
  const s = out ? parseNetworksetup(out) : null
  return s ?? (await viaHelper())
}

/** `route -n get default` -> gateway IP. */
export function parseRouteGateway(out: string): string | null {
  return out.match(/gateway:\s*([0-9.]+)/)?.[1] ?? null
}

/** `arp -n <ip>` -> normalized MAC ("60:b5:8d:96:36:fa"), padding single-digit octets. */
export function parseArpMac(out: string): string | null {
  const m = out.match(/ at ([0-9a-f]{1,2}(?::[0-9a-f]{1,2}){5})/i)
  return m ? m[1].split(':').map((x) => x.padStart(2, '0').toLowerCase()).join(':') : null
}

/**
 * Identity of the current network. macOS redacts the SSID without Location permission, but the
 * default router's MAC address is still readable and is stable per network, so it serves as a fallback id.
 */
export async function getCurrentNetwork(): Promise<CurrentNetwork> {
  const [ssid, route] = await Promise.all([getCurrentSsid(), run('route', ['-n', 'get', 'default'])])
  const gateway = route ? parseRouteGateway(route) : null
  let routerId = gateway ? parseArpMac((await run('arp', ['-n', gateway])) ?? '') : null
  // The ARP cache forgets idle entries; one ping puts the router back so it can be read.
  if (gateway && !routerId) {
    await run('ping', ['-c', '1', '-t', '1', gateway], 2500)
    routerId = parseArpMac((await run('arp', ['-n', gateway])) ?? '')
  }
  return { ssid, routerId, gateway }
}
