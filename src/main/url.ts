export type UrlAction =
  { kind: 'start'; project: string | null } | { kind: 'pause' } | { kind: 'toggle' } | { kind: 'open'; page: 'today' | 'history' | 'stats' | 'settings' | null }

const PAGES = ['today', 'history', 'stats', 'settings'] as const

/**
 * ttt:// links, for Shortcuts, Focus modes, Raycast and the like:
 * ttt://start, ttt://start?project=Acme, ttt://pause, ttt://toggle, ttt://open?page=history
 */
export function parseTttUrl(raw: string): UrlAction | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'ttt:') return null
  // ttt://start parses with "start" as the host; ttt:start as the path.
  const verb = (u.host || u.pathname.replace(/^\/+/, '')).toLowerCase()
  if (verb === 'start') return { kind: 'start', project: u.searchParams.get('project')?.trim() || null }
  if (verb === 'pause' || verb === 'stop') return { kind: 'pause' }
  if (verb === 'toggle') return { kind: 'toggle' }
  if (verb === 'open') {
    const p = u.searchParams.get('page')?.toLowerCase()
    return { kind: 'open', page: (PAGES as readonly string[]).includes(p ?? '') ? (p as (typeof PAGES)[number]) : null }
  }
  return null
}
