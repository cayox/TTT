import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, PencilSimple, Play, Plus, Trash } from '@phosphor-icons/react'
import { Badge, BarChart, Button, Card, IconButton, Page, ProgressBar, ProgressRing, ProjectDot, ProjectSelect, Stat, cx, projectColor } from '../components/ui'
import { isTyping, useTracker } from '../lib/tracker'
import { SessionEditor } from '../components/SessionEditor'
import { errorText, useToast } from '../lib/toast'
import { useSessionActions } from '../lib/sessions'
import type { DayOverride, Schedule, Session, Settings } from '../../../shared/types'
import {
  addDays,
  dateKey,
  expectedMinutesForDay,
  rangeStats,
  splitSessionsByDay,
  startOfDay,
  weekdayIndex,
  projectTotals,
  type DayStat
} from '../../../shared/time'
import { formatClock, formatDelta, formatDuration, formatDurationLong } from '../../../shared/format'
import { flexNow, type MonthHours } from '../../../shared/hours'
import type { Project } from '../../../shared/types'

interface Data {
  current: Session | null
  sessions: Session[] // last 7 days
  schedule: Schedule
  overrides: DayOverride[]
  settings: Settings
  balance: number
  month: MonthHours
  fetchedAt: number
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

async function load(): Promise<Data> {
  const now = Date.now()
  const today = dateKey(now)
  const from = addDays(today, -6)
  const [current, sessions, schedule, overrides, settings, balance, month] = await Promise.all([
    window.api['sessions:current'](),
    window.api['sessions:list'](startOfDay(from), startOfDay(addDays(today, 1))),
    window.api['schedule:get'](),
    window.api['overrides:list'](from, today),
    window.api['settings:get'](),
    window.api['stats:balance'](),
    window.api['stats:month']()
  ])
  return { current, sessions, schedule, overrides, settings, balance, month, fetchedAt: now }
}

export function TodayPage() {
  const tracker = useTracker()
  const [data, setData] = useState<Data | null>(null)
  const toast = useToast()
  const now = tracker.now

  const refresh = useCallback(async () => {
    try {
      setData(await load())
      toast.dismiss('today-load')
    } catch (e) {
      toast.error("Couldn't load today's data", {
        id: 'today-load',
        description: errorText(e),
        duration: null,
        actions: [{ label: 'Try again', onClick: () => void refreshRef.current() }]
      })
    }
  }, [toast])
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    void refresh()
    const iv = setInterval(() => void refresh(), 30000)
    const onFocus = (): void => void refresh()
    const off = window.events.onSessionsChanged(onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(iv)
      off()
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  // Space toggles tracking on this page (buttons handle Space themselves).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if ((e.target as HTMLElement | null)?.closest('button, [role="switch"], [tabindex]')) return
      e.preventDefault()
      void tracker.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tracker])

  // The tracker is the live source of truth for the running session.
  const current = tracker.current
  const view = useMemo(() => {
    if (!data) return null
    const today = dateKey(now)
    const todayStart = startOfDay(today)
    const base = data.sessions.filter((s) => s.endTs !== null || s.id === current?.id)
    const sessions = current && !base.some((s) => s.id === current.id) ? [...base, current] : base
    const segs = splitSessionsByDay(sessions, now).filter((s) => s.date === today)
    const workedMs = segs.reduce((a, s) => a + (s.endTs - s.startTs), 0)
    const workedMin = workedMs / 60000
    const ov = data.overrides.find((o) => o.date === today)
    const { expectedMin, credited } = expectedMinutesForDay(today, data.schedule, ov, data.settings)
    const effective = credited ? Math.max(workedMin, expectedMin) : workedMin
    const remaining = expectedMin - effective
    const week = rangeStats('7d', sessions, data.schedule, data.overrides, data.settings, now, null).days
    const wIdx = (weekdayIndex(today) - data.settings.weekStart + 7) % 7
    const weekDays: DayStat[] = week.slice(week.length - 1 - wIdx)
    const list = sessions
      .filter((s) => (s.endTs ?? now) > todayStart && s.startTs < todayStart + 864e5)
      .sort((a, b) => a.startTs - b.startTs)
    const byProject = projectTotals(list, todayStart, todayStart + 864e5, now)
    return { workedMs, workedMin, expectedMin, remaining, weekDays, list, ov, byProject }
  }, [data, now, current])

