import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Archive, ArrowCounterClockwise, Clock, FolderSimple, Plus, SlidersHorizontal, Star, Trash, WifiHigh, X } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Badge, Button, Card, ColorPicker, DurationField, IconButton, Input, Modal, NumberField, Page, ProjectDot, ProjectLabel, ProjectSelect, Segmented, Toggle, cx } from '../components/ui'
import { WeekEditor } from '../components/WeekEditor'
import { SETTINGS_CHANGED, resolveDefault, useTracker } from '../lib/tracker'
import { errorText, useToast } from '../lib/toast'
import { useTheme } from '../lib/theme'
import { OPEN_ONBOARDING } from '../components/Onboarding'
import { OPEN_UPDATE } from '../components/UpdateDialog'
import { ChangelogEntryView } from '../components/Changelog'
import { useUpdates } from '../lib/updates'
import { compareVersions } from '../../../shared/version'
import type { ChangelogEntry } from '../../../shared/changelog'
import type { Theme } from '../lib/theme'
import { DEFAULT_SCHEDULE, DEFAULT_SETTINGS } from '../../../shared/types'
import { PROJECT_COLORS } from '../../../shared/types'
import type { CurrentNetwork, DayKind, LocationStatus, Project, ProjectColor, Schedule, Settings } from '../../../shared/types'
import { formatDurationLong } from '../../../shared/format'

const CREDIT: { kind: DayKind; label: string }[] = [
  { kind: 'vacation', label: 'Vacation' },
  { kind: 'sick', label: 'Sick days' },
  { kind: 'holiday', label: 'Public holidays' }
]

async function detectNetwork(): Promise<CurrentNetwork | null> {
  try {
    return await window.api['wifi:current']()
  } catch {
    return null
  }
}

/** Access is missing while the answer is still open or was a no; 'unknown' means we cannot tell, so we stay quiet. */
function needsLocation(s: LocationStatus | null): boolean {
  return s === 'notDetermined' || s === 'denied' || s === 'restricted'
}

