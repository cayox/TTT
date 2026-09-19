import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarBlank, ChartBar, ClockCountdown, GearSix, Pause, Play, WifiHigh, WifiSlash } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cx } from './cx'
import { ProjectSelect } from './Project'
import { Wordmark } from './Brand'
import { isTyping, useTracker } from '../../lib/tracker'

export type NavId = 'today' | 'history' | 'stats' | 'settings'

export const NAV_ITEMS: { id: NavId; label: string; icon: Icon }[] = [
  { id: 'today', label: 'Today', icon: ClockCountdown },
  { id: 'history', label: 'History', icon: CalendarBlank },
  { id: 'stats', label: 'Stats', icon: ChartBar },
  { id: 'settings', label: 'Settings', icon: GearSix }
]

const pad = (n: number): string => String(n).padStart(2, '0')
function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** Centered tab bar in the titlebar. Equal-width tabs so the indicator only translates. */
function TabBar({ active, onNavigate }: { active: NavId; onNavigate: (id: NavId) => void }) {
  const idx = NAV_ITEMS.findIndex((n) => n.id === active)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [x, setX] = useState(0)
  useLayoutEffect(() => {
    setX(refs.current[idx]?.offsetLeft ?? 0)
  }, [idx])
  return (
    <nav aria-label="Main" className="no-drag relative flex rounded-lg border border-line bg-sunken p-[3px]">
      <span
        aria-hidden
        className="absolute bottom-[3px] top-[3px] w-[96px] rounded-md bg-raised-solid shadow-card transition-transform duration-300 ease-out-expo"
        style={{ transform: `translateX(${x - 3}px)`, left: 3 }}
      />
      {NAV_ITEMS.map(({ id, label, icon: I }, i) => {
        const on = id === active
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            aria-current={on ? 'page' : undefined}
            title={`${label}  ⌘${i + 1}`}
            onClick={() => onNavigate(id)}
            className={cx(
              'relative flex h-7 w-[96px] items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium transition-colors duration-150',
              on ? 'text-fg' : 'text-muted hover:text-fg'
            )}
          >
            <I size={15} weight={on ? 'fill' : 'regular'} className={on ? 'text-accent' : undefined} />
            {label}
          </button>
        )
      })}
    </nav>
  )
}

/** Live session status and project, always visible so tracking can be paused or moved from any page. */
function StatusPill() {
  const { current, settings, projects, nextProjectId, chooseProject, now, busy, toggle } = useTracker()
  const auto = !!settings?.autoTrack && settings.workSsids.length > 0
  const autoTitle = !settings?.autoTrack
    ? 'Automatic tracking is off'
    : settings.workSsids.length
      ? `Automatic tracking on ${settings.workSsids.join(', ')}`
      : 'Automatic tracking is on, but no work network is set'
  const WifiIcon = auto ? WifiHigh : WifiSlash
  const project = (
    <ProjectSelect
      variant="inline"
      className="max-w-[150px]"
      ariaLabel={current ? 'Project for the running session' : 'Project to start on'}
      projects={projects}
      value={current ? current.projectId : nextProjectId}
      onChange={(id) => id !== null && void chooseProject(id)}
    />
  )
  return (
    <div className="no-drag flex items-center gap-2 justify-self-end">
      <span title={autoTitle} aria-label={autoTitle} className={cx('grid size-7 place-items-center rounded-md', auto ? 'text-accent' : 'text-faint')}>
        <WifiIcon size={15} />
      </span>
      <div className="flex h-8 items-center gap-1 rounded-full border border-line bg-raised pl-1.5 pr-1 shadow-card">
        {current && (
          <>
            <span className="relative ml-1.5 flex size-2">
              <span className="absolute inset-0 rounded-full bg-over" style={{ animation: 'ttt-breathe 2.4s ease-in-out infinite' }} />
              <span className="relative m-auto size-1.5 rounded-full bg-over" />
            </span>
            <span className="tnum ml-1 text-[12.5px] font-medium" aria-label="Current session length">
              {elapsed(now - current.startTs)}
            </span>
            {current.source === 'wifi' && <span className="text-[11px] text-faint">Wi-Fi</span>}
            <span aria-hidden className="mx-1 h-4 w-px bg-line-strong" />
          </>
        )}
        {project}
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          title={current ? 'Pause  ⌘↩' : 'Start tracking  ⌘↩'}
          aria-label={current ? 'Pause tracking' : 'Start tracking'}
          className={cx(
            'grid size-6 place-items-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-90 disabled:opacity-45',
            current ? 'text-muted hover:bg-sunken hover:text-fg' : 'bg-accent text-accent-fg hover:bg-accent-hover'
          )}
        >
          {current ? <Pause size={12} weight="fill" /> : <Play size={11} weight="fill" className="translate-x-px" />}
        </button>
      </div>
    </div>
  )
}

export interface AppShellProps {
  active: NavId
  onNavigate: (id: NavId) => void
  children: ReactNode
}

/** Top bar (traffic lights, tabs, status) over a single scrolling content pane. */
export function AppShell({ active, onNavigate, children }: AppShellProps) {
  const { toggle } = useTracker()
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= NAV_ITEMS.length) {
        e.preventDefault()
        onNavigate(NAV_ITEMS[n - 1].id)
      } else if (e.key === 'Enter' && !isTyping(e)) {
        e.preventDefault()
        void toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNavigate, toggle])

  // Braces matter: Chromium's scrollTo returns a Promise, which React would treat as a cleanup.
  useEffect(() => {
    main.current?.scrollTo({ top: 0 })
  }, [active])

  return (
    <div className="flex h-full w-full flex-col">
      <header
        className="drag relative grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line pl-[84px] pr-4"
        style={{ zIndex: 'var(--z-nav)' }}
      >
        <Wordmark tagline className="justify-self-start whitespace-nowrap" />
        <TabBar active={active} onNavigate={onNavigate} />
        <StatusPill />
      </header>
      <main ref={main} className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

/** Shared page frame: one max width, one padding, one title style. */
export function Page({ title, subtitle, actions, width = 'md', children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; width?: 'md' | 'lg'; children: ReactNode }) {
  return (
    <div className={cx('mx-auto flex w-full flex-col gap-6 px-8 pb-12 pt-8', width === 'lg' ? 'max-w-4xl' : 'max-w-3xl')}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle && <div className="tnum mt-1 text-[13px] text-muted">{subtitle}</div>}
        </div>
        {actions}
      </header>
      <div className="rise flex flex-col gap-6">{children}</div>
    </div>
  )
}
