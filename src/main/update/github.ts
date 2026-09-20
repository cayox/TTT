import { net } from 'electron'
import { REPO, type GhRelease } from './releases'

const API = `https://api.github.com/repos/${REPO}/releases?per_page=20`

/** GET the releases API. Throws with a readable message; the caller decides how loud to be. */
export async function fetchReleases(): Promise<GhRelease[]> {
  const res = await net.fetch(API, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  })
  if (!res.ok) throw new Error(res.status === 403 ? 'GitHub rate limit reached, try again later' : `GitHub replied ${res.status}`)
  const body = (await res.json()) as unknown
  if (!Array.isArray(body)) throw new Error('Unexpected reply from GitHub')
  return body as GhRelease[]
}
