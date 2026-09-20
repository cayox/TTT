import { execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { swapScript } from './script'

const exec = promisify(execFile)

/** A pid nothing is using, so the script's wait loop falls straight through. */
const DEAD_PID = 2 ** 22

let root: string

function bundle(path: string, marker: string): string {
  mkdirSync(join(path, 'Contents'), { recursive: true })
  writeFileSync(join(path, 'Contents', 'version.txt'), marker)
  return path
}

/** Runs the script with a stub launcher, so the test never actually opens anything. */
async function runScript(opts: { target: string; staged: string; stageDir: string }): Promise<string> {
  const opened = join(root, 'opened.txt')
  const stub = join(root, 'fake open')
  writeFileSync(stub, `#!/bin/sh\necho "$1" >> ${JSON.stringify(opened)}\n`, { mode: 0o755 })
  const script = join(opts.stageDir, 'install.sh')
  writeFileSync(script, swapScript({ pid: DEAD_PID, open: stub, ...opts }), { mode: 0o755 })
  await exec('/bin/sh', [script])
  return existsSync(opened) ? readFileSync(opened, 'utf8').trim() : ''
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ttt-swap-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('swapScript', () => {
  it('replaces the installed bundle and launches it', async () => {
    const apps = join(root, 'Applications')
    mkdirSync(apps)
    const target = bundle(join(apps, 'TTT.app'), 'old')
    const stageDir = join(root, 'stage')
    mkdirSync(stageDir)
    const staged = bundle(join(stageDir, 'TTT.app'), 'new')

    const opened = await runScript({ target, staged, stageDir })

    expect(readFileSync(join(target, 'Contents', 'version.txt'), 'utf8')).toBe('new')
    expect(opened).toBe(target)
    // No backup and no download left behind.
    expect(existsSync(`${target}.old`)).toBe(false)
    expect(existsSync(stageDir)).toBe(false)
  })

  it('puts the old bundle back when the copy fails', async () => {
    const apps = join(root, 'Applications')
    mkdirSync(apps)
    const target = bundle(join(apps, 'TTT.app'), 'old')
    const stageDir = join(root, 'stage')
    mkdirSync(stageDir)

    // The staged bundle is gone, so ditto cannot copy it.
    await runScript({ target, staged: join(stageDir, 'missing.app'), stageDir })

    expect(readFileSync(join(target, 'Contents', 'version.txt'), 'utf8')).toBe('old')
    expect(existsSync(`${target}.old`)).toBe(false)
  })

  it('quotes paths with spaces and quotes', async () => {
    const apps = join(root, "Weird 'Apps'")
    mkdirSync(apps)
    const target = bundle(join(apps, 'TTT.app'), 'old')
    const stageDir = join(root, 'my stage')
    mkdirSync(stageDir)
    const staged = bundle(join(stageDir, 'TTT.app'), 'new')

    const opened = await runScript({ target, staged, stageDir })

    expect(readFileSync(join(target, 'Contents', 'version.txt'), 'utf8')).toBe('new')
    expect(opened).toBe(target)
  })
})
