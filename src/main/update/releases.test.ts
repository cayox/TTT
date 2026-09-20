import { describe, expect, it } from 'vitest'
import { parseReleases, pickAsset, type GhRelease } from './releases'

const asset = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  browser_download_url: `https://example.test/${name}`,
  size: 100,
  ...extra
})

const release = (tag: string, extra: Partial<GhRelease> = {}): GhRelease => ({
  tag_name: tag,
  body: '### Added\n- Something new',
  html_url: `https://github.com/cayox/TTT/releases/tag/${tag}`,
  published_at: '2026-09-20T10:00:00Z',
  assets: [asset(`TTT-${tag.replace(/^v/, '')}-arm64.zip`), asset(`TTT-${tag.replace(/^v/, '')}-x64.zip`), asset(`TTT-${tag.replace(/^v/, '')}-arm64.dmg`)],
  ...extra
})

describe('pickAsset', () => {
  it('picks the zip for this architecture', () => expect(pickAsset(release('v1.0.0'), 'arm64')?.name).toBe('TTT-1.0.0-arm64.zip'))
  it('ignores the dmg, which cannot be installed in place', () => expect(pickAsset(release('v1.0.0'), 'x64')?.name).toBe('TTT-1.0.0-x64.zip'))
  it('falls back to a lone zip when no architecture matches', () =>
    expect(pickAsset({ assets: [asset('TTT-1.0.0-universal.zip')] }, 'arm64')?.name).toBe('TTT-1.0.0-universal.zip'))
  it('returns null when nothing fits', () => expect(pickAsset({ assets: [asset('TTT-1.0.0-x64.zip')] }, 'arm64')).toBeNull())
  it('reads the published sha256 digest', () =>
    expect(pickAsset({ assets: [asset('a-arm64.zip', { digest: `sha256:${'A'.repeat(64)}` })] }, 'arm64')?.sha256).toBe('a'.repeat(64)))
  it('ignores a digest in another format', () =>
    expect(pickAsset({ assets: [asset('a-arm64.zip', { digest: 'md5:abc' })] }, 'arm64')?.sha256).toBeNull())
})

describe('parseReleases', () => {
  const list = [release('v0.9.0'), release('v1.2.0'), release('v1.1.0'), release('v1.0.0')]

  it('keeps only newer releases, newest first', () =>
    expect(parseReleases(list, '1.0.0', 'arm64').map((r) => r.version)).toEqual(['1.2.0', '1.1.0']))
  it('returns nothing when up to date', () => expect(parseReleases(list, '1.2.0', 'arm64')).toEqual([]))
  it('skips drafts', () => expect(parseReleases([release('v2.0.0', { draft: true })], '1.0.0', 'arm64')).toEqual([]))
  it('hides prereleases from a stable install', () =>
    expect(parseReleases([release('v2.0.0-beta.1', { prerelease: true })], '1.0.0', 'arm64')).toEqual([]))
  it('offers prereleases to someone already on one', () =>
    expect(parseReleases([release('v2.0.0-beta.2', { prerelease: true })], '2.0.0-beta.1', 'arm64').map((r) => r.version)).toEqual(['2.0.0-beta.2']))
  it('parses the release body into changelog groups', () =>
    expect(parseReleases(list, '1.1.0', 'arm64')[0].groups).toEqual([{ heading: 'Added', items: ['Something new'] }]))
  it('keeps a release with no download for this Mac, with a null asset', () =>
    expect(parseReleases([release('v2.0.0', { assets: [] })], '1.0.0', 'arm64')[0].asset).toBeNull())
})