const norm = (x: string): string => x.trim().toLowerCase()
/** Mirrors the main-process watcher: SSID first, router as fallback. */
function isCurrent(name: string, settings: Settings, net: CurrentNetwork | null): boolean {
  if (!net) return false
  if (net.ssid && norm(net.ssid) === norm(name)) return true
  const r = settings.networkRouters[name]
  return !!r && !!net.routerId && r.toLowerCase() === net.routerId.toLowerCase()
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="px-1">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 max-w-[60ch] text-xs text-muted">{description}</p>}
      </div>
      <Card padded={false}>
        <div className="divide-y divide-line">{children}</div>
      </Card>
    </section>
  )
}

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        {description && <p className="mt-0.5 max-w-[48ch] text-xs text-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** The bundled changelog, so you can read what changed without leaving the app. */
function WhatsNew({ open, onClose, version }: { open: boolean; onClose: () => void; version: string }) {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)
  useEffect(() => {
    if (!open || entries) return
    window.api['app:changelog']().then(setEntries, () => setEntries([]))
  }, [open, entries])
  return (
    <Modal open={open} title="What's new" description="Every release, newest first." onClose={onClose} className="max-w-xl">
      <div className="flex flex-col gap-5 pb-4 pt-1">
        {entries === null ? (
          <p className="text-[13px] text-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-[13px] text-muted">No changelog shipped with this build.</p>
        ) : (
          entries.map((e, i) => (
            <div key={e.version} className={cx(i > 0 && 'border-t border-line pt-4')}>
              <ChangelogEntryView entry={e} current={compareVersions(e.version, version) === 0} />
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}

function ProjectRow({ project, isDefault, used, onMakeDefault }: { project: Project; isDefault: boolean; used: number; onMakeDefault: () => void }) {
  const [name, setName] = useState(project.name)
  const [picking, setPicking] = useState(false)
  const toast = useToast()
  useEffect(() => {
    setName(project.name)
  }, [project.name])
  const call = async (fn: () => Promise<unknown>, fail: string): Promise<boolean> => {
    try {
      await fn()
      return true
    } catch (e) {
      toast.error(fail, { description: errorText(e) })
      return false
    }
  }
  const update = (patch: Partial<Omit<Project, 'id'>>): Promise<boolean> => call(() => window.api['projects:update'](project.id, patch), `Couldn't update ${project.name}`)
  const archive = async (): Promise<void> => {
    if (await update({ archived: true }))
      toast.success(`${project.name} archived`, {
        id: `project-${project.id}`,
        description: 'Hidden from pickers. Its sessions keep the project.',
        actions: [{ label: 'Undo', onClick: () => void update({ archived: false }) }]
      })
  }
  const restore = async (): Promise<void> => {
    if (await update({ archived: false })) toast.success(`${project.name} restored`, { id: `project-${project.id}` })
  }
  // Only unused projects can be deleted, so undo is simply re-creating it.
  const remove = async (): Promise<void> => {
    const { name: n, color } = project
    if (await call(() => window.api['projects:remove'](project.id), `Couldn't delete ${n}`))
      toast.success(`${n} deleted`, { actions: [{ label: 'Undo', onClick: () => void call(() => window.api['projects:add']({ name: n, color }), `Couldn't restore ${n}`) }] })
  }
  const commitName = (): void => {
    const n = name.trim()
    if (n && n !== project.name) void update({ name: n }).then((ok) => ok && toast.success(`Renamed to ${n}`, { id: `project-${project.id}` }))
    else setName(project.name)
  }
  return (
    <div className={cx('flex flex-col gap-2.5 px-4 py-2.5', project.archived && 'opacity-60')}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Change color of ${project.name}`}
          aria-expanded={picking}
          onClick={() => setPicking((v) => !v)}
          className="no-drag grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-sunken"
        >
          <ProjectDot color={project.color} className="size-3" />
        </button>
        <input
          aria-label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
            if (e.key === 'Escape') setName(project.name)
          }}
          className="no-drag h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[13px] font-medium outline-none transition-colors hover:bg-sunken focus:bg-sunken focus:ring-2 focus:ring-accent/25"
        />
        <span className="tnum hidden w-24 shrink-0 text-right text-xs text-faint sm:block">{used ? `${used} ${used === 1 ? 'session' : 'sessions'}` : 'Unused'}</span>
        <div className="flex w-[11.5rem] shrink-0 items-center justify-end gap-1">
          {project.archived ? (
            <Button size="sm" variant="ghost" icon={<ArrowCounterClockwise size={13} />} onClick={() => void restore()}>Restore</Button>
          ) : (
            <>
              {isDefault ? (
                <Badge tone="accent">Default</Badge>
              ) : (
                <IconButton size="sm" label={`Make ${project.name} the default`} onClick={onMakeDefault}><Star size={14} /></IconButton>
              )}
              {used > 0 ? (
                <IconButton size="sm" label={`Archive ${project.name}`} disabled={isDefault} onClick={() => void archive()}><Archive size={14} /></IconButton>
              ) : (
                <IconButton size="sm" label={`Delete ${project.name}`} disabled={isDefault} onClick={() => void remove()}><Trash size={14} /></IconButton>
              )}
            </>
          )}
        </div>
      </div>
      {picking && (
        <div className="pl-9">
          <ColorPicker label={`Color of ${project.name}`} colors={PROJECT_COLORS} value={project.color} onChange={(c) => (void update({ color: c }), setPicking(false))} />
        </div>
      )}
    </div>
  )
}

function ProjectsSection({ settings, patch }: { settings: Settings; patch: (p: Partial<Settings>) => void }) {
  const { projects } = useTracker()
  const [usage, setUsage] = useState<Record<number, number>>({})
  const [draft, setDraft] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const toast = useToast()
  useEffect(() => {
    void window.api['projects:usage']().then(setUsage)
  }, [projects])
  const active = projects.filter((p) => !p.archived)
  const archived = projects.filter((p) => p.archived)
  const defaultId = resolveDefault(projects, settings)
  const nextColor = (): ProjectColor => PROJECT_COLORS.find((c) => !active.some((p) => p.color === c)) ?? PROJECT_COLORS[projects.length % PROJECT_COLORS.length]
  const add = async (): Promise<void> => {
    const n = draft.trim()
    if (!n) return
    try {
      await window.api['projects:add']({ name: n, color: nextColor() })
      setDraft('')
    } catch (e) {
      toast.error(`Couldn't add ${n}`, { description: errorText(e) })
    }
  }
  return (
    <Section title="Projects" description="Every session belongs to a project. New sessions use the default (starred) unless you pick another one in the top bar or on Today.">
      {active.map((p) => (
        <ProjectRow key={p.id} project={p} isDefault={p.id === defaultId} used={usage[p.id] ?? 0} onMakeDefault={() => patch({ defaultProjectId: p.id })} />
      ))}
      <form
        className="flex items-center gap-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <div className="w-56">
          <Input aria-label="New project name" placeholder="New project" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <Button type="submit" size="sm" icon={<Plus size={13} />} disabled={!draft.trim()}>Add project</Button>
        {archived.length > 0 && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </Button>
        )}
      </form>
      {showArchived && archived.map((p) => <ProjectRow key={p.id} project={p} isDefault={false} used={usage[p.id] ?? 0} onMakeDefault={() => {}} />)}
    </Section>
  )
}

type PaneId = 'work' | 'projects' | 'auto' | 'general'
const PANES: { id: PaneId; label: string; icon: Icon }[] = [
  { id: 'work', label: 'Work time', icon: Clock },
  { id: 'projects', label: 'Projects', icon: FolderSimple },
  { id: 'auto', label: 'Automatic tracking', icon: WifiHigh },
  { id: 'general', label: 'General', icon: SlidersHorizontal }
]
const PANE_KEY = 'ttt-settings-pane'
function storedPane(): PaneId {
  try {
    const v = localStorage.getItem(PANE_KEY)
    if (PANES.some((p) => p.id === v)) return v as PaneId
  } catch {
    /* ignore */
  }
  return 'work'
}

export function SettingsPage() {
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [pane, setPaneState] = useState<PaneId>(storedPane)
  const toast = useToast()
  const { theme, setTheme } = useTheme()
  const { projects } = useTracker()
  const [version, setVersion] = useState('')
  const [whatsNew, setWhatsNew] = useState(false)
  const updates = useUpdates()
  useEffect(() => {
    window.api['app:version']().then(setVersion, () => {})
  }, [])

  const setPane = (id: PaneId): void => {
    setPaneState(id)
    try {
      localStorage.setItem(PANE_KEY, id)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    Promise.all([window.api['schedule:get'](), window.api['settings:get']()])
      .then(([sch, s]) => {
        setSchedule(sch)
        setSettings(s)
        if (s.theme !== theme) setTheme(s.theme as Theme)
      })
      .catch((e) => toast.error("Couldn't load your settings", { description: errorText(e) }))
      .finally(() => setLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One reusable "Saved" toast: rapid changes refresh it instead of stacking.
  const flash = useCallback(() => {
    window.dispatchEvent(new Event(SETTINGS_CHANGED))
    toast.success('Settings saved', { id: 'settings-saved', duration: 1800 })
  }, [toast])
  const failed = useCallback((e: unknown) => toast.error("Couldn't save your settings", { id: 'settings-saved', description: errorText(e) }), [toast])

  const patch = useCallback(
    (p: Partial<Settings>) => {
      setSettings((s) => ({ ...s, ...p }))
      window.api['settings:set'](p).then(flash, failed)
    },
    [flash, failed]
  )

  // Dragging a bar changes the schedule many times a second; save once it settles.
  const scheduleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSchedule = useCallback(
    (next: Schedule) => {
      setSchedule(next)
      if (scheduleTimer.current) clearTimeout(scheduleTimer.current)
      scheduleTimer.current = setTimeout(() => window.api['schedule:set'](next).then(flash, failed), 450)
    },
    [flash, failed]
  )

  // What the weekly schedule adds up to this month: a sensible default for the monthly hours.
  const [scheduleMonth, setScheduleMonth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => window.api['stats:month']().then((h) => setScheduleMonth(h.scheduleMin), () => {}), 500)
    return () => clearTimeout(t)
  }, [schedule, settings.creditKinds])
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' })

  // Direction is kept locally too: a 0:00 balance has no sign to remember "Undertime" by.
  const [underPicked, setUnderPicked] = useState(false)
  const balanceDir = settings.startingBalance < 0 || (settings.startingBalance === 0 && underPicked) ? 'under' : 'over'

  const activeProjects = projects.filter((p) => !p.archived)
  const monthlyOn = settings.monthlyHoursByProject || settings.monthlyHoursMin > 0
  const projectHoursTotal = activeProjects.reduce((a, p) => a + (settings.projectMonthlyMin[String(p.id)] ?? 0), 0)

  // Work networks
  const [draft, setDraft] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [net, setNet] = useState<CurrentNetwork | null>(null)
  /** Set when the SSID is hidden: the next name typed is linked to this router. */
  const [naming, setNaming] = useState<CurrentNetwork | null>(null)
  const draftRef = useRef<HTMLInputElement>(null)
  // macOS hides Wi-Fi names from apps without Location access, so auto-tracking depends on it.
  const [loc, setLoc] = useState<LocationStatus | null>(null)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    let live = true
    const poll = (): void => {
      void detectNetwork().then((n) => live && setNet(n))
      void window.api['wifi:locationStatus']().then((s) => live && setLoc(s)).catch(() => undefined)
    }
    poll()
    const iv = setInterval(poll, 15000)
    return () => {
      live = false
      clearInterval(iv)
    }
  }, [])

  const addNetwork = (name: string, routerId?: string | null): void => {
    const n = name.trim()
    if (!n) return
    const workSsids = settings.workSsids.includes(n) ? settings.workSsids : [...settings.workSsids, n]
    patch({ workSsids, ...(routerId ? { networkRouters: { ...settings.networkRouters, [n]: routerId } } : {}) })
    setDraft('')
    setNaming(null)
    toast.dismiss('wifi-naming')
    toast.success(`${n} added`, {
      id: 'wifi',
      description: routerId && !settings.workSsids.includes(n) ? 'Recognized by its router, since macOS hides the Wi-Fi name.' : undefined
    })
  }
  const removeNetwork = (name: string): void => {
    const ssidProjects = { ...settings.ssidProjects }
    const networkRouters = { ...settings.networkRouters }
    delete ssidProjects[name]
    delete networkRouters[name]
    const before = { workSsids: settings.workSsids, ssidProjects: settings.ssidProjects, networkRouters: settings.networkRouters }
    patch({ workSsids: settings.workSsids.filter((x) => x !== name), ssidProjects, networkRouters })
    toast.success(`${name} removed`, { id: 'wifi', actions: [{ label: 'Undo', onClick: () => patch(before) }] })
  }
  /** Shows the macOS prompt when the user has not answered it yet; opens System Settings once they said no. */
  const askLocation = async (): Promise<LocationStatus | null> => {
    if (loc === 'denied' || loc === 'restricted') {
      void window.api['wifi:openLocationSettings']()
      toast.info('Allow Location for TTT', {
        id: 'wifi-location',
        description: 'In System Settings → Privacy & Security → Location Services, switch TTT on. macOS hides Wi-Fi names from apps without it.'
      })
      return loc
    }
    setAsking(true)
    const s = await window.api['wifi:requestLocation']().catch(() => null)
    setAsking(false)
    if (s) setLoc(s)
    void detectNetwork().then(setNet)
    if (s === 'granted') toast.success('Location access granted', { id: 'wifi-location', description: 'TTT can read Wi-Fi names now.' })
    else if (s === 'denied' || s === 'restricted')
      toast.warning('Location access denied', { id: 'wifi-location', description: 'TTT can still recognize a network by its router instead.' })
    return s
  }

  const useCurrent = async (): Promise<void> => {
    if (loc === 'notDetermined') await askLocation()
    setDetecting(true)
    const n = await detectNetwork()
    setDetecting(false)
    setNet(n)
    if (n?.ssid) addNetwork(n.ssid, n.routerId)
    else if (n?.routerId) {
      if (draft.trim()) addNetwork(draft, n.routerId)
      else {
        setNaming(n)
        toast.info('Name this network', {
          id: 'wifi-naming',
          duration: null,
          description: `macOS hides Wi-Fi names from apps without Location access. Type a name and TTT will recognize this network by its router${n.gateway ? ` (${n.gateway})` : ''}.`
        })
        requestAnimationFrame(() => draftRef.current?.focus())
      }
    } else toast.warning('No network found', { id: 'wifi', description: 'Check that you are connected, or type the network name.' })
  }

  const updateState = updates.state
  const available = updateState && updateState.releases.length ? updateState.releases[0] : null
  const checking = updateState?.phase === 'checking'
  const lastCheck = updateState?.lastCheck ? new Date(updateState.lastCheck).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null

  const toggleCredit = (k: DayKind, on: boolean) =>
    patch({ creditKinds: on ? [...new Set([...settings.creditKinds, k])] : settings.creditKinds.filter((x) => x !== k) })

  if (!loaded) {
    return (
      <div className="mx-auto flex max-w-4xl animate-pulse flex-col gap-6 px-8 pb-12 pt-8" aria-busy="true">
        <div className="h-9 w-40 rounded-md bg-sunken" />
        <div className="grid grid-cols-[180px_1fr] gap-10">
          <div className="h-36 rounded-lg bg-sunken" />
          <div className="h-80 rounded-xl bg-sunken" />
        </div>
      </div>
    )
  }

  const work = (
    <>
      <Section title="Weekly schedule" description="Expected hours per weekday. Your daily balance, the finish time on Today and the menu bar ring follow it. Drag the bars or use the arrow keys.">
        <div className="px-4 pb-4 pt-4">
          <WeekEditor schedule={schedule} onChange={saveSchedule} weekStart={settings.weekStart} onWeekStart={(w) => patch({ weekStart: w })} height={128} />
        </div>
      </Section>

      <Section
        title="Monthly hours"
        description="The hours your contract sets per month. With flextime (Gleitzeit) you spread them as you like: Today shows what is left, what each remaining workday needs, and how far ahead or behind you are."
      >
        <div className="px-4 py-3.5">
          <Toggle
            checked={monthlyOn}
            onChange={(on) => patch(on ? { monthlyHoursMin: settings.monthlyHoursMin || scheduleMonth || 160 * 60 } : { monthlyHoursMin: 0, monthlyHoursByProject: false })}
            label="Track monthly hours"
          />
        </div>
        {monthlyOn && (
          <>
            <Row title="Hours are set" description={settings.monthlyHoursByProject ? 'Each project has its own hours, for example one contract per client.' : 'One total for all projects.'}>
              <Segmented
                size="sm"
                label="How monthly hours are set"
                value={settings.monthlyHoursByProject ? 'projects' : 'total'}
                onChange={(v) => patch({ monthlyHoursByProject: v === 'projects', ...(v === 'total' && !settings.monthlyHoursMin ? { monthlyHoursMin: projectHoursTotal || scheduleMonth || 160 * 60 } : {}) })}
                options={[
                  { value: 'total', label: 'In total' },
                  { value: 'projects', label: 'Per project' }
                ]}
              />
            </Row>
            {settings.monthlyHoursByProject ? (
              <>
                {activeProjects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-4 px-4 py-2">
                    <ProjectLabel project={p} className="text-[13px]" />
                    <DurationField
                      ariaLabel={`Monthly hours for ${p.name}`}
                      value={settings.projectMonthlyMin[String(p.id)] ?? 0}
                      step={60}
                      max={744 * 60}
                      onChange={(m) => patch({ projectMonthlyMin: { ...settings.projectMonthlyMin, [String(p.id)]: m } })}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-[13px] text-muted">Total per month</span>
                  <span className="tnum text-[13px] font-medium">{formatDurationLong(projectHoursTotal) || '0h'}</span>
                </div>
              </>
            ) : (
              <Row title="Hours per month">
                <div className="flex items-center gap-2">
                  {scheduleMonth > 0 && scheduleMonth !== settings.monthlyHoursMin && (
                    <Button variant="ghost" size="sm" title={`Your weekly schedule adds up to ${formatDurationLong(scheduleMonth)} in ${monthName}`} onClick={() => patch({ monthlyHoursMin: scheduleMonth })}>
                      Use schedule ({formatDurationLong(scheduleMonth)})
                    </Button>
                  )}
                  <DurationField ariaLabel="Monthly hours (hours:minutes)" value={settings.monthlyHoursMin} step={60} max={744 * 60} onChange={(m) => patch({ monthlyHoursMin: Math.max(60, m) })} />
                </div>
              </Row>
            )}
          </>
        )}
      </Section>

      <Section title="Balance" description="How your overtime balance is counted.">
        <Row title="Carried over" description="Overtime or undertime from before you started tracking. It is added to your running balance.">
          <div className="flex items-center gap-2">
            <Segmented
              size="sm"
              label="Carried over balance direction"
              value={balanceDir}
              onChange={(v) => {
                setUnderPicked(v === 'under')
                if (settings.startingBalance) patch({ startingBalance: (v === 'under' ? -1 : 1) * Math.abs(settings.startingBalance) })
              }}
              options={[
                { value: 'over', label: 'Overtime' },
                { value: 'under', label: 'Undertime' }
              ]}
            />
            <DurationField
              ariaLabel="Carried over balance (hours:minutes)"
              value={Math.abs(settings.startingBalance)}
              max={9999 * 60}
              onChange={(m) => patch({ startingBalance: (balanceDir === 'under' ? -1 : 1) * m })}
            />
          </div>
        </Row>
        <div className="px-4 py-3.5">
          <div className="text-[13px] font-medium">Days off that count as worked</div>
          <p className="mt-0.5 max-w-[56ch] text-xs text-muted">Credited days count as your expected hours, so they never leave a deficit. Mark days off in History.</p>
          <div className="mt-3 flex flex-col gap-3">
            {CREDIT.map((c) => (
              <Toggle key={c.kind} checked={settings.creditKinds.includes(c.kind)} onChange={(v) => toggleCredit(c.kind, v)} label={c.label} />
            ))}
          </div>
        </div>
      </Section>
    </>
  )

  const auto = (
    <Section title="Automatic tracking" description="Start and stop the timer with the Wi-Fi network you are on. You can always start and pause by hand.">
      <div className="px-4 py-3.5">
        <Toggle
          checked={settings.autoTrack}
          onChange={(v) => {
            patch({ autoTrack: v })
            // Asking here, when the feature is switched on, is the moment the permission makes sense.
            if (v && loc === 'notDetermined') void askLocation()
          }}
          label="Track automatically"
          description="Runs while connected to a work network."
        />
      </div>
      {needsLocation(loc) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">Location access {loc === 'notDetermined' ? 'needed' : 'is off'}</div>
            <p className="mt-0.5 text-xs text-muted">
              macOS only reveals Wi-Fi names to apps with Location access. Without it TTT recognizes a network by its router instead, which
              works but cannot show the name.
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void askLocation()} disabled={asking}>
            {asking ? 'Waiting…' : loc === 'notDetermined' ? 'Allow location access' : 'Open System Settings'}
          </Button>
        </div>
      )}
      <div className="px-4 py-3.5">
        <div className="mb-2 text-[13px] font-medium">Work networks</div>
        {settings.workSsids.length === 0 ? (
          <p className="mb-2.5 text-xs text-muted">No networks yet. Add the Wi-Fi you use at work.</p>
        ) : (
          <ul className="mb-3 flex flex-col divide-y divide-line rounded-md border border-line">
            {settings.workSsids.map((s) => {
              const here = isCurrent(s, settings, net)
              const router = settings.networkRouters[s]
              return (
                <li key={s} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5 pl-3 pr-1.5 text-[13px]">
                  <WifiHigh size={14} className={cx('shrink-0', here ? 'text-over' : 'text-accent')} />
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate">{s}</span>
                    {here && <Badge tone="over">Connected</Badge>}
                    {router ? (
                      <span className="text-[11px] text-faint" title={`Recognized by its router (${router}) when macOS hides the Wi-Fi name`}>via router</span>
                    ) : (
                      net?.routerId && !here && (
                        <button
                          type="button"
                          onClick={() => {
                            patch({ networkRouters: { ...settings.networkRouters, [s]: net.routerId! } })
                            toast.success(`${s} linked to this network`, { id: 'wifi', description: 'TTT will recognize it by its router.' })
                          }}
                          title="Use this when you are connected to this network right now: TTT will recognize it by its router"
                          className="no-drag rounded px-1 text-[11px] text-accent hover:underline"
                        >
                          Link to current network
                        </button>
                      )
                    )}
                  </span>
                  <span className="text-xs text-faint">tracks to</span>
                  <ProjectSelect
                    className="w-44"
                    ariaLabel={`Project for sessions on ${s}`}
                    projects={projects}
                    noneLabel="Default project"
                    value={settings.ssidProjects[s] ?? null}
                    onChange={(id) => {
                      const next = { ...settings.ssidProjects }
                      if (id === null) delete next[s]
                      else next[s] = id
                      patch({ ssidProjects: next })
                    }}
                  />
                  <IconButton size="sm" label={`Remove ${s}`} onClick={() => removeNetwork(s)}>
                    <X size={12} />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        )}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addNetwork(draft, naming?.routerId)
          }}
        >
          <div className="w-56">
            <Input ref={draftRef} aria-label="Network name" placeholder={naming ? 'Name this network, e.g. Office' : 'Network name'} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </div>
          <Button type="submit" variant={naming ? 'primary' : 'secondary'} size="sm" disabled={!draft.trim()}>
            {naming ? 'Save network' : 'Add'}
          </Button>
          {naming ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => (setNaming(null), toast.dismiss('wifi-naming'))}>Cancel</Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={useCurrent} disabled={detecting}>
              {detecting ? 'Detecting…' : 'Use current network'}
            </Button>
          )}
        </form>
      </div>
      <Row title="Grace period" description="Wait this long after leaving the network before stopping.">
        <div className="w-36">
          <NumberField label="" value={settings.graceMinutes} onChange={(v) => patch({ graceMinutes: v })} min={0} max={120} step={1} precision={0} suffix="min" />
        </div>
      </Row>
    </Section>
  )

  const general = (
    <>
      <Section title="App">
        <Row title="Appearance">
          <Segmented
            size="sm"
            label="Theme"
            value={theme}
            onChange={(t) => {
              setTheme(t)
              patch({ theme: t })
            }}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
          />
        </Row>
        <div className="px-4 py-3.5">
          <Toggle checked={settings.launchAtLogin} onChange={(v) => patch({ launchAtLogin: v })} label="Open at login" description="Starts quietly in the menu bar." />
        </div>
        <Row title="Name on timesheets" description="Printed on PDF timesheets and at the top of WhatsApp summaries. Export from History.">
          <div className="w-56">
            <Input
              aria-label="Name on timesheets"
              placeholder="Your name"
              defaultValue={settings.exportName}
              onBlur={(e) => e.target.value.trim() !== settings.exportName && patch({ exportName: e.target.value.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>
        </Row>
        <Row title="Version" description="TTT is in beta. Your data stays on this Mac, but expect rough edges and report anything odd on GitHub.">
          <span className="flex items-center gap-2">
            <span className="tnum text-[13px] text-muted">{version}</span>
            <Badge tone="accent">Beta</Badge>
          </span>
        </Row>
        <Row
          title="Updates"
          description={
            updateState?.phase === 'ready'
              ? 'An update is downloaded and ready to install.'
              : available
                ? `TTT ${available.version} is available.`
                : updateState?.error && updateState.phase === 'error'
                  ? updateState.error
                  : lastCheck
                    ? `No newer release. Checked ${lastCheck}.`
                    : 'TTT installs updates from its GitHub releases.'
          }
        >
          <span className="flex items-center gap-2">
            {available ? (
              <Button variant="primary" size="sm" onClick={() => window.dispatchEvent(new Event(OPEN_UPDATE))}>
                {updateState?.phase === 'ready' ? 'Install' : 'See what changed'}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" disabled={checking} onClick={() => void updates.check()}>
                {checking ? 'Checking…' : 'Check now'}
              </Button>
            )}
          </span>
        </Row>
        <div className="px-4 py-3.5">
          <Toggle
            checked={settings.autoCheckUpdates}
            onChange={(v) => patch({ autoCheckUpdates: v })}
            label="Check for updates automatically"
            description="Looks at GitHub a few times a day. Nothing installs without you."
          />
        </div>
        <Row title="What's new" description="The changelog for this version and the ones before it.">
          <Button variant="secondary" size="sm" onClick={() => setWhatsNew(true)}>
            Read changelog
          </Button>
        </Row>
        <Row title="Welcome tour" description="Walk through schedule, projects and automatic tracking again.">
          <Button variant="secondary" size="sm" onClick={() => window.dispatchEvent(new Event(OPEN_ONBOARDING))}>
            Show again
          </Button>
        </Row>
      </Section>
      <Section title="Keyboard shortcuts">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
            <span className="text-muted">{what}</span>
            <span className="flex items-center gap-1">{keys}</span>
          </div>
        ))}
      </Section>
    </>
  )

  return (
    <Page title="Settings" width="lg">
      <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-10">
        <nav aria-label="Settings sections" className="sticky top-6 flex flex-col gap-0.5">
          {PANES.map(({ id, label, icon: I }) => {
            const on = id === pane
            return (
              <button
                key={id}
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => setPane(id)}
                className={cx(
                  'no-drag flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors duration-150',
                  on ? 'bg-sunken font-medium text-fg' : 'text-muted hover:bg-sunken/60 hover:text-fg'
                )}
              >
                <I size={15} weight={on ? 'fill' : 'regular'} className={on ? 'text-accent' : undefined} />
                {label}
              </button>
            )
          })}
        </nav>
        <div key={pane} className="rise flex min-w-0 flex-col gap-8">
          {pane === 'work' && work}
          {pane === 'projects' && <ProjectsSection settings={settings} patch={patch} />}
          {pane === 'auto' && auto}
          {pane === 'general' && general}
        </div>
      </div>
      <WhatsNew open={whatsNew} onClose={() => setWhatsNew(false)} version={version} />
    </Page>
  )
}

const SHORTCUTS: [ReactNode, string][] = [
  [<><kbd>⌘</kbd><kbd>↩</kbd></>, 'Start or pause, anywhere'],
  [<kbd>Space</kbd>, 'Start or pause on Today'],
  [<><kbd>⌘1</kbd> to <kbd>⌘4</kbd></>, 'Switch pages'],
  [<><kbd>←</kbd><kbd>→</kbd></>, 'Previous or next month in History']
]
