import { describe, expect, it } from 'vitest'
import { cleanVersion, compareVersions, isNewer, parseVersion } from './version'

describe('parseVersion', () => {
  it('reads a plain version', () => expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] }))
  it('reads a tag with prerelease', () => expect(parseVersion('v0.1.0-beta.2')).toEqual({ major: 0, minor: 1, patch: 0, pre: ['beta', 2] }))
  it('ignores build metadata', () => expect(parseVersion('1.0.0+abc')?.pre).toEqual([]))
  it('rejects nonsense', () => expect(parseVersion('latest')).toBeNull())
})

describe('compareVersions', () => {
  const cases: [string, string, number][] = [
    ['1.0.0', '1.0.0', 0],
    ['1.0.1', '1.0.0', 1],
    ['1.1.0', '1.0.9', 1],
    ['2.0.0', '10.0.0', -1],
    ['1.0.0', '1.0.0-beta.1', 1],
    ['0.1.0-beta.2', '0.1.0-beta.10', -1],
    ['0.1.0-beta.2', '0.1.0-beta.2', 0],
    ['0.1.0-rc.1', '0.1.0-beta.9', 1],
    ['v0.2.0', '0.1.0', 1]
  ]
  for (const [a, b, want] of cases) it(`${a} vs ${b}`, () => expect(compareVersions(a, b)).toBe(want))
  it('sorts unparsable versions below parsable ones', () => expect(compareVersions('nightly', '1.0.0')).toBe(-1))
})

it('isNewer only accepts a strictly higher version', () => {
  expect(isNewer('0.1.0-beta.3', '0.1.0-beta.2')).toBe(true)
  expect(isNewer('0.1.0-beta.2', '0.1.0-beta.2')).toBe(false)
  expect(isNewer('0.1.0-beta.1', '0.1.0-beta.2')).toBe(false)
})

it('cleanVersion strips the tag prefix', () => expect(cleanVersion('v1.2.3')).toBe('1.2.3'))
