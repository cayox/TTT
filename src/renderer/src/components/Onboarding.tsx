import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, ChartLineUp, Play, Plus, Timer, WifiHigh, WifiSlash, X } from '@phosphor-icons/react'
import { BrandMark, Button, ColorPicker, Input, ProjectDot, Toggle, Wordmark, cx } from './ui'
import { WeekEditor } from './WeekEditor'
import { SETTINGS_CHANGED, isTyping, useTracker } from '../lib/tracker'
import { errorText, useToast } from '../lib/toast'
import { PROJECT_COLORS } from '../../../shared/types'
import type { CurrentNetwork, LocationStatus, ProjectColor, Schedule, Settings } from '../../../shared/types'
import { formatDurationLong } from '../../../shared/format'

/** Window event that reopens the welcome flow (Settings > General). */
export const OPEN_ONBOARDING = 'ttt-onboarding'

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'schedule', label: 'Work week' },
  { id: 'projects', label: 'Projects' },
  { id: 'auto', label: 'Automatic tracking' },
  { id: 'ready', label: 'Ready' }
] as const

interface DraftProject {
  id?: number
  name: string
  color: ProjectColor
}

function StepHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-7">
      <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-tight">{title}</h1>
      {children && <p className="mt-2 max-w-[54ch] text-[13.5px] leading-relaxed text-muted">{children}</p>}
    </header>
  )
}

function ScheduleStep({ schedule, setSchedule, weekStart, setWeekStart }: { schedule: Schedule; setSchedule: (s: Schedule) => void; weekStart: 0 | 6; setWeekStart: (w: 0 | 6) => void }) {
  return (
    <>
      <StepHeader title="What does your work week look like?">
        TTT compares what you work with what you are expected to work, and keeps the difference as your overtime balance. Drag the bars or pick a preset.
      </StepHeader>
      <WeekEditor schedule={schedule} onChange={setSchedule} weekStart={weekStart} onWeekStart={setWeekStart} />
    </>
  )
}