  if (!data || !view) return <Skeleton />

  const running = !!current
  const { workedMs, expectedMin, remaining, weekDays, list, ov, byProject } = view
  const { projects, projectById, nextProjectId, chooseProject } = tracker
  const byProjectTotal = byProject.reduce((a, b) => a + b.minutes, 0)
  const over = remaining <= 0 && expectedMin > 0
  const noTarget = expectedMin === 0
  const secs = Math.floor(workedMs / 1000)
  const clock = `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  const progress = expectedMin > 0 ? view.workedMin / expectedMin : 0
  const finish = running && remaining > 0 ? formatClock(now + remaining * 60000) : null
  const balance = data.balance
  const dayLabel = new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  let status: string
  if (noTarget) status = ov ? `Day off: ${ov.kind}` : 'No work expected today'
  else if (over) status = remaining === 0 ? 'Target reached' : `${formatDurationLong(-remaining)} overtime`
  else status = `${formatDurationLong(remaining)} to go`

  const detail = current
    ? `Tracking since ${formatClock(current.startTs)}${current.source === 'wifi' ? ' (started by Wi-Fi)' : ''}.`
    : list.length
      ? 'Paused. Start again when you are back.'
      : 'Nothing tracked yet today.'

  return (
    <Page title="Today" subtitle={dayLabel} width="lg">
      <section className="grid items-center gap-10 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-5">
          <ProgressRing value={progress} size={248} thickness={12} tone={over ? 'over' : 'accent'} live={running} label="Progress toward today's expected time">
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-display text-[46px] font-semibold leading-none tracking-tight">{clock}</span>
              <span className="tnum text-xs text-muted">{expectedMin > 0 ? `of ${formatDuration(expectedMin)} expected` : 'worked today'}</span>
            </div>
          </ProgressRing>
          <div className="flex items-center gap-2">
            <Button
              variant={running ? 'secondary' : 'primary'}
              size="lg"
              className="min-w-32"
              disabled={tracker.busy}
              onClick={() => void tracker.toggle()}
              icon={running ? <Pause weight="fill" size={15} /> : <Play weight="fill" size={15} />}
            >
              {running ? 'Pause' : 'Start'}
            </Button>
            <ProjectSelect
              className="w-44 [&>div]:h-11 [&>div]:rounded-lg"
              ariaLabel={running ? 'Project for the running session' : 'Project to start on'}
              projects={projects}
              value={current ? current.projectId : nextProjectId}
              onChange={(id) => id !== null && void chooseProject(id)}
            />
          </div>
          <p className="text-[11px] text-faint">
            <kbd>Space</kbd> or <kbd>⌘↩</kbd> to {running ? 'pause' : 'start'}
          </p>
        </div>

        <div className="flex max-w-md flex-col gap-6">
          <div>
            <p className={cx('font-display text-[32px] font-semibold leading-tight tracking-tight text-balance', over && 'text-over')}>{status}</p>
            <p className="mt-2 text-sm text-muted">{detail}</p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-4 border-t border-line pt-5">
            {finish && <Stat size="sm" label="Finish around" value={finish} />}
            <Stat
              size="sm"
              label="Overtime balance"
              value={formatDelta(balance)}
              valueTone={balance > 0 ? 'over' : balance < 0 ? 'under' : 'neutral'}
              hint={
                data.settings.startingBalance
                  ? `Includes ${formatDelta(data.settings.startingBalance)} carried over`
                  : balance > 0 ? 'Ahead in total' : balance < 0 ? 'Behind in total' : 'Even'
              }
            />
            <Stat size="sm" label="Sessions" value={list.length} />
          </div>
          {data.month.contractMin > 0 && (
            <MonthBlock hours={data.month} liveMin={current ? (now - data.fetchedAt) / 60000 : 0} liveProjectId={current?.projectId ?? null} projectById={projectById} />
          )}
          {byProjectTotal > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="text-xs font-medium text-muted">By project</div>
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Today's time split by project">
                {byProject.map((b) => (
                  <span key={b.projectId ?? 'none'} className="h-full transition-[flex-grow] duration-500 ease-out-expo" style={{ flexGrow: b.minutes, background: projectColor(projectById(b.projectId)?.color) }} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {byProject.map((b) => (
                  <li key={b.projectId ?? 'none'} className="flex items-center gap-1.5">
                    <ProjectDot color={projectById(b.projectId)?.color} />
                    <span className="text-muted">{projectById(b.projectId)?.name ?? 'No project'}</span>
                    <span className="tnum font-medium">{formatDuration(b.minutes)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <TodaySessions list={list} now={now} today={dateKey(now)} onChanged={refresh} />
        <Card title="This week" action={<span className="text-[11px] text-faint">Line marks the target</span>}>
          <BarChart
            title="Worked hours this week"
            data={weekDays.map((d) => ({ label: WEEKDAYS[weekdayIndex(d.date)], value: d.workedMin / 60, target: d.expectedMin / 60 }))}
            format={(v) => `${Math.round(v * 10) / 10}h`}
            height={180}
            labelEvery={1}
            highlight={weekDays.length - 1}
          />
        </Card>
      </div>
    </Page>
  )
}

/**
 * This month's contract hours with flextime: how far along, what is left per workday, and whether
 * you are ahead of or behind the pace. liveMin adds the running session's time since the last fetch.
 */
function MonthBlock({ hours, liveMin, liveProjectId, projectById }: { hours: MonthHours; liveMin: number; liveProjectId: number | null; projectById: (id: number | null | undefined) => Project | undefined }) {
  const counted = hours.countedMin + liveMin
  const remaining = Math.max(0, hours.contractMin - counted)
  const done = counted >= hours.contractMin
  const perDay = hours.workdaysLeft ? remaining / hours.workdaysLeft : remaining
  const flex = Math.round(flexNow(hours, hours.todayCountedMin + liveMin))
  const month = new Date().toLocaleDateString('en-GB', { month: 'long' })
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-muted">{month} hours</span>
        <span className="tnum text-xs">
          <span className="font-medium">{formatDuration(counted)}</span>
          <span className="text-faint"> of {formatDuration(hours.contractMin)}</span>
        </span>
      </div>
      <ProgressBar value={counted / hours.contractMin} tone={done ? 'over' : 'accent'} label={`${month} hours`} />
      <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {done ? (
          <span className="text-over">Done{counted > hours.contractMin ? `, ${formatDuration(counted - hours.contractMin)} extra` : ''}</span>
        ) : (
          <>
            <span>{formatDuration(remaining)} left</span>
            {hours.workdaysLeft > 0 ? (
              <span>
                {formatDuration(perDay)} per workday <span className="text-faint">({hours.workdaysLeft} left)</span>
              </span>
            ) : (
              <span className="text-faint">no workdays left</span>
            )}
          </>
        )}
        <span className="flex-1" />
        <span title="Flextime this month: ahead (+) or behind (−) the share of your monthly hours due so far" className="flex items-center gap-1.5">
          Flextime
          <Badge tone={flex > 0 ? 'over' : flex < 0 ? 'under' : 'neutral'}>{formatDelta(flex)}</Badge>
        </span>
      </div>
      {hours.projects.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {hours.projects.map((p) => {
            const c = p.countedMin + (p.projectId === liveProjectId ? liveMin : 0)
            const project = projectById(p.projectId)
            return (
              <li key={p.projectId} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ProjectDot color={project?.color} />
                  <span className="truncate text-muted">{project?.name ?? 'Project'}</span>
                </span>
                <span className="h-1 overflow-hidden rounded-full bg-sunken">
                  <span className="block h-full rounded-full transition-[width] duration-500 ease-out-expo" style={{ width: `${Math.min(100, (c / p.contractMin) * 100)}%`, background: projectColor(project?.color) }} />
                </span>
                <span className="tnum">
                  <span className="font-medium">{formatDuration(c)}</span>
                  <span className="text-faint"> of {formatDuration(p.contractMin)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Today's sessions with quick edit (dates, times, project) and delete. */
function TodaySessions({ list, now, today, onChanged }: { list: Session[]; now: number; today: string; onChanged: () => Promise<void> }) {
  const { projects } = useTracker()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const act = useSessionActions(onChanged)
  return (
    <Card
      title="Today's sessions"
      className={cx(editing !== null && 'md:col-span-2')}
      action={
        editing === null && (
          <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setEditing('new')}>
            Add
          </Button>
        )
      }
    >
      {editing === 'new' && (
        <div className="mb-3">
          <SessionEditor
            compact
            date={today}
            onCancel={() => setEditing(null)}
            onSave={async (d) => {
              if (await act.add({ ...d, source: 'manual' })) setEditing(null)
            }}
          />
        </div>
      )}
      {list.length === 0 ? (
        editing !== 'new' && (
          <div className="grid place-items-center gap-1 py-8 text-center">
            <p className="text-sm font-medium">No sessions yet</p>
            <p className="text-xs text-muted">Press Start or Space to begin, or add one you forgot.</p>
          </div>
        )
      ) : (
        <ul className="divide-y divide-line">
          {list.map((s) =>
            editing === s.id ? (
              <li key={s.id} className="py-2">
                <SessionEditor
                  compact
                  date={today}
                  initial={s}
                  onCancel={() => setEditing(null)}
                  onSave={async (d) => {
                    if (await act.update(s.id, d)) setEditing(null)
                  }}
                />
              </li>
            ) : (
              <li key={s.id} className="group flex items-center gap-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => setEditing(s.id)}
                  title="Edit times"
                  className="no-drag tnum -mx-1 w-[7rem] shrink-0 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-sunken"
                >
                  {dateKey(s.startTs) !== today && <span className="text-faint">{formatShortDay(s.startTs)} </span>}
                  {formatClock(s.startTs)}–{s.endTs ? formatClock(s.endTs) : 'now'}
                </button>
                <ProjectSelect
                  variant="inline"
                  className="min-w-0 flex-1"
                  ariaLabel={`Project for the session starting ${formatClock(s.startTs)}`}
                  projects={projects}
                  value={s.projectId}
                  onChange={(id) => void act.update(s.id, { projectId: id }, true)}
                />
                {!s.endTs ? <Badge tone="over">Running</Badge> : s.source === 'wifi' ? <Badge>Wi-Fi</Badge> : null}
                <span className="tnum w-12 shrink-0 text-right text-muted">{formatDuration(((s.endTs ?? now) - s.startTs) / 60000)}</span>
                <span className="flex opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                  <IconButton size="sm" label="Edit session" onClick={() => setEditing(s.id)}><PencilSimple size={14} /></IconButton>
                  <IconButton size="sm" label="Delete session" onClick={() => void act.remove(s)}><Trash size={14} /></IconButton>
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </Card>
  )
}

const formatShortDay = (ts: number): string => new Date(ts).toLocaleDateString(undefined, { weekday: 'short' })

function Skeleton() {
  return (
    <div className="mx-auto flex max-w-4xl animate-pulse flex-col gap-6 px-8 pb-12 pt-8" aria-busy="true">
      <div className="h-9 w-40 rounded-md bg-sunken" />
      <div className="flex items-center gap-10">
        <div className="size-[248px] rounded-full border-[12px] border-sunken" />
        <div className="flex flex-col gap-4">
          <div className="h-7 w-56 rounded-md bg-sunken" />
          <div className="h-11 w-32 rounded-lg bg-sunken" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-48 rounded-xl bg-sunken" />
        <div className="h-48 rounded-xl bg-sunken" />
      </div>
    </div>
  )
}
