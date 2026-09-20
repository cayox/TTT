import { net } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'

export interface DownloadResult {
  path: string
  sha256: string
}

/**
 * Streams a release asset to `dest`, reporting 0..1 progress, and hashes it on the way so the
 * caller can check it against the digest GitHub published.
 */
export async function downloadAsset(url: string, dest: string, size: number, onProgress: (p: number) => void, signal?: AbortSignal): Promise<DownloadResult> {
  const res = await net.fetch(url, { signal })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || size
  const hash = createHash('sha256')
  const file = createWriteStream(dest)
  const reader = res.body.getReader()
  let done = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      const buf = Buffer.from(chunk.value)
      hash.update(buf)
      done += buf.length
      if (!file.write(buf)) await new Promise<void>((r) => file.once('drain', r))
      if (total > 0) onProgress(Math.min(1, done / total))
    }
    await new Promise<void>((resolve, reject) => file.end((e?: Error | null) => (e ? reject(e) : resolve())))
  } catch (e) {
    file.destroy()
    await rm(dest, { force: true })
    throw e
  }
  onProgress(1)
  return { path: dest, sha256: hash.digest('hex') }
}
