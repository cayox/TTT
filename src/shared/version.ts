/** Semantic versions, enough of them for `0.1.0-beta.2`-style app versions. */
export interface Version {
  major: number
  minor: number
  patch: number
  /** Dot-separated prerelease identifiers; empty for a final release. */
  pre: (string | number)[]
}

const RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function parseVersion(v: string): Version | null {
  const m = RE.exec(v.trim())
  if (!m) return null
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : []
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre }
}

function comparePre(a: (string | number)[], b: (string | number)[]): number {
  // A version with a prerelease ranks below the same version without one (1.0.0-beta < 1.0.0).
  if (!a.length || !b.length) return a.length === b.length ? 0 : a.length ? -1 : 1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    // Numeric identifiers rank below alphanumeric ones and compare as numbers.
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1
    if (typeof x === 'number') return -1
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  return 0
}

/** -1, 0 or 1. Unparsable versions sort below parsable ones. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a), y = parseVersion(b)
  if (!x || !y) return x === y ? 0 : x ? 1 : -1
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1
  return comparePre(x.pre, y.pre)
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}

/** Strips a leading `v` so tags and package versions can be compared and displayed alike. */
export function cleanVersion(v: string): string {
  return v.trim().replace(/^v/, '')
}
