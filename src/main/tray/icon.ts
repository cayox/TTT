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

/** Monochrome clock glyph (ring + hands), black with alpha, as PNG bytes. */
export function clockPng(size: number): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const c = (size - 1) / 2
  const R = size * 0.42
  const w = size * 0.09
  const dist = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1, dy = y2 - y1
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
  }
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const ring = Math.abs(Math.hypot(x - c, y - c) - R)
      const h1 = dist(x, y, c, c, c, c - R * 0.6)
      const h2 = dist(x, y, c, c, c + R * 0.45, c)
      const d = Math.min(ring, h1, h2)
      const a = Math.max(0, Math.min(1, w - d + 0.5))
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o + 3] = Math.round(a * 255)
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

export function trayIcon(): NativeImage {
  const img = nativeImage.createEmpty()
  img.addRepresentation({ scaleFactor: 1, width: 18, height: 18, buffer: clockPng(18) })
  img.addRepresentation({ scaleFactor: 2, width: 36, height: 36, buffer: clockPng(36) })
  img.setTemplateImage(true)
  return img
}
