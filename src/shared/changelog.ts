/** A `### Added`-style block of a changelog entry; heading is '' for items listed without one. */
export interface ChangelogGroup {
  heading: string
  items: string[]
}

export interface ChangelogEntry {
  /** Without a leading `v`; 'Unreleased' keeps its name. */
  version: string
  /** YYYY-MM-DD when the heading carries one. */
  date: string | null
  groups: ChangelogGroup[]
}

const HEADING = /^##\s+(?:\[([^\]]+)\]|(\S+))\s*(?:[-–—]\s*(\d{4}-\d{2}-\d{2}))?\s*$/
const SUB = /^#{3,}\s+(.+?)\s*$/
const BULLET = /^\s*[-*+]\s+(.+?)\s*$/

/**
 * Parses the body of one entry (or a GitHub release body) into groups. Text that is neither a
 * heading nor a bullet becomes an item of its own, so free-form release notes still render.
 */
export function parseSections(body: string): ChangelogGroup[] {
  const groups: ChangelogGroup[] = []
  let cur: ChangelogGroup | null = null
  const push = (heading: string): ChangelogGroup => {
    cur = { heading, items: [] }
    groups.push(cur)
    return cur
  }
  for (const raw of body.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    const sub = SUB.exec(line)
    if (sub) {
      push(sub[1])
      continue
    }
    const bullet = BULLET.exec(line)
    const item = bullet ? bullet[1] : line.trim()
    // A wrapped bullet continues the previous item instead of starting a new one.
    const group = cur ?? push('')
    if (!bullet && /^\s{2,}/.test(raw) && group.items.length) group.items[group.items.length - 1] += ` ${item}`
    else group.items.push(item)
  }
  return groups.filter((g) => g.items.length > 0)
}

/** Parses a Keep a Changelog file, newest entry first (file order is kept). */
export function parseChangelog(md: string): ChangelogEntry[] {
  const lines = md.split('\n')
  const entries: ChangelogEntry[] = []
  let version: string | null = null
  let date: string | null = null
  let body: string[] = []
  const flush = (): void => {
    if (version) entries.push({ version, date, groups: parseSections(body.join('\n')) })
  }
  for (const line of lines) {
    const h = HEADING.exec(line)
    if (h) {
      flush()
      version = (h[1] ?? h[2]).trim().replace(/^v/, '')
      date = h[3] ?? null
      body = []
    } else if (version) body.push(line)
  }
  flush()
  return entries.filter((e) => e.groups.length > 0 || !/^unreleased$/i.test(e.version))
}

/** Entries newer than `current`, newest first. Unreleased sections are left out. */
export function changelogSince(entries: ChangelogEntry[], current: string, isNewer: (a: string, b: string) => boolean): ChangelogEntry[] {
  return entries.filter((e) => !/^unreleased$/i.test(e.version) && isNewer(e.version, current))
}

/** The entry's body as markdown again, for a release description. */
export function entryToMarkdown(entry: ChangelogEntry): string {
  return entry.groups
    .map((g) => (g.heading ? `### ${g.heading}\n` : '') + g.items.map((i) => `- ${i}`).join('\n'))
    .join('\n\n')
}
