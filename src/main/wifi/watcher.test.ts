import { describe, it, expect, vi } from 'vitest'
import { createWifiWatcher, matchWorkNetwork } from './watcher'
import { parseArpMac, parseRouteGateway } from './ssid'

function setup(grace = 5, opts: { wifiSession?: boolean; routers?: Record<string, string> } = {}) {
  let t = 1_000_000
  let ssid: string | null = null
  let router: string | null = null
  let running = false
  const learnRouter = vi.fn()
  const onStart = vi.fn(() => { running = true })
  const onStop = vi.fn(() => { running = false })
  const w = createWifiWatcher({
    getNetwork: async () => ({ ssid, routerId: router }),
    getSettings: () => ({ workSsids: ['Office'], networkRouters: opts.routers ?? {}, graceMinutes: grace, autoTrack: true }),
    now: () => t, onStart, onStop, isRunning: () => running,
    isWifiSession: () => running && !!opts.wifiSession, learnRouter
  })
  return { w, onStart, onStop, learnRouter, setRouter: (r: string | null) => (router = r), set: (s: string | null) => (ssid = s), adv: (m: number) => (t += m * 60000), setRunning: (r: boolean) => (running = r), time: () => t }
}

describe('wifi watcher', () => {
  it('starts on work ssid, case-insensitive/trimmed', async () => {
    const s = setup(); s.set('  office '); await s.w.tick()
    expect(s.onStart).toHaveBeenCalledOnce(); expect(s.w.startedByWatcher).toBe(true)
    await s.w.tick(); expect(s.onStart).toHaveBeenCalledOnce()
  })
  it('stops after grace with last-seen timestamp', async () => {
    const s = setup(); s.set('Office'); await s.w.tick(); const seen = s.time()
    s.set('Home'); s.adv(3); await s.w.tick(); expect(s.onStop).not.toHaveBeenCalled()
    s.adv(3); await s.w.tick(); expect(s.onStop).toHaveBeenCalledWith(seen)
  })
  it('reconnect within grace cancels stop', async () => {
    const s = setup(); s.set('Office'); await s.w.tick()
    s.set(null); s.adv(4); await s.w.tick()
    s.set('Office'); s.adv(1); await s.w.tick()
    s.set(null); s.adv(4); await s.w.tick()
    expect(s.onStop).not.toHaveBeenCalled()
  })
  it('does not stop manual sessions', async () => {
    const s = setup(); s.setRunning(true); s.set('Office'); await s.w.tick()
    s.set('Home'); s.adv(10); await s.w.tick()
    expect(s.onStart).not.toHaveBeenCalled(); expect(s.onStop).not.toHaveBeenCalled()
  })
  it('stays off after clocking out until the network was left', async () => {
    const s = setup(); s.set('Office'); await s.w.tick(); expect(s.onStart).toHaveBeenCalledTimes(1)
    s.setRunning(false); s.w.holdUntilLeave()
    s.adv(1); await s.w.tick(); expect(s.onStart).toHaveBeenCalledTimes(1)
    s.set(null); s.adv(2); await s.w.tick(); s.set('Office'); s.adv(1); await s.w.tick()
    expect(s.onStart).toHaveBeenCalledTimes(1) // a short blip is not leaving
    s.set('Home'); s.adv(1); await s.w.tick(); s.adv(6); await s.w.tick()
    s.set('Office'); s.adv(60); await s.w.tick(); expect(s.onStart).toHaveBeenCalledTimes(2)
  })
  it('starting by hand clears the hold', async () => {
    const s = setup(); s.set('Office'); s.w.holdUntilLeave(); s.w.markManual(); await s.w.tick()
    expect(s.onStart).toHaveBeenCalledOnce()
  })
  it('still stops a Wi-Fi session after the app restarted', async () => {
    const s = setup(5, { wifiSession: true }); s.setRunning(true); s.set('Office'); await s.w.tick()
    expect(s.w.startedByWatcher).toBe(true); const seen = s.time()
    s.set('Home'); s.adv(6); await s.w.tick(); expect(s.onStop).toHaveBeenCalledWith(seen)
  })
  it('ends the session at the last sighting when the Mac slept, then starts a new one on wake', async () => {
    const s = setup(5); s.set('Office'); await s.w.tick(); const seen = s.time()
    s.adv(14 * 60); await s.w.tick() // overnight, wakes still at the office
    expect(s.onStop).toHaveBeenCalledWith(seen); expect(s.onStart).toHaveBeenCalledTimes(2)
  })
  it('a short delay between polls is not sleep', async () => {
    const s = setup(5); s.set('Office'); await s.w.tick(); s.adv(3); await s.w.tick()
    expect(s.onStop).not.toHaveBeenCalled()
  })
  it('grace 0 does not stop on one failed read', async () => {
    const s = setup(0); s.set('Office'); await s.w.tick()
    s.set(null); s.adv(0.2); await s.w.tick(); s.set('Office'); s.adv(0.2); await s.w.tick()
    expect(s.onStop).not.toHaveBeenCalled()
  })
  it('learns the router when the name is visible, once', async () => {
    const s = setup(); s.set('Office'); s.setRouter('aa:bb:cc:dd:ee:ff'); await s.w.tick()
    expect(s.learnRouter).toHaveBeenCalledWith('Office', 'aa:bb:cc:dd:ee:ff')
    const k = setup(5, { routers: { Office: 'aa:bb:cc:dd:ee:ff' } }); k.set('Office'); k.setRouter('aa:bb:cc:dd:ee:ff'); await k.w.tick()
    expect(k.learnRouter).not.toHaveBeenCalled()
  })
  it('does not start when autoTrack off', async () => {
    const onStart = vi.fn()
    const w = createWifiWatcher({ getNetwork: async () => ({ ssid: 'Office', routerId: null }), getSettings: () => ({ workSsids: ['Office'], networkRouters: {}, graceMinutes: 1, autoTrack: false }), now: () => 0, onStart, onStop: vi.fn(), isRunning: () => false })
    await w.tick(); expect(onStart).not.toHaveBeenCalled()
  })
  it('polls on interval', async () => {
    vi.useFakeTimers(); const s = setup(); s.set('Office'); s.w.start()
    await vi.advanceTimersByTimeAsync(10000); expect(s.onStart).toHaveBeenCalledOnce(); s.w.stop(); vi.useRealTimers()
  })
})

describe('network matching', () => {
  const cfg = { workSsids: ['Office', 'The Chefs'], networkRouters: { 'The Chefs': '60:b5:8d:96:36:fa' } }
  it('matches by SSID first, then by router when the SSID is hidden', () => {
    expect(matchWorkNetwork(cfg, { ssid: ' office ', routerId: null })).toBe('Office')
    expect(matchWorkNetwork(cfg, { ssid: null, routerId: '60:B5:8D:96:36:FA' })).toBe('The Chefs')
    expect(matchWorkNetwork(cfg, { ssid: 'Cafe', routerId: 'aa:bb:cc:dd:ee:ff' })).toBeNull()
  })
  it('parses route and arp output', () => {
    expect(parseRouteGateway('   route to: default\n    gateway: 192.168.178.1\n  interface: en0')).toBe('192.168.178.1')
    expect(parseArpMac('? (192.168.178.1) at 60:b5:8d:96:36:fa on en0 ifscope [ethernet]')).toBe('60:b5:8d:96:36:fa')
    expect(parseArpMac('? (10.0.0.1) at 0:1b:2:aa:b:c on en0')).toBe('00:1b:02:aa:0b:0c')
    expect(parseArpMac('? (10.0.0.1) at (incomplete) on en0')).toBeNull()
  })
})