function ProjectsStep({ drafts, setDrafts }: { drafts: DraftProject[]; setDrafts: (d: DraftProject[]) => void }) {
  const firstInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    firstInput.current?.focus()
    firstInput.current?.select()
  }, [])
  const edit = (i: number, p: Partial<DraftProject>): void => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...p } : d)))
  const add = (): void => {
    const used = new Set(drafts.map((d) => d.color))
    setDrafts([...drafts, { name: '', color: PROJECT_COLORS.find((c) => !used.has(c)) ?? 'slate' }])
  }
  return (
    <>
      <StepHeader title="What are you working on?">
        Every session belongs to a project, so you can see where your time went. One is enough to start; the first one is your default.
      </StepHeader>
      <ul className="flex flex-col gap-2.5">
        {drafts.map((d, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-raised p-2.5 pl-3.5 shadow-card">
            <ProjectDot color={d.color} className="size-2.5" />
            <div className="w-64">
              <Input
                ref={i === 0 ? firstInput : undefined}
                aria-label={`Project ${i + 1} name`}
                placeholder={i === 0 ? 'e.g. Client work' : 'Project name'}
                value={d.name}
                maxLength={40}
                onChange={(e) => edit(i, { name: e.target.value })}
              />
            </div>
            <ColorPicker label={`Color for ${d.name || `project ${i + 1}`}`} colors={PROJECT_COLORS} value={d.color} onChange={(c) => edit(i, { color: c })} />
            <span className="flex-1" />
            {i === 0 ? (
              <span className="pr-2 text-[11px] text-faint">Default</span>
            ) : (
              !d.id && (
                <button type="button" aria-label={`Remove ${d.name || 'project'}`} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} className="no-drag grid size-7 place-items-center rounded-md text-faint hover:bg-sunken hover:text-fg">
                  <X size={13} />
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      {drafts.length < 6 && (
        <Button variant="ghost" size="sm" className="mt-3 self-start" icon={<Plus size={13} />} onClick={add}>
          Add another project
        </Button>
      )}
    </>
  )
}

function AutoStep({ settings, patch }: { settings: Settings; patch: (p: Partial<Settings>) => void }) {
  const [net, setNet] = useState<CurrentNetwork | null | 'loading'>('loading')
  const [name, setName] = useState('')
  // macOS hides Wi-Fi names from apps without Location access.
  const [loc, setLoc] = useState<LocationStatus | null>(null)
  const [asking, setAsking] = useState(false)
  const load = useCallback((live = { current: true }) => {
    window.api['wifi:current']().then(
      (n) => {
        if (!live.current) return
        setNet(n)
        if (n.ssid) setName(n.ssid)
      },
      () => live.current && setNet(null)
    )
  }, [])
  useEffect(() => {
    const live = { current: true }
    load(live)
    window.api['wifi:locationStatus']().then((s) => live.current && setLoc(s), () => undefined)
    return () => {
      live.current = false
    }
  }, [load])
  const askLocation = async (): Promise<void> => {
    setAsking(true)
    const s = await window.api['wifi:requestLocation']().catch(() => null)
    setAsking(false)
    if (s) setLoc(s)
    load()
  }
  const connected = net !== 'loading' && !!net && (!!net.ssid || !!net.routerId)
  const add = (): void => {
    const n = name.trim()
    if (!n) return
    const routerId = connected ? (net as CurrentNetwork).routerId : null
    patch({
      workSsids: settings.workSsids.includes(n) ? settings.workSsids : [...settings.workSsids, n],
      ...(routerId ? { networkRouters: { ...settings.networkRouters, [n]: routerId } } : {})
    })
    setName('')
  }
  return (
    <>
      <StepHeader title="Let TTT notice when you are at work">
        Pick your office Wi-Fi and the timer starts when you join it and stops a few minutes after you leave. You can always start and pause by hand.
      </StepHeader>
      <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-raised shadow-card">
        <div className="p-4">
          <Toggle
            checked={settings.autoTrack}
            onChange={(v) => {
              patch({ autoTrack: v })
              // Switching the feature on is the moment the Location prompt makes sense.
              if (v && loc === 'notDetermined') void askLocation()
            }}
            label="Track automatically"
            description="Only on the networks you add below."
          />
        </div>
        <div className={cx('p-4 transition-opacity duration-200', !settings.autoTrack && 'pointer-events-none opacity-45')} aria-disabled={!settings.autoTrack}>
          <div className="mb-3 flex items-center gap-2.5 text-[13px]">
            {connected ? <WifiHigh size={16} className="text-accent" /> : <WifiSlash size={16} className="text-faint" />}
            {net === 'loading' ? (
              <span className="text-muted">Looking for your network…</span>
            ) : connected ? (
              net!.ssid ? (
                <span>
                  You are on <span className="font-medium">{net!.ssid}</span>
                </span>
              ) : loc === 'notDetermined' ? (
                <span className="flex flex-wrap items-center gap-2 text-muted">
                  macOS hides the network name from apps without Location access.
                  <Button type="button" size="sm" variant="secondary" onClick={() => void askLocation()} disabled={asking}>
                    {asking ? 'Waiting…' : 'Allow location access'}
                  </Button>
                </span>
              ) : (
                <span className="text-muted">You are connected, but macOS hides the network name. Give it a name and TTT will recognize it by its router.</span>
              )
            ) : (
              <span className="text-muted">No network found. Type the name of your work Wi-Fi.</span>
            )}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              add()
            }}
          >
            <div className="w-64">
              <Input aria-label="Work network name" placeholder={connected ? 'e.g. Office' : 'Network name'} value={name} onChange={(e) => setName(e.target.value)} disabled={!settings.autoTrack} />
            </div>
            <Button type="submit" size="sm" variant={settings.workSsids.length ? 'secondary' : 'primary'} disabled={!name.trim() || !settings.autoTrack}>
              {connected ? 'This is my work network' : 'Add network'}
            </Button>
          </form>
          {settings.workSsids.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {settings.workSsids.map((s) => (
                <li key={s} className="flex h-7 items-center gap-1.5 rounded-full border border-line-strong pl-2.5 pr-1 text-xs">
                  <WifiHigh size={12} className="text-accent" />
                  {s}
                  <button
                    type="button"
                    aria-label={`Remove ${s}`}
                    onClick={() => {
                      const networkRouters = { ...settings.networkRouters }
                      delete networkRouters[s]
                      patch({ workSsids: settings.workSsids.filter((x) => x !== s), networkRouters })
                    }}
                    className="no-drag grid size-5 place-items-center rounded-full text-faint hover:bg-sunken hover:text-fg"
                  >
                    <X size={10} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-4">
          <Toggle checked={settings.launchAtLogin} onChange={(v) => patch({ launchAtLogin: v })} label="Open at login" description="TTT starts quietly in the menu bar, so it is there when you arrive." />
        </div>
      </div>
    </>
  )
}

function ReadyStep({ schedule, drafts, settings }: { schedule: Schedule; drafts: DraftProject[]; settings: Settings }) {
  const total = schedule.reduce((a, b) => a + b, 0)
  const named = drafts.filter((d) => d.name.trim())
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Work week', value: total ? formatDurationLong(total) : 'No expected hours' },
    {
      label: named.length > 1 ? 'Projects' : 'Project',
      value: (
        <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
          {named.map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <ProjectDot color={d.color} />
              {d.name.trim()}
            </span>
          ))}
        </span>
      )
    },
    { label: 'Automatic tracking', value: settings.autoTrack && settings.workSsids.length ? settings.workSsids.join(', ') : 'Off' }
  ]
  return (
    <>
      <StepHeader title="You are all set">Everything here can be changed later in Settings.</StepHeader>
      <dl className="mb-6 flex flex-col divide-y divide-line rounded-xl border border-line bg-raised shadow-card">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-6 px-4 py-3 text-[13px]">
            <dt className="text-muted">{r.label}</dt>
            <dd className="min-w-0 text-right font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-4 text-[13px]">
        <BrandMark size={22} className="mt-px text-fg" />
        <p className="max-w-[52ch] text-muted">
          <span className="font-medium text-fg">Look for the ring in your menu bar.</span> It fills up as you work through the day, shows a dot while the timer runs, and starts or pauses with one click.
        </p>
        <span className="grid size-[22px] place-items-center text-accent">
          <Timer size={20} />
        </span>
        <p className="max-w-[52ch] text-muted">
          <span className="font-medium text-fg">Shortcuts.</span> <kbd>⌘↩</kbd> starts or pauses from anywhere in the app, <kbd>⌘1</kbd> to <kbd>⌘4</kbd> switch pages.
        </p>
      </div>
    </>
  )
}

function WelcomeStep() {
  const points = [
    { icon: Timer, title: 'One click to start', text: 'From the app, the menu bar, or a shortcut.' },
    { icon: ChartLineUp, title: 'A running balance', text: 'Overtime and undertime against your own schedule, day by day.' },
    { icon: WifiHigh, title: 'Hands-free at the office', text: 'Starts and stops with your work Wi-Fi, if you want it to.' }
  ]
  return (
    <>
      <Wordmark size="lg" className="mb-10" />
      <StepHeader title="Know where your working hours go">
        TTT tracks your time from the menu bar and keeps your overtime balance up to date. Setting it up takes about a minute.
      </StepHeader>
      <ul className="flex flex-col gap-4">
        {points.map(({ icon: I, title, text }) => (
          <li key={title} className="flex items-start gap-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <I size={18} weight="duotone" />
            </span>
            <span className="pt-0.5">
              <span className="block text-[13.5px] font-medium">{title}</span>
              <span className="block text-[13px] text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** First-run setup: schedule, projects, automatic tracking. Each step saves when you continue. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { projects, settings: liveSettings } = useTracker()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [busy, setBusy] = useState(false)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [settings, setSettings] = useState<Settings | null>(liveSettings)
  const [drafts, setDrafts] = useState<DraftProject[]>([])

  useEffect(() => {
    Promise.all([window.api['schedule:get'](), window.api['settings:get'](), window.api['projects:list']()]).then(
      ([sch, s, ps]) => {
        setSchedule(sch)
        setSettings(s)
        const active = ps.filter((p) => !p.archived)
        const def = active.find((p) => p.id === s.defaultProjectId) ?? active[0]
        const ordered = def ? [def, ...active.filter((p) => p !== def)] : active
        setDrafts(ordered.length ? ordered.map((p) => ({ id: p.id, name: p.name, color: p.color })) : [{ name: '', color: 'brass' }])
      },
      (e) => toast.error("Couldn't load your settings", { description: errorText(e) })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...p } : s)), [])

  const saveSettings = async (p: Partial<Settings>): Promise<void> => {
    await window.api['settings:set'](p)
    window.dispatchEvent(new Event(SETTINGS_CHANGED))
  }

  /** Persists what the current step edits. */
  const commit = async (id: (typeof STEPS)[number]['id']): Promise<void> => {
    if (!settings || !schedule) return
    if (id === 'schedule') {
      await window.api['schedule:set'](schedule)
      await saveSettings({ weekStart: settings.weekStart })
    } else if (id === 'projects') {
      const saved: DraftProject[] = []
      for (const d of drafts) {
        const name = d.name.trim()
        if (!name) continue
        if (d.id) {
          const cur = projects.find((p) => p.id === d.id)
          if (!cur || cur.name !== name || cur.color !== d.color) await window.api['projects:update'](d.id, { name, color: d.color })
          saved.push({ ...d, name })
        } else {
          const p = await window.api['projects:add']({ name, color: d.color })
          saved.push({ id: p.id, name: p.name, color: p.color })
        }
      }
      setDrafts(saved)
      if (saved[0]?.id) await saveSettings({ defaultProjectId: saved[0].id })
    } else if (id === 'auto') {
      const { autoTrack, workSsids, networkRouters, launchAtLogin } = settings
      await saveSettings({ autoTrack: autoTrack && workSsids.length > 0, workSsids, networkRouters, launchAtLogin })
    }
  }

  const go = async (to: number): Promise<void> => {
    if (busy) return
    if (to > step) {
      setBusy(true)
      try {
        await commit(STEPS[step].id)
      } catch (e) {
        toast.error("Couldn't save this step", { description: errorText(e) })
        return
      } finally {
        setBusy(false)
      }
    }
    setDir(to > step ? 1 : -1)
    setStep(to)
  }

  const finish = async (start: boolean): Promise<void> => {
    setBusy(true)
    try {
      await saveSettings({ onboarded: true })
      if (start) await window.api['sessions:start'](drafts[0]?.id ?? null)
      onDone()
    } catch (e) {
      toast.error("Couldn't finish setup", { description: errorText(e) })
      setBusy(false)
    }
  }

  const id = STEPS[step].id
  const canContinue = id !== 'projects' || drafts.some((d) => d.name.trim())
  const last = step === STEPS.length - 1

  // Enter continues, unless a field or button has focus and handles it itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || e.metaKey || isTyping(e)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'BUTTON' || t.getAttribute('role') === 'slider')) return
      e.preventDefault()
      if (last) void finish(true)
      else if (canContinue) void go(step + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const ready = !!settings && !!schedule
  return (
    <div className="flex h-full w-full flex-col">
      <div className="drag h-14 shrink-0" />
      {/* Capped height and centered, so large windows do not stretch the steps apart. */}
      <div className="mx-auto my-auto grid h-full max-h-[640px] min-h-0 w-full max-w-5xl grid-cols-[200px_1fr] gap-14 px-12 pb-10">
        <aside className="flex flex-col pt-2">
          <ol className="flex flex-col gap-1" aria-label="Setup steps">
            {STEPS.map((s, i) => {
              const done = i < step
              const on = i === step
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={i > step || busy}
                    aria-current={on ? 'step' : undefined}
                    onClick={() => void go(i)}
                    className={cx(
                      'no-drag flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors duration-150',
                      on ? 'bg-sunken font-medium text-fg' : done ? 'text-muted hover:text-fg' : 'text-faint'
                    )}
                  >
                    <span
                      className={cx(
                        'grid size-[18px] shrink-0 place-items-center rounded-full border text-[10px] font-semibold transition-colors duration-200',
                        done ? 'border-accent bg-accent text-accent-fg' : on ? 'border-accent text-accent' : 'border-line-strong'
                      )}
                    >
                      {done ? <Check size={10} weight="bold" /> : i + 1}
                    </span>
                    {s.label}
                  </button>
                </li>
              )
            })}
          </ol>
          <span className="flex-1" />
          {!last && (
            <button type="button" onClick={() => void finish(false)} disabled={busy} className="no-drag self-start rounded px-2 text-xs text-faint hover:text-fg">
              Skip setup
            </button>
          )}
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pt-2">
            {ready ? (
              <div key={id} className="flex flex-col" style={{ animation: `ttt-step-${dir > 0 ? 'next' : 'back'} 420ms var(--ease-out-expo) both` }}>
                {id === 'welcome' && <WelcomeStep />}
                {id === 'schedule' && <ScheduleStep schedule={schedule} setSchedule={setSchedule} weekStart={settings.weekStart} setWeekStart={(w) => patch({ weekStart: w })} />}
                {id === 'projects' && <ProjectsStep drafts={drafts} setDrafts={setDrafts} />}
                {id === 'auto' && <AutoStep settings={settings} patch={patch} />}
                {id === 'ready' && <ReadyStep schedule={schedule} drafts={drafts} settings={settings} />}
              </div>
            ) : (
              <div className="flex animate-pulse flex-col gap-4" aria-busy="true">
                <div className="h-9 w-2/3 rounded-md bg-sunken" />
                <div className="h-4 w-1/2 rounded bg-sunken" />
                <div className="mt-4 h-48 rounded-xl bg-sunken" />
              </div>
            )}
          </div>
          <footer className="flex items-center gap-2 border-t border-line pt-5">
            {step > 0 && (
              <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => void go(step - 1)} disabled={busy}>
                Back
              </Button>
            )}
            <span className="flex-1" />
            {last ? (
              <>
                <Button variant="secondary" size="lg" onClick={() => void finish(false)} disabled={busy}>
                  Not now
                </Button>
                <Button variant="primary" size="lg" icon={<Play size={14} weight="fill" />} onClick={() => void finish(true)} disabled={busy}>
                  Start tracking
                </Button>
              </>
            ) : (
              <Button variant="primary" size="lg" onClick={() => void go(step + 1)} disabled={busy || !ready || !canContinue}>
                {step === 0 ? 'Set up TTT' : 'Continue'}
                <ArrowRight size={14} />
              </Button>
            )}
          </footer>
        </section>
      </div>
    </div>
  )
}
