import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Project, Session, Settings } from '../../../shared/types'
import { errorText, useToast } from './toast'

/** Fired by the Settings page after a save so the nav status can refresh. */
export const SETTINGS_CHANGED = 'ttt-settings'

interface Tracker {
  current: Session | null
  settings: Settings | null
  /** All projects, archived included (pickers filter them out). */
  projects: Project[]
  projectById: (id: number | null | undefined) => Project | undefined
  /** Project the next Start uses: picked by hand, else your usual one at this time, else the default. */
  nextProjectId: number | null
  /** Your usual project at this weekday and hour, when there is a habit; null otherwise. */
  suggestedProjectId: number | null
  /** Pick the project: moves the running session, or sets the one the next Start uses. */
  chooseProject: (id: number) => Promise<void>
  /** Ticks every second while a session runs. */
  now: number
  busy: boolean
  toggle: () => Promise<void>
  /** When the running session is set to clock out, epoch ms; null = not planned. */
  plannedStop: number | null
  /** Clock out at ts: now or earlier ends the session right away, later schedules it. */
  stopAt: (ts: number) => Promise<void>
  cancelPlannedStop: () => Promise<void>
}

const Ctx = createContext<Tracker | null>(null)

/** Configured default if active, else the first active project (mirrors the main process). */
export function resolveDefault(projects: Project[], settings: Settings | null): number | null {
  const active = projects.filter((p) => !p.archived)
  return active.find((p) => p.id === settings?.defaultProjectId)?.id ?? active[0]?.id ?? null
}

/** Shared running-session and project state for the top bar, pages and shortcuts. */
export function TrackerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Session | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [plannedStop, setPlannedStop] = useState<number | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [suggested, setSuggested] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const toast = useToast()

  const refresh = useCallback(async () => {
    try {
      const [c, s, p, ps, sug] = await Promise.all([
        window.api['sessions:current'](),
        window.api['settings:get'](),
        window.api['projects:list'](),
        window.api['sessions:plannedStop'](),
        window.api['sessions:suggest']().catch(() => null)
      ])
      setCurrent(c)
      setSuggested(sug)
      setPlannedStop(ps)
      setSettings(s)
      setProjects(p)
    } catch {
      /* keep last known state */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const offS = window.events.onSessionsChanged(() => void refresh())
    const offP = window.events.onProjectsChanged(() => void refresh())
    const offD = window.events.onDataReplaced(() => void refresh())
    const on = (): void => void refresh()
    // The usual project depends on the hour, so look again now and then.
    const iv = setInterval(on, 10 * 60000)
    window.addEventListener('focus', on)
    window.addEventListener(SETTINGS_CHANGED, on)
    return () => {
      offS()
      offP()
      offD()
      clearInterval(iv)
      window.removeEventListener('focus', on)
      window.removeEventListener(SETTINGS_CHANGED, on)
    }
  }, [refresh])

  const running = !!current
  // Every second while running; otherwise every 30 s, so the pages still roll over to a new day.
  useEffect(() => {
    setNow(Date.now())
    const iv = setInterval(() => setNow(Date.now()), running ? 1000 : 30000)
    const wake = (): void => setNow(Date.now())
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [running])

  const pickedValid = projects.some((p) => p.id === picked && !p.archived)
  const suggestedValid = projects.some((p) => p.id === suggested && !p.archived)
  const suggestedProjectId = suggestedValid ? suggested : null
  const nextProjectId = pickedValid ? picked : (suggestedProjectId ?? resolveDefault(projects, settings))

  const toggle = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      if (current) await window.api['sessions:stop']()
      else await window.api['sessions:start'](nextProjectId)
      await refresh()
    } catch (e) {
      toast.error(current ? "Couldn't pause tracking" : "Couldn't start tracking", { description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }, [busy, current, nextProjectId, refresh, toast])

  const stopAt = useCallback(
    async (ts: number) => {
      try {
        await window.api['sessions:stopAt'](ts)
        await refresh()
      } catch (e) {
        toast.error("Couldn't set the clock-out time", { description: errorText(e) })
      }
    },
    [refresh, toast]
  )

  const cancelPlannedStop = useCallback(async () => {
    try {
      await window.api['sessions:cancelPlannedStop']()
      await refresh()
    } catch (e) {
      toast.error("Couldn't cancel the clock-out", { description: errorText(e) })
    }
  }, [refresh, toast])

  const chooseProject = useCallback(
    async (id: number) => {
      setPicked(id)
      if (current && current.projectId !== id) {
        try {
          await window.api['sessions:update'](current.id, { projectId: id })
          await refresh()
        } catch (e) {
          toast.error("Couldn't switch the project", { description: errorText(e) })
        }
      }
    },
    [current, refresh, toast]
  )

  const value = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]))
    const projectById = (id: number | null | undefined): Project | undefined => (id == null ? undefined : byId.get(id))
    return { current, settings, projects, projectById, nextProjectId, suggestedProjectId, chooseProject, now, busy, toggle, plannedStop, stopAt, cancelPlannedStop }
  }, [current, settings, projects, nextProjectId, suggestedProjectId, chooseProject, now, busy, toggle, plannedStop, stopAt, cancelPlannedStop])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTracker(): Tracker {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTracker outside TrackerProvider')
  return v
}

/** True when a keyboard event is aimed at a text field, so page shortcuts should not fire. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}
