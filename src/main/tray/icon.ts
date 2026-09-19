import { nativeImage, type NativeImage } from 'electron'
import { deflateSync } from 'node:zlib'

function crc32(buf: Buffer): number {
  let c, crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

export interface GlyphState {
  /** Share of today's expected time worked (0..1+); the arc sweeps clockwise from 12 o'clock. */
  progress: number
  running: boolean
}

/**
 * Menu bar glyph matching the app icon: a faint track ring with a solid progress arc, plus a
 * center dot while a session runs. Black with alpha (template image), antialiased by supersampling.
 */
export function ringPng(size: number, { progress, running }: GlyphState): Buffer {
  const u = size / 18 // designed on an 18pt canvas
  const c = size / 2
  const R = 6.4 * u
  const trackW = 1.4 * u
  const arcW = 2.3 * u
  const dotR = 2.1 * u
  const p = Math.max(0, Math.min(1, progress))
  const sweep = p * 2 * Math.PI
  // Arc endpoints for the round caps.
  const endA = -Math.PI / 2 + sweep
  const caps: [number, number][] = [
    [c, c - R],
    [c + R * Math.cos(endA), c + R * Math.sin(endA)]
  ]
  const alphaAt = (x: number, y: number): number => {
    const dx = x - c, dy = y - c
    const r = Math.hypot(dx, dy)
    if (running && r <= dotR) return 1
    // Angle measured clockwise from 12 o'clock, in [0, 2π).
    const a = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)
    const onArc = p >= 1 ? Math.abs(r - R) <= arcW / 2 : (a <= sweep && Math.abs(r - R) <= arcW / 2) || caps.some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= arcW / 2)
    if (onArc && p > 0) return 1
    if (p === 0 && Math.hypot(x - caps[0][0], y - caps[0][1]) <= arcW / 2) return 1
    return Math.abs(r - R) <= trackW / 2 ? 0.32 : 0
  }
  const N = 4 // N×N samples per pixel
  const row = size * 4 + 1
  const raw = Buffer.alloc(row * size)
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0
    for (let x = 0; x < size; x++) {
      let sum = 0
      for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) sum += alphaAt(x + (sx + 0.5) / N, y + (sy + 0.5) / N)
      raw[y * row + 1 + x * 4 + 3] = Math.round((sum / (N * N)) * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

export function trayIcon(state: GlyphState): NativeImage {
  const img = nativeImage.createEmpty()
  img.addRepresentation({ scaleFactor: 1, width: 18, height: 18, buffer: ringPng(18, state) })
  img.addRepresentation({ scaleFactor: 2, width: 36, height: 36, buffer: ringPng(36, state) })
  img.setTemplateImage(true)
  return img
}
