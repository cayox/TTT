import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings, UpdateState } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

// These reach for electron and the network; the state machine is what is under test here.
const fetchReleases = vi.fn()
const downloadAsset = vi.fn()
const stageUpdate = vi.fn()
const installAndRestart = vi.fn()
const canInstall = vi.fn(() => true)
const appBundlePath = vi.fn(() => '/Applications/TTT.app')

vi.mock('./github', () => ({ fetchReleases: (...a: unknown[]) => fetchReleases(...a) }))
vi.mock('./download', () => ({ downloadAsset: (...a: unknown[]) => downloadAsset(...a) }))
vi.mock('./install', () => ({
  stageUpdate: (...a: unknown[]) => stageUpdate(...a),
  installAndRestart: (...a: unknown[]) => installAndRestart(...a),
  canInstall: () => canInstall(),
  appBundlePath: () => appBundlePath()
}))

const { createUpdater } = await import('./index')

const release = (tag: string, digest?: string) => ({
  tag_name: tag,
  body: '### Added\n- Something',
  published_at: '2026-09-20T10:00:00Z',
  html_url: `https://github.com/cayox/TTT/releases/tag/${tag}`,
  assets: [{ name: `TTT-${tag.slice(1)}-${process.arch}.zip`, browser_download_url: 'https://example.test/a.zip', size: 1000, digest }]
})

function setup(overrides: Partial<Settings> = {}) {
  let settings: Settings = { ...DEFAULT_SETTINGS, ...overrides }
  const states: UpdateState[] = []
  const quit = vi.fn()
  const updater = createUpdater({
    currentVersion: '1.0.0',
    tempDir: tmpdir(),
    getSettings: () => settings,
    setSettings: (patch) => void (settings = { ...settings, ...patch }),
    onChange: (s) => void states.push(s),
    quit
  })
  return { updater, states, quit, settings: () => settings }
}

beforeEach(() => {
  vi.clearAllMocks()
  canInstall.mockReturnValue(true)
  appBundlePath.mockReturnValue('/Applications/TTT.app')
  downloadAsset.mockResolvedValue({ path: '/tmp/a.zip', sha256: 'a'.repeat(64) })
  stageUpdate.mockResolvedValue('/tmp/staged/TTT.app')
})

describe('check', () => {
  it('offers a newer release', async () => {
    fetchReleases.mockResolvedValue([release('v1.1.0')])
    const { updater } = setup()
    const s = await updater.check(true)
    expect(s.phase).toBe('available')
    expect(s.releases.map((r) => r.version)).toEqual(['1.1.0'])
    expect(s.lastCheck).toBeGreaterThan(0)
  })

  it('stays idle when up to date', async () => {
    fetchReleases.mockResolvedValue([release('v1.0.0')])
    expect((await setup().updater.check(true)).phase).toBe('idle')
  })

  it('reports a failed manual check', async () => {
    fetchReleases.mockRejectedValue(new Error('GitHub replied 500'))
    const s = await setup().updater.check(true)
    expect(s.phase).toBe('error')
    expect(s.error).toBe('GitHub replied 500')
  })

  it('keeps quiet about a failed background check', async () => {
    fetchReleases.mockRejectedValue(new Error('offline'))
    const s = await setup().updater.check(false)
    expect(s.phase).toBe('idle')
    expect(s.error).toBe('offline')
  })

  it('does not disturb an update that is ready to install', async () => {
    fetchReleases.mockResolvedValue([release('v1.1.0')])
    const { updater } = setup()
    await updater.check(true)
    await updater.download()
    fetchReleases.mockResolvedValue([release('v1.2.0')])
    expect((await updater.check(true)).phase).toBe('ready')
    expect(fetchReleases).toHaveBeenCalledTimes(1)
  })
})

describe('download', () => {
  it('downloads, stages and becomes ready', async () => {
    fetchReleases.mockResolvedValue([release('v1.1.0')])
    const { updater, states } = setup()
    await updater.check(true)
    const s = await updater.download()
    expect(s.phase).toBe('ready')
    expect(stageUpdate).toHaveBeenCalledWith(expect.stringContaining('.zip'), expect.stringContaining('staged'), '1.1.0')
    expect(states.some((x) => x.phase === 'downloading')).toBe(true)
  })

  it('refuses a download that does not match its checksum', async () => {
    fetchReleases.mockResolvedValue([release('v1.1.0', `sha256:${'b'.repeat(64)}`)])
    const { updater } = setup()
    await updater.check(true)
    const s = await updater.download()
    expect(s.phase).toBe('error')
    expect(s.error).toBe('The download did not match its checksum')
    expect(stageUpdate).not.toHaveBeenCalled()
  })

  it('accepts a download that matches its checksum', async () => {
    fetchReleases.mockResolvedValue([release('v1.1.0', `sha256:${'A'.repeat(64)}`)])
    const { updater } = setup()
    await updater.check(true)
    expect((await updater.download()).phase).toBe('ready')
  })

  it('reports a staging failure and keeps nothing half-done', async () => {
    fetchReleases.mockResolvedValue([release('v1.1.0')])
    stageUpdate.mockRejectedValue(new Error('The download says it is 1.0.9, not 1.1.0'))
    const { updater } = setup()
    await updater.check(true)
    const s = await updater.download()
    expect(s.phase).toBe('error')
    expect(s.error).toBe('The download says it is 1.0.9, not 1.1.0')
  })

  it('says so when the app cannot replace itself', async () => {
    canInstall.mockReturnValue(false)
    fetchReleases.mockResolvedValue([release('v1.1.0')])
    const { updater } = setup()
    await updater.check(true)
    const s = await updater.download()
    expect(s.phase).toBe('error')
    expect(downloadAsset).not.toHaveBeenCalled()
  })
})

describe('install', () => {
  it('swaps the bundle and quits', async () => {
    fetchReleases.mockResolvedValue([release('v1.1.0')])
    const { updater, quit } = setup()
    await updater.check(true)
    await updater.download()
    await updater.install()
    expect(installAndRestart).toHaveBeenCalledWith('/tmp/staged/TTT.app', '/Applications/TTT.app', expect.stringContaining('install.sh'))
    expect(quit).toHaveBeenCalled()
  })

  it('does nothing when no download is ready', async () => {
    const { updater, quit } = setup()
    await updater.install()
    expect(installAndRestart).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
    expect(updater.state().phase).toBe('error')
  })
})

it('skip remembers the version in settings', async () => {
  fetchReleases.mockResolvedValue([release('v1.1.0')])
  const { updater, settings } = setup()
  await updater.check(true)
  expect(updater.skip('1.1.0').skipped).toBe('1.1.0')
  expect(settings().skippedUpdate).toBe('1.1.0')
})

it('dismiss puts an offer away without forgetting the release', async () => {
  fetchReleases.mockResolvedValue([release('v1.1.0')])
  const { updater } = setup()
  await updater.check(true)
  const s = updater.dismiss()
  expect(s.phase).toBe('idle')
  expect(s.releases).toHaveLength(1)
})
