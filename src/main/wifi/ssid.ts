import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
