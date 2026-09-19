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
  pollMs?: number
}

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

  async function tick(): Promise<void> {
    if (busy) return
    busy = true
    try {
      const cfg = o.getSettings()
      const net = await o.getNetwork()
      const t = o.now()
      const match = matchWorkNetwork(cfg, net)
      const onWork = match !== null
      const running = o.isRunning()
      if (!running) startedByWatcher = false
      if (onWork) {
        lastSeen = t
        if (cfg.autoTrack && !running) {
          startedByWatcher = true
          o.onStart(match!)
        }
      } else if (startedByWatcher && running && lastSeen !== null) {
        if (t - lastSeen >= cfg.graceMinutes * 60000) {
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
    }
  }
}
