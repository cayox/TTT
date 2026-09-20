import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Settings, UpdateState } from '@shared/types'
import { fetchReleases } from './github'
import { parseReleases } from './releases'
import { downloadAsset } from './download'
import { appBundlePath, canInstall, installAndRestart, stageUpdate } from './install'

export interface UpdaterDeps {
  currentVersion: string
  /** Directory for the download and the unpacked bundle; removed again after a failure. */
  tempDir: string
  getSettings: () => Settings
  setSettings: (patch: Partial<Settings>) => void
  onChange: (state: UpdateState) => void
  quit: () => void
}

const HOUR = 3600000
/** Long enough that a launch is never held up by a network call. */
const FIRST_CHECK_DELAY = 20000
const EVERY = 6 * HOUR

export interface Updater {
  state: () => UpdateState
  check: (manual: boolean) => Promise<UpdateState>
  download: () => Promise<UpdateState>
  install: () => Promise<void>
  skip: (version: string) => UpdateState
  /** Forget an available update until the next check. */
  dismiss: () => UpdateState
  start: () => void
  stop: () => void
}

function message(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e)
  return s.trim() || 'Something went wrong'
}

export function createUpdater(d: UpdaterDeps): Updater {
  let dir: string | null = null
  let staged: string | null = null
  let timer: NodeJS.Timeout | null = null
  let s: UpdateState = {
    phase: 'idle',
    currentVersion: d.currentVersion,
    releases: [],
    progress: 0,
    error: null,
    lastCheck: null,
    skipped: d.getSettings().skippedUpdate,
    canInstall: canInstall()
  }
  const set = (patch: Partial<UpdateState>): UpdateState => {
    s = { ...s, ...patch }
    d.onChange(s)
    return s
  }
  const cleanup = async (): Promise<void> => {
    const old = dir
    dir = null
    staged = null
    if (old) await rm(old, { recursive: true, force: true }).catch(() => undefined)
  }

  const check = async (manual: boolean): Promise<UpdateState> => {
    // A download in flight, or one waiting to be installed, outranks another look at the API.
    if (s.phase === 'downloading' || s.phase === 'ready') return s
    // Re-read where the app lives: it may have been moved since launch.
    set({ phase: 'checking', error: null, canInstall: canInstall() })
    try {
      const releases = parseReleases(await fetchReleases(), d.currentVersion, process.arch)
      return set({ phase: releases.length ? 'available' : 'idle', releases, lastCheck: Date.now(), error: null })
    } catch (e) {
      // A failed background check is not worth interrupting anyone over; a manual one says so.
      return set({ phase: manual ? 'error' : 'idle', error: message(e), lastCheck: Date.now() })
    }
  }

  const download = async (): Promise<UpdateState> => {
    const release = s.releases[0]
    if (!release?.asset) return set({ phase: 'error', error: 'This release has no download for your Mac' })
    if (!s.canInstall) return set({ phase: 'error', error: 'TTT can only update itself from a folder it can write to, such as Applications' })
    if (s.phase === 'downloading') return s
    set({ phase: 'downloading', progress: 0, error: null })
    try {
      await cleanup()
      dir = await mkdtemp(join(d.tempDir, 'ttt-update-'))
      const zip = join(dir, release.asset.name)
      let last = 0
      const { sha256 } = await downloadAsset(release.asset.url, zip, release.asset.size, (p) => {
        // The renderer only needs a moving bar, not every chunk.
        const now = Date.now()
        if (p === 1 || now - last > 200) (last = now), set({ progress: p })
      })
      if (release.asset.sha256 && release.asset.sha256 !== sha256) throw new Error('The download did not match its checksum')
      staged = await stageUpdate(zip, join(dir, 'staged'), release.version)
      return set({ phase: 'ready', progress: 1 })
    } catch (e) {
      await cleanup()
      return set({ phase: 'error', progress: 0, error: message(e) })
    }
  }

  const install = async (): Promise<void> => {
    const target = appBundlePath()
    if (!staged || !dir || !target) {
      set({ phase: 'error', error: 'The update is no longer ready to install' })
      return
    }
    await installAndRestart(staged, target, join(dir, 'install.sh'))
    d.quit()
  }

  return {
    state: () => s,
    check,
    download,
    install,
    skip: (version) => {
      d.setSettings({ skippedUpdate: version })
      return set({ skipped: version })
    },
    dismiss: () => set({ phase: s.phase === 'available' || s.phase === 'error' ? 'idle' : s.phase, error: null }),
    start: () => {
      if (timer) return
      const tick = (): void => {
        if (d.getSettings().autoCheckUpdates) void check(false)
      }
      const first = setTimeout(tick, FIRST_CHECK_DELAY)
      first.unref?.()
      timer = setInterval(tick, EVERY)
      timer.unref?.()
    },
    stop: () => {
      if (timer) (clearInterval(timer), (timer = null))
      void cleanup()
    }
  }
}
