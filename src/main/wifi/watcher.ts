export interface WifiSettings {
  workSsids: string[]
  graceMinutes: number
  autoTrack: boolean
}

export interface WifiWatcherOpts {
  getSsid: () => Promise<string | null>
  getSettings: () => WifiSettings
  now: () => number
  onStart: () => void
  onStop: (endTs: number) => void
  isRunning: () => boolean
  pollMs?: number
}

const norm = (s: string) => s.trim().toLowerCase()

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
      const ssid = await o.getSsid()
      const t = o.now()
      const onWork = !!ssid && cfg.workSsids.some((w) => norm(w) === norm(ssid))
      const running = o.isRunning()
      if (!running) startedByWatcher = false
      if (onWork) {
        lastSeen = t
        if (cfg.autoTrack && !running) {
          startedByWatcher = true
          o.onStart()
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
