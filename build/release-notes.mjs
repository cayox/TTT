// Prints the CHANGELOG.md section for a version, for use as a GitHub release description:
//   node build/release-notes.mjs 1.2.3 > notes.md
// Exits non-zero when the version has no section, so a release cannot go out without notes.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = (process.argv[2] ?? '').trim().replace(/^v/, '')
if (!version) {
  console.error('Usage: node build/release-notes.mjs <version>')
  process.exit(2)
}

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md')
const lines = readFileSync(file, 'utf8').split('\n')
const isHeading = (l) => /^##\s/.test(l)
const headingVersion = (l) => /^##\s+(?:\[([^\]]+)\]|(\S+))/.exec(l)?.slice(1).find(Boolean)?.replace(/^v/, '')

const start = lines.findIndex((l) => isHeading(l) && headingVersion(l) === version)
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}. Add one under "## [${version}] - YYYY-MM-DD".`)
  process.exit(1)
}
const rest = lines.slice(start + 1)
const end = rest.findIndex(isHeading)
const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
if (!body) {
  console.error(`The ${version} section in CHANGELOG.md is empty.`)
  process.exit(1)
}
console.log(body)
