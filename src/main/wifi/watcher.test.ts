import { describe, it, expect, vi } from 'vitest'
import { createWifiWatcher } from './watcher'

function setup(grace = 5) {
  let t = 1_000_000
  let ssid: string | null = null
  let running = false
  const onStart = vi.fn(() => { running = true })
  const onStop = vi.fn(() => { running = false })
  const w = createWifiWatcher({
    getSsid: async () => ssid,
    getSettings: () => ({ workSsids: ['Office'], graceMinutes: grace, autoTrack: true }),
    now: () => t, onStart, onStop, isRunning: () => running
  })
  return { w, onStart, onStop, set: (s: string | null) => (ssid = s), adv: (m: number) => (t += m * 60000), setRunning: (r: boolean) => (running = r), time: () => t }
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
  it('does not start when autoTrack off', async () => {
    const onStart = vi.fn()
    const w = createWifiWatcher({ getSsid: async () => 'Office', getSettings: () => ({ workSsids: ['Office'], graceMinutes: 1, autoTrack: false }), now: () => 0, onStart, onStop: vi.fn(), isRunning: () => false })
    await w.tick(); expect(onStart).not.toHaveBeenCalled()
  })
  it('polls on interval', async () => {
    vi.useFakeTimers(); const s = setup(); s.set('Office'); s.w.start()
    await vi.advanceTimersByTimeAsync(10000); expect(s.onStart).toHaveBeenCalledOnce(); s.w.stop(); vi.useRealTimers()
  })
})
