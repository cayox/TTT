import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarX, House, Pause, PencilSimple, Play, Plus, Trash } from '@phosphor-icons/react'
import { Badge, Button, IconButton, Page, ProgressRing, ProjectDot, ProjectSelect, Stat, TimeField, cx, projectColor } from '../components/ui'
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
import { nextSlot } from '../../../shared/slots'
import { unionLength } from '../../../shared/intervals'
import { breakDeduction, checkBreaks, requiredBreak } from '../../../shared/breaks'
import { breakIssueText } from '../../../shared/report'
import { openDayInHistory } from '../lib/nav'
import { resolveDefault } from '../lib/tracker'
import type { Project } from '../../../shared/types'

interface Data {
  current: Session | null
  sessions: Session[] // last 7 days
  schedule: Schedule
  overrides: DayOverride[]
  settings: Settings
  balance: number
  month: MonthHours
  /** Recent workdays with nothing tracked. */
  missing: string[]
  fetchedAt: number
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

async function load(): Promise<Data> {
  const now = Date.now()
  const today = dateKey(now)
  const from = addDays(today, -6)
  const [current, sessions, schedule, overrides, settings, balance, month, missing] = await Promise.all([
    window.api['sessions:current'](),
    window.api['sessions:list'](startOfDay(from), startOfDay(addDays(today, 1))),
    window.api['schedule:get'](),
    window.api['overrides:list'](from, today),
    window.api['settings:get'](),
    window.api['stats:balance'](),
    window.api['stats:month'](),
    window.api['stats:missing']().catch(() => [] as string[])
  ])
  return { current, sessions, schedule, overrides, settings, balance, month, missing, fetchedAt: now }
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
    const work = segs.map((x) => ({ a: x.startTs, b: x.endTs }))
    // Time covered by two overlapping sessions counts once.
    const workedMs = unionLength(work)
    const workedMin = workedMs / 60000
    const breaks = checkBreaks(work)
    const deducted = data.settings.deductBreaks ? breakDeduction(breaks.workedMin, breaks.breakMin) : 0
    const ov = data.overrides.find((o) => o.date === today)
    const { expectedMin, credited } = expectedMinutesForDay(today, data.schedule, ov, data.settings)
    const counted = workedMin - deducted
    const effective = credited ? Math.max(counted, expectedMin) : counted
    const remaining = expectedMin - effective
    // Break still to take before you can leave: what the full day will require, less what you had.
    const breakAhead = data.settings.breakRules && remaining > 0 && !credited ? Math.max(0, requiredBreak(workedMin + remaining) - breaks.breakMin) : 0
    const week = rangeStats('7d', sessions, data.schedule, data.overrides, data.settings, now, null).days
    const wIdx = (weekdayIndex(today) - data.settings.weekStart + 7) % 7
    const weekDays: DayStat[] = week.slice(week.length - 1 - wIdx)
    const list = sessions
      .filter((s) => (s.endTs ?? now) > todayStart && s.startTs < todayStart + 864e5)
      .sort((a, b) => a.startTs - b.startTs)
    const byProject = projectTotals(list, todayStart, todayStart + 864e5, now)
    return { workedMs, workedMin, expectedMin, remaining, weekDays, list, ov, byProject, breaks, deducted, breakAhead }
  }, [data, now, current])

  if (!data || !view) return <Skeleton />

  const running = !!current
  const { workedMs, expectedMin, remaining, weekDays, list, ov, byProject, breaks, deducted, breakAhead } = view
  const { projects, projectById, nextProjectId, chooseProject, suggestedProjectId } = tracker
  const usual = !current && suggestedProjectId !== null && suggestedProjectId === nextProjectId && suggestedProjectId !== resolveDefault(projects, data.settings)
  const over = remaining <= 0 && expectedMin > 0
  const noTarget = expectedMin === 0
  const secs = Math.floor(workedMs / 1000)
  const clock = `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  const progress = expectedMin > 0 ? view.workedMin / expectedMin : 0
  // With the break rules on, the finish time leaves room for the break that is still due.
  const finishAt = remaining > 0 ? now + (remaining + breakAhead) * 60000 : null
  const finish = finishAt !== null && (running || list.length > 0) ? formatClock(finishAt) : null
  const finishHint = [!running && 'if you start now', breakAhead > 0 && `incl. ${Math.round(breakAhead)} min break`].filter(Boolean).join(', ') || undefined
  const issue = data.settings.breakRules ? breakIssueText(breaks) : null
  const balance = data.balance
  const dayLabel = new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  let status: string
  if (noTarget) status = ov ? `Day off: ${ov.kind}` : 'No work expected today'
  else if (over) status = remaining === 0 ? 'Target reached' : `${formatDurationLong(-remaining)} overtime`
  else status = `${formatDurationLong(remaining)} to go`

  const detail = current
    ? `Since ${formatClock(current.startTs)}${current.source === 'wifi' ? ', started by Wi-Fi' : ''}.`
    : list.length
      ? 'Paused. Start again when you are back.'
      : 'Nothing tracked yet today.'

  // Time from the running session since the last fetch, so month numbers tick along with the clock.
  const liveMin = current ? (now - data.fetchedAt) / 60000 : 0
  const month = data.month.contractMin > 0 ? data.month : null
  const monthName = new Date(now).toLocaleDateString('en-GB', { month: 'long' })

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
          {usual && <p className="-mt-2 text-[11px] text-muted">Your usual project at this time</p>}
          {current && <ClockOut startTs={current.startTs} />}
          <p className="text-[11px] text-faint">
            <kbd>Space</kbd> or <kbd>⌘↩</kbd> to {running ? 'pause' : 'start'}
          </p>
        </div>

        <div className="flex max-w-md flex-col gap-7">
          <div>
            <p aria-live="polite" className={cx('font-display text-[34px] font-semibold leading-tight tracking-tight text-balance', over && 'text-over')}>{status}</p>
            <p className="mt-2 text-sm text-muted">{detail}</p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            {finish && <Stat size="sm" label="Finish around" value={finish} hint={finishHint} />}
            {data.settings.breakRules && view.workedMin > 0 && (
              <Stat
                size="sm"
                label="Breaks"
                value={formatDuration(breaks.breakMin)}
                valueTone={issue ? 'under' : 'neutral'}
                hint={
                  issue ??
                  (deducted > 0
                    ? `${Math.round(deducted)} min deducted`
                    : breaks.requiredMin > 0
                      ? `${breaks.requiredMin} min required, done`
                      : breakAhead > 0
                        ? `${Math.round(breakAhead)} min still due today`
                        : 'Counted from 15 min')
                }
              />
            )}
            <Stat
              size="sm"
              label="Balance"
              value={formatDelta(balance)}
              valueTone={balance > 0 ? 'over' : balance < 0 ? 'under' : 'neutral'}
              hint={data.settings.startingBalance ? `Includes ${formatDelta(data.settings.startingBalance)} carried over` : undefined}
            />
            {month && <MonthStat hours={month} liveMin={liveMin} name={monthName} />}
          </div>
        </div>
      </section>

      {data.missing.length > 0 && <MissingDays dates={data.missing} />}

      <ProjectsSection
        today={byProject}
        month={month}
        monthName={monthName}
        liveMin={liveMin}
        runningProjectId={current ? current.projectId : undefined}
        projectById={projectById}
      />

      <TodaySessions list={list} now={now} today={dateKey(now)} onChanged={refresh} />

      <WeekStrip days={weekDays} weekStart={data.settings.weekStart} />
    </Page>
  )
}

function tsToday(hhmm: string, now: number): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/**
 * Clock out ahead of time ("I leave at 17:00") so it is not forgotten on the way out, or a little
 * after the fact. A time still to come is scheduled; a past one ends the session right away.
 */
function ClockOut({ startTs }: { startTs: number }) {
  const { plannedStop, stopAt, cancelPlannedStop, settings, now } = useTracker()
  const step = settings?.timeStep ?? 15
  const [draft, setDraft] = useState<string | null>(null)

  if (draft === null) {
    if (plannedStop !== null)
      return (
        <div className="flex items-center gap-2 text-[13px]">
          <House size={14} className="text-accent" />
          <span>
            Clocking out at <span className="tnum font-medium">{formatClock(plannedStop)}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setDraft(formatClock(plannedStop))}>Change</Button>
          <Button variant="ghost" size="sm" onClick={() => void cancelPlannedStop()}>Cancel</Button>
        </div>
      )
    return (
      <Button variant="ghost" size="sm" icon={<House size={14} />} onClick={() => setDraft(formatClock(nextSlot(now, step)))}>
        Clock out at…
      </Button>
    )
  }

  const at = tsToday(draft, now)
  const tooEarly = at <= startTs
  const past = at <= now
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (tooEarly) return
        void stopAt(at).then(() => setDraft(null))
      }}
      onKeyDown={(e) => e.key === 'Escape' && setDraft(null)}
    >
      <div className="w-[5.5rem]">
        <TimeField ariaLabel="Clock-out time" value={draft} onChange={setDraft} step={step} invalid={tooEarly} />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={tooEarly} title={tooEarly ? 'Before the session started' : undefined}>
        {past ? 'Clock out now' : `Clock out at ${draft}`}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
    </form>
  )
}

const fmtShort = (date: string): string => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/** Past workdays with nothing tracked and no day off: one click opens the day in History. */
function MissingDays({ dates }: { dates: string[] }) {
  const shown = dates.slice(-6)
  return (
    <section role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-sunken/60 px-4 py-3 text-[13px]">
      <CalendarX size={16} className="shrink-0 text-under" aria-hidden />
      <span className="font-medium">
        {dates.length} {dates.length === 1 ? 'workday has' : 'workdays have'} no entries
      </span>
      <span className="text-muted">Add the time you worked, or mark the day off.</span>
      <span className="flex flex-wrap gap-1.5 md:ml-auto">
        {dates.length > shown.length && <span className="self-center text-xs text-faint">{dates.length - shown.length} more, </span>}
        {shown.map((d) => (
          <Button key={d} size="sm" variant="secondary" onClick={() => openDayInHistory(d)}>
            {fmtShort(d)}
          </Button>
        ))}
      </span>
    </section>
  )
}

/** A page section: hairline, quiet heading, optional action on the right. */
function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-5">
      <header className="flex min-h-7 items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-muted">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

/** This month's contract hours: counted so far and what each remaining workday needs. */
function MonthStat({ hours, liveMin, name }: { hours: MonthHours; liveMin: number; name: string }) {
  const counted = hours.countedMin + liveMin
  const remaining = Math.max(0, hours.contractMin - counted)
  const done = counted >= hours.contractMin
  let hint: string
  if (done) hint = counted > hours.contractMin ? `Done, ${formatDuration(counted - hours.contractMin)} extra` : 'Done'
  else if (hours.workdaysLeft > 0) hint = `${formatDuration(remaining / hours.workdaysLeft)} per workday left`
  else hint = `${formatDuration(remaining)} left, no workdays left`
  // At the pace of this month so far.
  const pace = done
    ? null
    : hours.projectedFinish
      ? `On pace to finish ${new Date(`${hours.projectedFinish}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
      : hours.projectedShortMin > 1
        ? `At this pace ${formatDuration(hours.projectedShortMin)} short`
        : null
  return (
    <Stat
      size="sm"
      label={name}
      valueTone={done ? 'over' : 'neutral'}
      value={
        <span className="tnum">
          {formatDuration(counted)}
          <span className="font-sans text-xs font-normal tracking-normal text-faint"> of {formatDuration(hours.contractMin)}</span>
        </span>
      }
      hint={pace ? `${hint}. ${pace}` : hint}
    />
  )
}

/**
 * One row per project: time today, and progress through its monthly hours when the contract is
 * split by project. Replaces separate "by project" and "month per project" blocks.
 */
function ProjectsSection({
  today,
  month,
  monthName,
  liveMin,
  runningProjectId,
  projectById
}: {
  today: { projectId: number | null; minutes: number }[]
  month: MonthHours | null
  monthName: string
  liveMin: number
  /** undefined when nothing runs; null when the running session has no project. */
  runningProjectId: number | null | undefined
  projectById: (id: number | null | undefined) => Project | undefined
}) {
  const monthProjects = month?.projects ?? []
  const split = monthProjects.length > 0
  const todayBy = new Map(today.map((t) => [t.projectId, t.minutes]))
  const ids: (number | null)[] = [...monthProjects.map((p) => p.projectId)]
  for (const t of today) if (!ids.includes(t.projectId)) ids.push(t.projectId)
  if (ids.length === 0 && !month) return null

  const flex = month ? Math.round(flexNow(month, month.todayCountedMin + liveMin)) : null
  const cols = split ? 'grid-cols-[minmax(0,1fr)_4rem_minmax(6rem,13rem)_7.5rem]' : 'grid-cols-[minmax(0,1fr)_4rem]'

  return (
    <Section
      title="Projects"
      action={
        flex !== null && (
          <span title="Ahead (+) or behind (−) the share of your monthly hours due so far" className="flex items-center gap-2 text-xs text-muted">
            Flextime this month
            <Badge tone={flex > 0 ? 'over' : flex < 0 ? 'under' : 'neutral'}>{formatDelta(flex)}</Badge>
          </span>
        )
      }
    >
      {ids.length === 0 ? (
        <p className="text-sm text-muted">Nothing tracked yet today.</p>
      ) : (
        <div role="table" aria-label="Time by project" className="flex flex-col">
          <div role="row" className={cx('grid items-center gap-4 pb-2 text-[11px] text-faint', cols)}>
            <span role="columnheader">Project</span>
            <span role="columnheader" className="text-right">Today</span>
            {split && <span role="columnheader" className="col-span-2">{monthName}</span>}
          </div>
          {ids.map((id) => {
            const project = projectById(id)
            const running = runningProjectId !== undefined && runningProjectId === id
            const todayMin = todayBy.get(id) ?? 0
            const mp = monthProjects.find((p) => p.projectId === id)
            const counted = mp ? mp.countedMin + (running ? liveMin : 0) : 0
            return (
              <div role="row" key={id ?? 'none'} className={cx('grid min-h-10 items-center gap-4 text-sm', cols)}>
                <span role="cell" className="flex min-w-0 items-center gap-2.5">
                  <ProjectDot color={project?.color} />
                  <span className={cx('truncate', todayMin > 0 ? 'text-fg' : 'text-muted')}>{project?.name ?? 'No project'}</span>
                  {running && <Badge tone="over">Running</Badge>}
                </span>
                <span role="cell" className={cx('tnum text-right', todayMin > 0 ? 'font-medium' : 'text-faint')}>
                  {todayMin > 0 ? formatDuration(todayMin) : '–'}
                </span>
                {split &&
                  (mp ? (
                    <>
                      <span role="cell" className="h-1.5 overflow-hidden rounded-full bg-sunken">
                        <span
                          className="block h-full rounded-full transition-[width] duration-500 ease-out-expo"
                          style={{ width: `${Math.min(100, (counted / mp.contractMin) * 100)}%`, background: projectColor(project?.color) }}
                        />
                      </span>
                      <span role="cell" className="tnum text-right text-xs">
                        <span className="font-medium">{formatDuration(counted)}</span>
                        <span className="text-faint"> of {formatDuration(mp.contractMin)}</span>
                      </span>
                    </>
                  ) : (
                    <span role="cell" className="col-span-2 text-xs text-faint">No monthly hours</span>
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

/** Today's sessions laid out on a strip of the day, so gaps and project switches show at a glance. */
function DayTimeline({ list, now, today }: { list: Session[]; now: number; today: string }) {
  const dayStart = startOfDay(today)
  const dayEnd = startOfDay(addDays(today, 1))
  const segs = list.map((s) => ({ s, a: Math.max(s.startTs, dayStart), b: Math.min(s.endTs ?? now, dayEnd) })).filter((x) => x.b > x.a)
  const hourAt = (h: number): number => new Date(dayStart).setHours(h, 0, 0, 0)
  const floorHour = (ts: number): number => new Date(ts).setMinutes(0, 0, 0)
  const ceilHour = (ts: number): number => (floorHour(ts) === ts ? ts : floorHour(ts) + 3600000)
  const from = Math.min(hourAt(8), ...segs.map((x) => floorHour(x.a)))
  const to = Math.min(dayEnd, Math.max(hourAt(18), ...segs.map((x) => ceilHour(x.b))))
  const span = to - from
  const pct = (ts: number): string => `${((ts - from) / span) * 100}%`
  const ticks: number[] = []
  for (let t = from; t <= to; t += 2 * 3600000) ticks.push(t)
  const { projectById } = useTracker()
  const nowVisible = now > from && now < to && dateKey(now) === today

  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label="Today's sessions on a timeline">
      <div className="relative h-3 rounded-full bg-sunken">
        {segs.map(({ s, a, b }) => (
          <span
            key={s.id}
            title={`${projectById(s.projectId)?.name ?? 'No project'}, ${formatClock(a)}–${s.endTs ? formatClock(b) : 'now'}`}
            className="absolute inset-y-0 rounded-full transition-[width] duration-500 ease-out-expo"
            style={{ left: pct(a), width: `max(4px, ${((b - a) / span) * 100}%)`, background: projectColor(projectById(s.projectId)?.color) }}
          />
        ))}
        {nowVisible && <span aria-hidden className="absolute -inset-y-1 w-px bg-line-strong" style={{ left: pct(now) }} />}
      </div>
      <div className="relative h-3.5 text-[10.5px] text-faint">
        {ticks.map((t, i) => (
          <span key={t} className={cx('tnum absolute', i === 0 ? '' : i === ticks.length - 1 && t === to ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: pct(t) }}>
            {formatClock(t)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The week so far as one quiet row of day totals; the full chart lives on Stats. */
function WeekStrip({ days, weekStart }: { days: DayStat[]; weekStart: number }) {
  const byWeekday = new Map(days.map((d) => [weekdayIndex(d.date), d]))
  const order = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7)
  const today = days[days.length - 1]?.date
  return (
    <Section title="This week">
      <ul className="grid grid-cols-7 gap-2">
        {order.map((w) => {
          const d = byWeekday.get(w)
          const met = !!d && d.expectedMin > 0 && d.workedMin >= d.expectedMin
          const isToday = d?.date === today
          return (
            <li
              key={w}
              title={d && d.expectedMin > 0 ? `${formatDuration(d.workedMin)} of ${formatDuration(d.expectedMin)}` : undefined}
              className={cx('flex flex-col gap-1 rounded-lg px-2.5 py-2', isToday && 'bg-sunken')}
            >
              <span className={cx('text-[11px]', isToday ? 'font-medium text-fg' : 'text-faint')}>{WEEKDAYS[w]}</span>
              <span className={cx('tnum text-sm', !d || d.workedMin === 0 ? 'text-faint' : met ? 'text-over' : 'text-fg')}>
                {d && d.workedMin > 0 ? formatDuration(d.workedMin) : '–'}
              </span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/** Today's sessions with quick edit (dates, times, project) and delete. */
function TodaySessions({ list, now, today, onChanged }: { list: Session[]; now: number; today: string; onChanged: () => Promise<void> }) {
  const { projects } = useTracker()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const act = useSessionActions(onChanged)
  return (
    <Section
      title="Sessions"
      action={
        editing === null && (
          <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setEditing('new')}>
            Add
          </Button>
        )
      }
    >
      {list.length > 0 && <DayTimeline list={list} now={now} today={today} />}
      {editing === 'new' && (
        <div>
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
          <div className="grid place-items-center gap-1 py-6 text-center">
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
                    if (await act.update(s.id, d, false, s)) setEditing(null)
                  }}
                />
              </li>
            ) : (
              <li key={s.id} className="group flex items-center gap-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => setEditing(s.id)}
                  title="Edit times"
                  className="no-drag tnum -mx-1 w-[8rem] shrink-0 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-sunken"
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
                  onChange={(id) => void act.update(s.id, { projectId: id }, true, s)}
                />
                {s.source === 'wifi' && <Badge>Wi-Fi</Badge>}
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
    </Section>
  )
}

const formatShortDay = (ts: number): string => new Date(ts).toLocaleDateString(undefined, { weekday: 'short' })

function Skeleton() {
  return (
    <div className="mx-auto flex max-w-4xl animate-pulse flex-col gap-6 px-8 pb-12 pt-8" aria-busy="true">
      <div className="h-9 w-40 rounded-md bg-sunken" />
      <div className="flex items-center gap-10">
        <div className="size-[248px] rounded-full border-[12px] border-sunken" />
        <div className="flex flex-col gap-5">
          <div className="h-9 w-64 rounded-md bg-sunken" />
          <div className="flex gap-10">
            <div className="h-10 w-20 rounded-md bg-sunken" />
            <div className="h-10 w-20 rounded-md bg-sunken" />
            <div className="h-10 w-24 rounded-md bg-sunken" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <div className="h-4 w-20 rounded bg-sunken" />
        <div className="h-8 rounded-md bg-sunken" />
        <div className="h-8 rounded-md bg-sunken" />
      </div>
      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <div className="h-4 w-20 rounded bg-sunken" />
        <div className="h-3 rounded-full bg-sunken" />
        <div className="h-8 rounded-md bg-sunken" />
      </div>
    </div>
  )
}
