import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Archive, ArrowCounterClockwise, CaretUpDown, Clock, Database, FolderSimple, MapPin, Plus, SlidersHorizontal, Star, Trash, WifiHigh, X } from '@phosphor-icons/react'
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
import { EXPORT_ROUNDING, GLOBAL_SHORTCUTS, PLACE_RADII, PROJECT_COLORS, TIME_STEPS } from '../../../shared/types'
import { distanceM, MAX_FIX_ACCURACY_M } from '../../../shared/places'
import type { BackupInfo, CurrentNetwork, DayKind, LocationFix, LocationStatus, NotificationSettings, Project, ProjectColor, Schedule, Settings } from '../../../shared/types'
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

const radiusLabel = (m: number): string => (m >= 1000 ? `${m / 1000} km` : `${m} m`)
/** "120 m away", "3.4 km away" */
const awayLabel = (m: number): string => (m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km away`)
/** Work network and work place names share the project map, so they must not collide. */
const nameTaken = (name: string, s: Settings): boolean =>
  s.workSsids.some((w) => norm(w) === norm(name)) || s.workPlaces.some((p) => norm(p.name) === norm(name))
/** Mirrors the main-process watcher: SSID first, router as fallback. */
function isCurrent(name: string, settings: Settings, net: CurrentNetwork | null): boolean {
  if (!net) return false
  if (net.ssid && norm(net.ssid) === norm(name)) return true
  const r = settings.networkRouters[name]
  return !!r && !!net.routerId && r.toLowerCase() === net.routerId.toLowerCase()
}

/** Native select styled like ProjectSelect's inline variant: "within 250 m". */
function RadiusSelect({ value, onChange, ariaLabel }: { value: number; onChange: (m: number) => void; ariaLabel: string }) {
  const options = [...new Set<number>([...PLACE_RADII, value])].sort((a, b) => a - b)
  return (
    <div className="no-drag relative flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted hover:bg-sunken focus-within:ring-2 focus-within:ring-accent/40">
      <span className="tnum">within {radiusLabel(value)}</span>
      <CaretUpDown size={11} className="text-faint" />
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(Number(e.target.value))} className="absolute inset-0 cursor-default opacity-0">
        {options.map((r) => (
          <option key={r} value={r}>
            {radiusLabel(r)}
          </option>
        ))}
      </select>
    </div>
  )
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

function ProjectRow({ project, isDefault, used, onMakeDefault, onArchived }: {
  project: Project
  isDefault: boolean
  used: number
  onMakeDefault: () => void
  /** Extra toast action after archiving, e.g. moving its monthly hours. */
  onArchived?: () => { label: string; onClick: () => void } | null
}) {
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
    if (await update({ archived: true })) {
      const extra = onArchived?.()
      toast.success(`${project.name} archived`, {
        id: `project-${project.id}`,
        description: extra ? 'Hidden from pickers. Its monthly hours no longer count.' : 'Hidden from pickers. Its sessions keep the project.',
        duration: extra ? null : undefined,
        actions: [{ label: 'Undo', onClick: () => void update({ archived: false }) }, ...(extra ? [extra] : [])]
      })
    }
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
        <ProjectRow
          key={p.id}
          project={p}
          isDefault={p.id === defaultId}
          used={usage[p.id] ?? 0}
          onMakeDefault={() => patch({ defaultProjectId: p.id })}
          onArchived={() => {
            // Hours from the contract should not vanish with the project: offer them to the default one.
            const min = settings.monthlyHoursByProject ? (settings.projectMonthlyMin[String(p.id)] ?? 0) : 0
            const target = active.find((x) => x.id === defaultId && x.id !== p.id)
            if (!min || !target) return null
            return {
              label: `Move ${formatDurationLong(min)} to ${target.name}`,
              onClick: () =>
                patch({
                  projectMonthlyMin: {
                    ...settings.projectMonthlyMin,
                    [String(target.id)]: (settings.projectMonthlyMin[String(target.id)] ?? 0) + min,
                    [String(p.id)]: 0
                  }
                })
            }
          }}
        />
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

type PaneId = 'work' | 'projects' | 'auto' | 'general' | 'data'
const PANES: { id: PaneId; label: string; icon: Icon }[] = [
  { id: 'work', label: 'Work time', icon: Clock },
  { id: 'projects', label: 'Projects', icon: FolderSimple },
  { id: 'auto', label: 'Tracking', icon: WifiHigh },
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'data', label: 'Data & export', icon: Database }
]

const NOTIFY: { key: keyof NotificationSettings; label: string; description: string }[] = [
  { key: 'autoTrack', label: 'Automatic tracking', description: 'When Wi-Fi starts or stops the timer.' },
  { key: 'target', label: "Today's hours done", description: 'When you reach your expected time.' },
  { key: 'breaks', label: 'Breaks', description: 'When a legal break is due or the day gets close to 10 hours.' },
  { key: 'clockOut', label: 'Planned clock-out', description: 'Ten minutes before, and when it happens.' },
  { key: 'forgotten', label: 'Forgotten sessions', description: 'When a session has run for very long.' }
]

const KIND_NAME: Record<BackupInfo['backups'][number]['kind'], string> = { daily: 'Daily', migration: 'Before update', manual: 'Manual', import: 'Before import' }
const fmtSize = (b: number): string => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** Backups, full export/import and diagnostics. */
function DataPane({ settings, patch }: { settings: Settings; patch: (p: Partial<Settings>) => void }) {
  const toast = useToast()
  const [info, setInfo] = useState<BackupInfo | null>(null)
  const [showAll, setShowAll] = useState(false)
  const load = useCallback(() => void window.api['data:backups']().then(setInfo, () => setInfo({ dir: '', backups: [] })), [])
  useEffect(load, [load])
  const run = async <T,>(fn: () => Promise<T>, fail: string): Promise<T | undefined> => {
    try {
      return await fn()
    } catch (e) {
      toast.error(fail, { description: errorText(e) })
      return undefined
    }
  }
  const saved = (title: string, path: string | null | undefined): void => {
    if (path)
      toast.success(title, {
        id: 'data',
        description: path.split('/').pop(),
        actions: [{ label: 'Show in Finder', onClick: () => void window.api['export:revealLast']() }]
      })
  }
  const backups = info?.backups ?? []
  const shown = showAll ? backups : backups.slice(0, 5)
  return (
    <>
      <Section title="Exports" description="Timesheets, CSV and calendar files for a month are in History → Export.">
        <Row title="Name on timesheets" description="Printed on PDF timesheets and at the top of WhatsApp summaries.">
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
        <Row
          title="Round times"
          description={
            settings.exportRoundMin
              ? `Exports show start and end rounded to the nearest ${settings.exportRoundMin} minutes. Your balance keeps the exact times.`
              : 'Exports show the exact times.'
          }
        >
          <Segmented
            size="sm"
            label="Round times on exports"
            value={String(settings.exportRoundMin)}
            onChange={(v) => patch({ exportRoundMin: Number(v) })}
            options={EXPORT_ROUNDING.map((n) => ({ value: String(n), label: n === 0 ? 'Exact' : `${n} min` }))}
          />
        </Row>
      </Section>

      <Section title="All your data" description="Everything stays on this Mac. Export it to keep a copy, or to move TTT to another Mac.">
        <Row title="Export" description="JSON holds everything and can be imported again. CSV lists every session for a spreadsheet.">
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={async () => saved('Data exported', await run(() => window.api['data:exportJson'](), 'Export failed'))}>
              JSON…
            </Button>
            <Button size="sm" variant="secondary" onClick={async () => saved('Sessions exported', await run(() => window.api['data:exportCsv'](), 'Export failed'))}>
              CSV…
            </Button>
          </span>
        </Row>
        <Row title="Import" description="Replaces everything in TTT with a JSON export. Your current data is backed up first.">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const ok = await run(() => window.api['data:import'](), "Couldn't import that file")
              if (ok) (toast.success('Data imported', { description: 'TTT now shows the imported data.' }), load())
            }}
          >
            Import JSON…
          </Button>
        </Row>
      </Section>

      <Section title="Backups" description="TTT backs up its database once a day and keeps two weeks, plus a copy before every database upgrade and before imports or restores.">
        {backups.length === 0 ? (
          <p className="px-4 py-3.5 text-xs text-muted">No backups yet. The first one is made today.</p>
        ) : (
          <ul aria-label="Backups" className="divide-y divide-line">
            {shown.map((b) => (
              <li key={b.name} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                <span className="tnum min-w-0 flex-1">{new Date(b.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <Badge>{KIND_NAME[b.kind]}</Badge>
                <span className="tnum w-16 text-right text-xs text-faint">{fmtSize(b.size)}</span>
                <Button size="sm" variant="ghost" onClick={() => void run(() => window.api['data:restore'](b.name), "Couldn't restore the backup")}>
                  Restore…
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              if (await run(() => window.api['data:backupNow'](), 'Backup failed')) (toast.success('Backup saved', { id: 'data' }), load())
            }}
          >
            Back up now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void window.api['data:openBackups']()}>
            Show in Finder
          </Button>
          {backups.length > 5 && (
            <Button size="sm" variant="ghost" className="ml-auto" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all (${backups.length})`}
            </Button>
          )}
        </div>
      </Section>

      <Section title="Troubleshooting" description="For bug reports on GitHub. Diagnostics list versions, counts and recent errors, never your sessions, notes or network names.">
        <Row title="Diagnostics">
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const text = await run(() => window.api['app:diagnostics'](), "Couldn't collect diagnostics")
                if (!text) return
                try {
                  await navigator.clipboard.writeText(text)
                  toast.success('Diagnostics copied', { description: 'Paste them into your GitHub issue.' })
                } catch (e) {
                  toast.error("Couldn't copy", { description: errorText(e) })
                }
              }}
            >
              Copy diagnostics
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void window.api['app:revealLog']()}>
              Show log file
            </Button>
          </span>
        </Row>
      </Section>
    </>
  )
}
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
  // Work places
  const [placeDraft, setPlaceDraft] = useState('')
  const [locating, setLocating] = useState(false)
  const [fix, setFix] = useState<LocationFix | null>(null)
  const hasPlaces = settings.workPlaces.length > 0

  // Where you are, for the "Here" and distance labels; only while places exist and access is granted.
  useEffect(() => {
    if (!hasPlaces || loc !== 'granted') return
    let live = true
    const poll = (): void => void window.api['wifi:location']().then((f) => live && f && setFix(f), () => undefined)
    poll()
    const iv = setInterval(poll, 60000)
    return () => {
      live = false
      clearInterval(iv)
    }
  }, [hasPlaces, loc])

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
    if (settings.workPlaces.some((p) => norm(p.name) === norm(n))) {
      toast.error(`${n} is already a work place`, { id: 'wifi', description: 'Give the network a different name.' })
      return
    }
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
  const addPlace = async (): Promise<void> => {
    const n = placeDraft.trim()
    if (!n) return
    if (nameTaken(n, settings)) {
      toast.error(`${n} is already in use`, { id: 'place', description: 'Work networks and places each need their own name.' })
      return
    }
    let status = loc
    if (status !== 'granted') status = await askLocation()
    if (status !== 'granted') return
    setLocating(true)
    const f = await window.api['wifi:location']().catch(() => null)
    setLocating(false)
    if (!f) {
      toast.warning("Couldn't find your location", { id: 'place', description: 'Make sure Wi-Fi is on; macOS locates a Mac from nearby networks. Then try again.' })
      return
    }
    if (f.accuracy > MAX_FIX_ACCURACY_M) {
      toast.warning('Your location is too vague right now', { id: 'place', description: `macOS only knows it within ${radiusLabel(Math.round(f.accuracy))}. Try again with Wi-Fi on.` })
      return
    }
    setFix(f)
    // Start with a radius that comfortably covers how precisely macOS knows where you are.
    const radius = PLACE_RADII.find((r) => r >= f.accuracy * 2) ?? PLACE_RADII[PLACE_RADII.length - 1]
    patch({ workPlaces: [...settings.workPlaces, { name: n, lat: f.lat, lon: f.lon, radius }] })
    setPlaceDraft('')
    toast.success(`${n} added`, { id: 'place', description: `Tracking runs within ${radiusLabel(radius)} of where you are now.` })
  }
  const removePlace = (name: string): void => {
    const ssidProjects = { ...settings.ssidProjects }
    delete ssidProjects[name]
    const before = { workPlaces: settings.workPlaces, ssidProjects: settings.ssidProjects }
    patch({ workPlaces: settings.workPlaces.filter((p) => p.name !== name), ssidProjects })
    toast.success(`${name} removed`, { id: 'place', actions: [{ label: 'Undo', onClick: () => patch(before) }] })
  }
  const setPlaceProject = (name: string, id: number | null): void => {
    const next = { ...settings.ssidProjects }
    if (id === null) delete next[name]
    else next[name] = id
    patch({ ssidProjects: next })
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
    else
      toast.info('macOS did not show the prompt', {
        id: 'wifi-location',
        description: 'Switch TTT on in System Settings → Privacy & Security → Location Services instead.',
        actions: [{ label: 'Open System Settings', onClick: () => void window.api['wifi:openLocationSettings']() }]
      })
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

      <Section
        title="Breaks"
        description="The German Working Hours Act (ArbZG) asks for 30 minutes of breaks after 6 hours of work and 45 after 9, in pieces of at least 15 minutes, and allows at most 10 hours a day."
      >
        <div className="px-4 py-3.5">
          <Toggle
            checked={settings.breakRules}
            onChange={(v) => patch({ breakRules: v })}
            label="Watch the break rules"
            description="Reminds you when a break is due, plans it into the finish time on Today, and flags days that miss it in History and on timesheets."
          />
        </div>
        <div className="px-4 py-3.5">
          <Toggle
            checked={settings.deductBreaks}
            onChange={(v) => patch({ deductBreaks: v })}
            label="Deduct missed breaks"
            description="Takes a missed break off the counted time, as most payroll systems do. 6 h 20 min without a break counts as 6 h."
          />
        </div>
      </Section>

      <Section title="Time entry" description="How times are picked when you add or edit a session, or set when you clock out.">
        <Row title="Interval" description={settings.timeStep === 1 ? 'Any minute can be entered.' : `Times snap to ${settings.timeStep}-minute steps, like 08:00, 08:${String(settings.timeStep).padStart(2, '0')} and so on.`}>
          <Segmented
            size="sm"
            label="Time interval"
            value={String(settings.timeStep)}
            onChange={(v) => patch({ timeStep: Number(v) })}
            options={TIME_STEPS.map((n) => ({ value: String(n), label: n === 1 ? 'Any' : `${n} min` }))}
          />
        </Row>
      </Section>
    </>
  )

  const away = (
    <Section title="Away from your Mac" description="Catches time that should not count: a lunch with the timer running, a lid closed for the night, a session you forgot to stop.">
      <Row
        title="Ask about time away"
        description={
          settings.idleMinutes
            ? `After ${settings.idleMinutes} minutes without using your Mac, or a sleep that long, TTT asks when you are back whether it was work.`
            : 'Time away always counts as work.'
        }
      >
        <Segmented
          size="sm"
          label="Ask about time away after"
          value={String(settings.idleMinutes)}
          onChange={(v) => patch({ idleMinutes: Number(v) })}
          options={[0, 10, 15, 30, 60].map((n) => ({ value: String(n), label: n === 0 ? 'Never' : `${n} min` }))}
        />
      </Row>
      <Row
        title="Forgotten sessions"
        description={
          settings.maxSessionHours
            ? `A session running ${settings.maxSessionHours} hours is ended when you were last at your Mac. If you are still there, TTT asks instead.`
            : 'Sessions run until you stop them.'
        }
      >
        <Segmented
          size="sm"
          label="Treat sessions as forgotten after"
          value={String(settings.maxSessionHours)}
          onChange={(v) => patch({ maxSessionHours: Number(v) })}
          options={[0, 10, 12, 14].map((n) => ({ value: String(n), label: n === 0 ? 'Never' : `${n} h` }))}
        />
      </Row>
    </Section>
  )

  const setShortcut = (accel: string): void => {
    const before = settings.globalShortcut
    setSettings((s) => ({ ...s, globalShortcut: accel }))
    window.api['settings:set']({ globalShortcut: accel }).then(flash, (e) => {
      setSettings((s) => ({ ...s, globalShortcut: before }))
      toast.error("Couldn't use that shortcut", { id: 'settings-saved', description: errorText(e) })
    })
  }

  const auto = (
    <Section title="Automatic tracking" description="Start and stop the timer by the Wi-Fi network you are on or the place you are at. You can always start and pause by hand.">
      <div className="px-4 py-3.5">
        <Toggle
          checked={settings.autoTrack}
          onChange={(v) => {
            patch({ autoTrack: v })
            // Asking here, when the feature is switched on, is the moment the permission makes sense.
            if (v && loc === 'notDetermined') void askLocation()
          }}
          label="Track automatically"
          description="Runs while you are on a work network or at a work place."
        />
      </div>
      {needsLocation(loc) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">Location access {loc === 'notDetermined' ? 'needed' : 'is off'}</div>
            <p className="mt-0.5 text-xs text-muted">
              macOS only reveals Wi-Fi names and where you are to apps with Location access. Without it TTT recognizes a network by its router
              instead, which works but cannot show the name, and work places cannot work.
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
      <div className="px-4 py-3.5">
        <div className="mb-0.5 text-[13px] font-medium">Work places</div>
        <p className="mb-2.5 text-xs text-muted">
          For when the Wi-Fi alone does not say where you are, like a client site or a shared office. A work network takes precedence.
        </p>
        {hasPlaces && (
          <ul className="mb-3 flex flex-col divide-y divide-line rounded-md border border-line">
            {settings.workPlaces.map((p) => {
              const d = fix ? distanceM(p, fix) : null
              const here = d !== null && d <= p.radius
              return (
                <li key={p.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5 pl-3 pr-1.5 text-[13px]">
                  <MapPin size={14} className={cx('shrink-0', here ? 'text-over' : 'text-accent')} />
                  <span className="flex min-w-24 flex-1 items-center gap-2">
                    <span className="truncate">{p.name}</span>
                    {here ? <Badge tone="over">Here</Badge> : d !== null && <span className="shrink-0 text-[11px] text-faint">{awayLabel(d)}</span>}
                  </span>
                  <RadiusSelect
                    ariaLabel={`Radius around ${p.name}`}
                    value={p.radius}
                    onChange={(r) => patch({ workPlaces: settings.workPlaces.map((x) => (x.name === p.name ? { ...x, radius: r } : x)) })}
                  />
                  <span className="text-xs text-faint">tracks to</span>
                  <ProjectSelect
                    className="w-44"
                    ariaLabel={`Project for sessions at ${p.name}`}
                    projects={projects}
                    noneLabel="Default project"
                    value={settings.ssidProjects[p.name] ?? null}
                    onChange={(id) => setPlaceProject(p.name, id)}
                  />
                  <IconButton size="sm" label={`Remove ${p.name}`} onClick={() => removePlace(p.name)}>
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
            void addPlace()
          }}
        >
          <div className="w-56">
            <Input aria-label="Place name" placeholder="Name this place, e.g. Client office" value={placeDraft} onChange={(e) => setPlaceDraft(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" size="sm" disabled={!placeDraft.trim() || locating || asking}>
            {locating ? 'Locating…' : 'Add where I am now'}
          </Button>
        </form>
      </div>
      <Row title="Grace period" description="Wait this long after leaving the network or place before stopping.">
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
      <Section title="Notifications" description="macOS notifications TTT sends. You can also turn them off for TTT in System Settings → Notifications.">
        {NOTIFY.map((n) => (
          <div key={n.key} className="px-4 py-3">
            <Toggle
              checked={settings.notifications[n.key]}
              onChange={(v) => patch({ notifications: { ...settings.notifications, [n.key]: v } })}
              label={n.label}
              description={n.description}
            />
          </div>
        ))}
      </Section>
      <Section title="Keyboard shortcuts">
        <Row title="Start or pause from anywhere" description="Works in every app, even with the TTT window closed. A notification confirms each press.">
          <Segmented size="sm" label="Global shortcut" value={settings.globalShortcut} onChange={setShortcut} options={GLOBAL_SHORTCUTS} />
        </Row>
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
            <span className="text-muted">{what}</span>
            <span className="flex items-center gap-1">{keys}</span>
          </div>
        ))}
      </Section>
      <Section title="Links" description="Open these from Shortcuts, a Focus mode, Raycast or Alfred to control TTT.">
        {LINKS.map(([url, what]) => (
          <div key={url} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
            <span className="text-muted">{what}</span>
            <code className="tnum select-all rounded bg-sunken px-1.5 py-0.5 text-xs">{url}</code>
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
          {pane === 'auto' && (
            <>
              {auto}
              {away}
            </>
          )}
          {pane === 'general' && general}
          {pane === 'data' && <DataPane settings={settings} patch={patch} />}
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

const LINKS: [string, string][] = [
  ['ttt://start', 'Start on your usual project'],
  ['ttt://start?project=Name', 'Start on a project, or switch to it'],
  ['ttt://pause', 'Pause'],
  ['ttt://toggle', 'Start or pause'],
  ['ttt://open?page=history', 'Open a page (today, history, stats, settings)']
]
