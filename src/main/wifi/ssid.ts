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

/** Optional CoreWLAN helper (see helper/ssid.swift); path via TTT_SSID_HELPER or resources. */
async function viaHelper(): Promise<string | null> {
  const p = process.env.TTT_SSID_HELPER ?? join(process.resourcesPath ?? '', 'ssid-helper')
  if (!existsSync(p)) return null
  const out = await run(p, [])
  return out?.trim() || null
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
  const arp = gateway ? await run('arp', ['-n', gateway]) : null
  return { ssid, routerId: arp ? parseArpMac(arp) : null, gateway }
}
