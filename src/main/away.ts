import type { Session } from '@shared/types'

export type AwayChoice = 'keep' | 'dropContinue' | 'dropPause'

export interface AwayInfo {
  session: Session
  /** When you left (last input, or when the Mac went to sleep). */
  from: number
  /** When you came back. */
  to: number
}

export interface AwayDeps {
  now: () => number
  /** Seconds since the last keyboard or mouse input (powerMonitor.getSystemIdleTime). */
  idleSeconds: () => number
  current: () => Session | null
  /** Away time at least this long is asked about; 0 = never ask. */
  idleMinutes: () => number
  /** A session this long is probably forgotten; 0 = never. */
  maxSessionHours: () => number
  /** Asks what to do with the time away; resolves with the choice. */
  ask: (info: AwayInfo) => Promise<AwayChoice>
  /** Ends the running session at ts (and keeps it paused). */
  stopAt: (ts: number) => void
  /** Starts a new session like `like` at ts. */
  resumeAt: (ts: number, like: Session) => void
  /** Forgotten session: stopped while away, or still running for very long. */
  onForgotten: (e: { kind: 'stopped'; session: Session; at: number } | { kind: 'long'; session: Session; hours: number }) => void
}

/** Back at the Mac when input is this recent. */
const BACK_S = 30
/** Away this long counts as "not at the Mac" for forgotten sessions even when idle asking is off. */
const FORGOTTEN_IDLE_MS = 30 * 60000

/**
 * Notices time away from the Mac while a session runs — idle without input, or asleep — and once
 * you are back asks whether that was work. Also catches sessions left running for very long.
 */
export function createAwayWatcher(d: AwayDeps) {
  let awayFrom: number | null = null
  let awaySession: number | null = null
  let asking = false
  let warnedLong: number | null = null

  const reset = (): void => {
    awayFrom = null
    awaySession = null
  }

  async function prompt(cur: Session, from: number, to: number): Promise<void> {
    asking = true
    try {
      const choice = await d.ask({ session: cur, from, to })
      // The session may have been stopped or replaced while the question was open.
      const still = d.current()
      if (!still || still.id !== cur.id) return
      if (choice === 'dropPause') d.stopAt(from)
      else if (choice === 'dropContinue') {
        d.stopAt(from)
        d.resumeAt(Math.max(to, from + 1), cur)
      }
    } finally {
      asking = false
    }
  }

  function tick(): void {
    if (asking) return
    const cur = d.current()
    if (!cur) return reset()
    if (awaySession !== null && awaySession !== cur.id) reset()
    const now = d.now()
    const idleMs = Math.max(0, d.idleSeconds()) * 1000
    const lastInput = Math.max(cur.startTs, now - idleMs)
    const threshold = d.idleMinutes() * 60000

    // Forgotten: running for very long. Away → end it when you were last here; at the Mac → ask once.
    const maxMs = d.maxSessionHours() * 3600000
    if (maxMs > 0 && now - cur.startTs >= maxMs) {
      const leftAt = awayFrom ?? (idleMs >= Math.min(FORGOTTEN_IDLE_MS, threshold || FORGOTTEN_IDLE_MS) ? lastInput : null)
      if (leftAt !== null) {
        const at = Math.max(cur.startTs + 1, leftAt)
        d.stopAt(at)
        reset()
        d.onForgotten({ kind: 'stopped', session: cur, at })
        return
      }
      if (warnedLong !== cur.id) {
        warnedLong = cur.id
        d.onForgotten({ kind: 'long', session: cur, hours: Math.floor((now - cur.startTs) / 3600000) })
      }
    }

    if (threshold <= 0) return reset()
    if (idleMs >= threshold) {
      if (awayFrom === null) ((awayFrom = lastInput), (awaySession = cur.id))
      return
    }
    if (awayFrom !== null && idleMs < BACK_S * 1000) {
      const from = Math.max(awayFrom, cur.startTs)
      const to = lastInput
      reset()
      if (to - from >= threshold) void prompt(cur, from, to)
    }
  }

  return {
    tick,
    /** The Mac went to sleep at ts: time from then on is away, unless it turns out short. */
    suspended(ts: number): void {
      const cur = d.current()
      if (!cur) return
      if (awayFrom === null || ts < awayFrom) ((awayFrom = Math.max(ts, cur.startTs)), (awaySession = cur.id))
    },
    /** Woke up: forget a sleep too short to matter. */
    resumed(): void {
      if (awayFrom === null) return
      const threshold = d.idleMinutes() * 60000
      if (threshold <= 0 || d.now() - awayFrom < threshold) reset()
    },
    get away(): number | null {
      return awayFrom
    }
  }
}
