import { describe, expect, it } from 'vitest'
import { changelogSince, entryToMarkdown, parseChangelog, parseSections } from './changelog'
import { isNewer } from './version'

const MD = `# Changelog

All notable changes are listed here.

## [Unreleased]

## [0.2.0] - 2026-09-20

### Added

- Automatic updates from GitHub releases
- A changelog you can read before updating

### Fixed

- The menu bar icon no longer opens the window

## [0.1.0] - 2026-08-01

- First beta
`

describe('parseChangelog', () => {
  const entries = parseChangelog(MD)
  it('keeps newest first and drops an empty Unreleased', () => expect(entries.map((e) => e.version)).toEqual(['0.2.0', '0.1.0']))
  it('reads the date', () => expect(entries[0].date).toBe('2026-09-20'))
  it('groups items under their headings', () =>
    expect(entries[0].groups).toEqual([
      { heading: 'Added', items: ['Automatic updates from GitHub releases', 'A changelog you can read before updating'] },
      { heading: 'Fixed', items: ['The menu bar icon no longer opens the window'] }
    ]))
  it('accepts items without a heading', () => expect(entries[1].groups).toEqual([{ heading: '', items: ['First beta'] }]))
})

describe('parseSections', () => {
  it('treats free-form release notes as items', () => expect(parseSections('Just a quick fix.')).toEqual([{ heading: '', items: ['Just a quick fix.'] }]))
  it('joins a wrapped bullet into one item', () =>
    expect(parseSections('- a long line\n  that wrapped')).toEqual([{ heading: '', items: ['a long line that wrapped'] }]))
  it('ignores an empty body', () => expect(parseSections('\n\n')).toEqual([]))
})

it('changelogSince returns only newer entries', () => {
  expect(changelogSince(parseChangelog(MD), '0.1.0', isNewer).map((e) => e.version)).toEqual(['0.2.0'])
  expect(changelogSince(parseChangelog(MD), '0.2.0', isNewer)).toEqual([])
})

it('entryToMarkdown round-trips an entry body', () => {
  const md = entryToMarkdown(parseChangelog(MD)[0])
  expect(md).toBe('### Added\n- Automatic updates from GitHub releases\n- A changelog you can read before updating\n\n### Fixed\n- The menu bar icon no longer opens the window')
  expect(parseSections(md)).toEqual(parseChangelog(MD)[0].groups)
})
