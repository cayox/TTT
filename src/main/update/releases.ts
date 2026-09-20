import type { UpdateRelease } from '@shared/types'
import { parseSections } from '@shared/changelog'
import { cleanVersion, isNewer } from '@shared/version'

export const REPO = 'cayox/TTT'

/** The fields of the GitHub releases API this app reads. */
export interface GhRelease {
  tag_name?: string
  name?: string | null
  body?: string | null
  html_url?: string
  draft?: boolean
  prerelease?: boolean
  published_at?: string | null
  assets?: { name?: string; browser_download_url?: string; size?: number; digest?: string | null }[]
}

const ARCHES = ['arm64', 'x64', 'x86_64', 'universal']

/**
 * macOS build for this architecture: `TTT-1.2.3-arm64.zip`. Only zips can be installed in place.
 * A single zip is taken as the build for everyone, unless its name claims another architecture —
 * an arm64-only build would not even launch on an Intel Mac.
 */
export function pickAsset(release: GhRelease, arch: string): UpdateRelease['asset'] {
  const zips = (release.assets ?? []).filter((a) => a.name?.endsWith('.zip') && a.browser_download_url)
  const forOther = (name: string): boolean => ARCHES.some((x) => x !== arch && x !== 'universal' && name.includes(`-${x}.`))
  const a = zips.find((z) => z.name!.includes(`-${arch}.`)) ?? (zips.length === 1 && !forOther(zips[0].name!) ? zips[0] : undefined)
  if (!a) return null
  const sha = /^sha256:([0-9a-f]{64})$/i.exec(a.digest ?? '')?.[1]
  return { name: a.name!, url: a.browser_download_url!, size: a.size ?? 0, sha256: sha?.toLowerCase() ?? null }
}

/**
 * Releases newer than `current`, newest first. Drafts are skipped, and prereleases only count for
 * someone already running one — a beta tester keeps getting betas, a stable install does not.
 */
export function parseReleases(list: GhRelease[], current: string, arch: string): UpdateRelease[] {
  const onPre = cleanVersion(current).includes('-')
  return list
    .filter((r) => !r.draft && !!r.tag_name)
    .map((r) => ({
      version: cleanVersion(r.tag_name!),
      groups: parseSections(r.body ?? ''),
      publishedAt: r.published_at ?? null,
      url: r.html_url ?? `https://github.com/${REPO}/releases/tag/${r.tag_name}`,
      prerelease: !!r.prerelease,
      asset: pickAsset(r, arch)
    }))
    .filter((r) => isNewer(r.version, current) && (onPre || !r.prerelease))
    .sort((a, b) => (isNewer(a.version, b.version) ? -1 : 1))
}
