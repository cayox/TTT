export interface WifiSettings {
  workSsids: string[]
  /** name -> router MAC; matches when the SSID is hidden */
  networkRouters: Record<string, string>
  graceMinutes: number
  autoTrack: boolean
}

export interface WifiWatcherOpts {
  getNetwork: () => Promise<{ ssid: string | null; routerId: string | null }>
  getSettings: () => WifiSettings
  now: () => number
  /** Called with the matched work network name so the session can go to its project. */
  onStart: (name: string) => void
  onStop: (endTs: number) => void
  isRunning: () => boolean
  /** True when the running session was started by Wi-Fi, so it is still stopped by Wi-Fi after a restart. */
  isWifiSession?: () => boolean
  /** Called when a work network is seen by name together with its router, to recognize it later when macOS hides the name. */
  learnRouter?: (name: string, routerId: string) => void
  pollMs?: number
}

/** Shorter gaps between polls are timer jitter; longer ones mean the Mac was asleep. */
export const SLEEP_GAP_MS = 10 * 60000

/** Floor for the grace period, so a grace of 0 cannot stop a session on a single failed read. */
const MIN_GRACE_MS = 60000

const norm = (s: string) => s.trim().toLowerCase()

/** Work network name matching the current network, by SSID or else by router. */
export function matchWorkNetwork(cfg: Pick<WifiSettings, 'workSsids' | 'networkRouters'>, net: { ssid: string | null; routerId: string | null }): string | null {
  if (net.ssid) {
    const byName = cfg.workSsids.find((w) => norm(w) === norm(net.ssid!))
    if (byName) return byName
  }
  if (net.routerId) {
    const byRouter = cfg.workSsids.find((w) => cfg.networkRouters[w]?.toLowerCase() === net.routerId!.toLowerCase())
    if (byRouter) return byRouter
  }
  return null
}

export function createWifiWatcher(o: WifiWatcherOpts) {
  let timer: ReturnType<typeof setInterval> | null = null
  let startedByWatcher = false
  let lastSeen: number | null = null
  let busy = false
  /** Set after clocking out while still on the work network: no auto-start until it has been left. */
  let held = false
  let offSince: number | null = null
  let lastTick: number | null = null

  async function tick(): Promise<void> {
    if (busy) return
    busy = true
    try {
      const cfg = o.getSettings()
      const grace = Math.max(cfg.graceMinutes * 60000, MIN_GRACE_MS)
      const net = await o.getNetwork()
      const t = o.now()
      const match = matchWorkNetwork(cfg, net)
      const onWork = match !== null
      let running = o.isRunning()
      if (!running) startedByWatcher = false
      // Ownership lives in memory; after a restart (an update, a crash) take it back from the session itself.
      else if (!startedByWatcher && o.isWifiSession?.()) {
        startedByWatcher = true
        lastSeen ??= t
      }

      // Woke from sleep: the time asleep is not work, even when the Mac wakes on the same network
      // (lid closed at the office overnight). End at the last sighting; this tick may start a new one.
      const slept = lastTick !== null && t - lastTick > Math.max(grace, SLEEP_GAP_MS)
      lastTick = t
      if (slept && startedByWatcher && running && lastSeen !== null) {
        const end = lastSeen
        startedByWatcher = false
        lastSeen = null
        o.onStop(end)
        running = o.isRunning()
      }

      if (match && net.ssid && net.routerId && !cfg.networkRouters[match])
        o.learnRouter?.(match, net.routerId)
      if (onWork) offSince = null
      else if (offSince === null) offSince = t
      // Leaving for the grace period ends the hold, so the next arrival starts tracking again.
      if (held && offSince !== null && t - offSince >= grace) held = false
      if (onWork) {
        lastSeen = t
        if (cfg.autoTrack && !running && !held) {
          startedByWatcher = true
          o.onStart(match!)
        }
      } else if (startedByWatcher && running && lastSeen !== null) {
        if (t - lastSeen >= grace) {
          const end = lastSeen
          startedByWatcher = false
          lastSeen = null
          o.onStop(end)
        }
      } else if (!running) {
        lastSeen = null
      }
    } finally {
      busy = false
    }
  }

  return {
    tick,
    start() {
      if (timer) return
      void tick()
      timer = setInterval(() => void tick(), o.pollMs ?? 10000)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    get startedByWatcher() {
      return startedByWatcher
    },
    /** Call when a session is started manually / by another source: clears ownership. */
    markManual() {
      startedByWatcher = false
      held = false
    },
    /** Call when the user clocks out: do not restart until the work network has been left. */
    holdUntilLeave() {
      startedByWatcher = false
      held = true
      offSince = null
    }
  }
}
