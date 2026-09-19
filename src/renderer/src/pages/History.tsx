import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, CaretLeft, CaretRight, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Badge, Button, Card, IconButton, NumberField, Page, ProjectLabel, Segmented, cx } from '../components/ui'
import { SessionEditor } from '../components/SessionEditor'
import { ExportMenu } from '../components/ExportMenu'
import { errorText, useToast } from '../lib/toast'
import { useSessionActions } from '../lib/sessions'
import { isTyping, useTracker } from '../lib/tracker'
import type { Tone } from '../components/ui'
import { addDays, dateKey, dayBalance, startOfDay, weekdayIndex, workedMinutesByDay } from '../../../shared/time'
import type { DayStat } from '../../../shared/time'
import { formatClock, formatDelta, formatDuration } from '../../../shared/format'
import { DEFAULT_SCHEDULE, DEFAULT_SETTINGS } from '../../../shared/types'
import type { DayKind, DayOverride, Schedule, Session, Settings } from '../../../shared/types'

const pad = (n: number): string => String(n).padStart(2, '0')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const KIND_LABEL: Record<DayKind, string> = { vacation: 'Vacation', sick: 'Sick', holiday: 'Holiday', custom: 'Custom' }

const fmtDay = (date: string): string => {
  const [, m, d] = date.split('-').map(Number)
  return `${WD[weekdayIndex(date)]}, ${d} ${MONTHS[m - 1].slice(0, 3)}`
}
const deltaTone = (n: number): Tone => (n > 0 ? 'over' : n < 0 ? 'under' : 'neutral')

function OverrideControl({ date, override, schedule, onSet, onClear }: {
  date: string
  override?: DayOverride
  schedule: Schedule
  onSet: (o: DayOverride) => Promise<void>
  onClear: () => Promise<void>
}) {
  const base = schedule[weekdayIndex(date)] ?? 0
  const [hours, setHours] = useState((override?.expectedMinutes ?? base) / 60)
  const kind = override?.kind
  const options = (['vacation', 'sick', 'holiday', 'custom'] as DayKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Mark day as</span>
        <Segmented<DayKind> label="Mark day as" options={options} value={kind ?? ('' as DayKind)}
          onChange={(k) => onSet({ date, kind: k, expectedMinutes: k === 'custom' ? Math.round(hours * 60) : null })} />
      </div>
      {kind === 'custom' && (
        <>
          <div className="w-36"><NumberField label="Expected hours" value={hours} onChange={setHours} suffix="h" /></div>
          <Button onClick={() => onSet({ date, kind: 'custom', expectedMinutes: Math.round(hours * 60) })}>Apply</Button>
        </>
      )}
      {override && <Button variant="ghost" onClick={onClear}>Clear</Button>}
    </div>
  )
}

function DayRow({ stat, sessions, override, schedule, open, onToggle, refetch }: {
  stat: DayStat
  sessions: Session[]
  override?: DayOverride
  schedule: Schedule
  open: boolean
  onToggle: () => void
  refetch: () => Promise<void>
}) {
  const { projectById } = useTracker()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const act = useSessionActions(refetch)
  const toast = useToast()
  const quiet = stat.expectedMin === 0 && stat.workedMin === 0 && !override
  const actual = stat.credited ? Math.max(0, stat.workedMin) : stat.workedMin
  const run = async (fn: () => Promise<unknown>, fail: string): Promise<boolean> => {
    try {
      await fn()
      await refetch()
      return true
    } catch (e) {
      toast.error(fail, { description: errorText(e) })
      return false
    }
  }
  // Day markers: apply, then offer Undo back to whatever was there before.
  const restore = (prev: DayOverride | undefined) => () =>
    void run(() => (prev ? window.api['overrides:set'](prev) : window.api['overrides:remove'](stat.date)), "Couldn't undo")
  const setMarker = async (o: DayOverride): Promise<void> => {
    if (await run(() => window.api['overrides:set'](o), "Couldn't mark the day"))
      toast.success(`${fmtDay(stat.date)} marked as ${KIND_LABEL[o.kind].toLowerCase()}`, { id: `marker-${stat.date}`, actions: [{ label: 'Undo', onClick: restore(override) }] })
  }
  const clearMarker = async (): Promise<void> => {
    if (await run(() => window.api['overrides:remove'](stat.date), "Couldn't clear the day"))
      toast.success(`${fmtDay(stat.date)} is a normal day again`, { id: `marker-${stat.date}`, actions: [{ label: 'Undo', onClick: restore(override) }] })
  }
  return (
    <div id={`day-${stat.date}`} className={cx('scroll-mt-24 border-t border-line first:border-t-0', quiet && !open && 'opacity-55', open && 'bg-sunken/60')}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="no-drag flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sunken">
        <CaretDown size={14} className={cx('shrink-0 text-faint transition-transform duration-150', !open && '-rotate-90')} />
        <span className="w-28 shrink-0 text-[13px] font-medium">{fmtDay(stat.date)}</span>
        <span className="tnum flex-1 text-[13px] text-muted">
          {formatDuration(stat.workedMin)} <span className="text-faint">of {formatDuration(stat.expectedMin)}</span>
        </span>
        {override && <Badge tone="accent">{KIND_LABEL[override.kind]}{override.kind === 'custom' ? ` ${formatDuration(override.expectedMinutes ?? 0)}` : ''}</Badge>}
        {!quiet && !stat.credited && <Badge tone={deltaTone(stat.deltaMin)}>{formatDelta(stat.deltaMin)}</Badge>}
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4 pl-11">
          {sessions.length === 0 && editing !== 'new' && (
            <p className="text-[13px] text-muted">No sessions recorded{stat.credited ? `; ${formatDuration(actual)} tracked, day is credited` : ''}.</p>
          )}
          {sessions.map((s) =>
            editing === s.id ? (
              <SessionEditor key={s.id} date={stat.date} initial={s}
                onCancel={() => setEditing(null)}
                onSave={async (d) => { if (await act.update(s.id, d)) setEditing(null) }} />
            ) : (
              <div key={s.id} className="flex items-center gap-3 text-[13px]">
                <span className="tnum w-28 shrink-0">{formatClock(s.startTs)}–{s.endTs ? formatClock(s.endTs) : 'running'}</span>
                <span className="tnum w-14 shrink-0 text-muted">{s.endTs ? formatDuration((s.endTs - s.startTs) / 60000) : ''}</span>
                <ProjectLabel project={projectById(s.projectId)} className="w-36 shrink-0" />
                {s.source === 'wifi' && <Badge>Wi-Fi</Badge>}
                <span className="min-w-0 flex-1 truncate text-muted">{s.note}</span>
                <span className="flex">
                  <IconButton size="sm" label="Edit session" onClick={() => setEditing(s.id)}><PencilSimple size={14} /></IconButton>
                  <IconButton size="sm" label="Delete session" onClick={() => void act.remove(s)}><Trash size={14} /></IconButton>
                </span>
              </div>
            )
          )}
          {editing === 'new' ? (
            <SessionEditor date={stat.date} onCancel={() => setEditing(null)}
              onSave={async (d) => { if (await act.add({ ...d, source: 'manual' })) setEditing(null) }} />
          ) : (
            <div><Button size="sm" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Add session</Button></div>
          )}
          <div className="border-t border-line pt-3">
            <OverrideControl date={stat.date} override={override} schedule={schedule}
              onSet={setMarker}
              onClear={clearMarker} />
          </div>
        </div>
      )}
    </div>
  )
}

export function HistoryPage() {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [sessions, setSessions] = useState<Session[]>([])
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [openDate, setOpenDate] = useState<string | null>(null)

  const first = `${ym.y}-${pad(ym.m + 1)}-01`
  const nextFirst = dateKey(new Date(ym.y, ym.m + 1, 1).getTime())
  const last = addDays(nextFirst, -1)

  const toast = useToast()
  const refetch = useCallback(async () => {
    try {
      const [s, o, sch, st] = await Promise.all([
        window.api['sessions:list'](startOfDay(first) - 86400000, startOfDay(nextFirst)),
        window.api['overrides:list'](first, last),
        window.api['schedule:get'](),
        window.api['settings:get']()
      ])
      setSessions(s); setOverrides(o); setSchedule(sch); setSettings(st); setLoaded(true)
      toast.dismiss('history-load')
    } catch (e) {
      toast.error("Couldn't load this month", { id: 'history-load', description: errorText(e), duration: null, actions: [{ label: 'Try again', onClick: () => void refetchRef.current() }] })
    }
  }, [first, nextFirst, last, toast])
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch
  useEffect(() => { void refetch() }, [refetch])

  const today = dateKey(Date.now())
  const { weeks, monthWorked, monthExpected } = useMemo(() => {
    const worked = workedMinutesByDay(sessions, Date.now())
    const ov = new Map(overrides.map((o) => [o.date, o]))
    const days: DayStat[] = []
    for (let d = first; d <= last && d <= today; d = addDays(d, 1)) days.push(dayBalance(d, worked[d] ?? 0, schedule, ov.get(d), settings))
    days.reverse()
    const map = new Map<string, DayStat[]>()
    for (const s of days) {
      const key = addDays(s.date, -((weekdayIndex(s.date) - settings.weekStart + 7) % 7))
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return {
      weeks: [...map.entries()].map(([weekStart, ds]) => ({
        weekStart, days: ds,
        worked: ds.reduce((a, b) => a + b.workedMin, 0), expected: ds.reduce((a, b) => a + b.expectedMin, 0)
      })),
      monthWorked: days.reduce((a, b) => a + b.workedMin, 0),
      monthExpected: days.reduce((a, b) => a + b.expectedMin, 0)
    }
  }, [sessions, overrides, schedule, settings, first, last, today])

  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth()
  const shift = useCallback((n: number): void => {
    setOpenDate(null)
    setYm((c) => {
      const d = new Date(c.y, c.m + n, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }, [])
  const ovMap = new Map(overrides.map((o) => [o.date, o]))
  const monthDelta = monthWorked - monthExpected

  const isCurrentRef = useRef(isCurrent)
  isCurrentRef.current = isCurrent

  // ←/→ switch months when nothing text-like is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if ((e.target as HTMLElement | null)?.closest('figure, [role="radiogroup"]')) return
      if (e.key === 'ArrowLeft') shift(-1)
      if (e.key === 'ArrowRight' && !isCurrentRef.current) shift(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shift])
  const openDay = (date: string): void => {
    setOpenDate(date)
    requestAnimationFrame(() => document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <Page
      title={`${MONTHS[ym.m]} ${ym.y}`}
      subtitle={
        <>
          {formatDuration(monthWorked)} worked of {formatDuration(monthExpected)}
          {monthExpected > 0 || monthWorked > 0 ? <> · <span className={cx(monthDelta > 0 ? 'text-over' : monthDelta < 0 ? 'text-under' : '')}>{formatDelta(monthDelta)}</span></> : null}
        </>
      }
      actions={
        <div className="flex items-center gap-1.5">
          <ExportMenu year={ym.y} month={ym.m} label={`${MONTHS[ym.m]} ${ym.y}`} />
          <span aria-hidden className="mx-1 h-5 w-px bg-line-strong" />
          <IconButton label="Previous month (←)" onClick={() => shift(-1)}><CaretLeft size={16} /></IconButton>
          <Button disabled={isCurrent} onClick={() => { setOpenDate(null); setYm({ y: now.getFullYear(), m: now.getMonth() }) }}>This month</Button>
          <IconButton label="Next month (→)" disabled={isCurrent} onClick={() => shift(1)}><CaretRight size={16} /></IconButton>
        </div>
      }
    >
      {!loaded ? (
        <div className="flex animate-pulse flex-col gap-4" aria-busy="true">
          <div className="h-56 rounded-xl bg-sunken" />
          {[0, 1, 2].map((i) => <div key={i} className="h-11 rounded-md bg-sunken" />)}
        </div>
      ) : weeks.length === 0 ? (
        <Card><p className="py-10 text-center text-[13px] text-muted">Nothing to show for this month yet.</p></Card>
      ) : (
        <>
          <MonthGrid y={ym.y} m={ym.m} days={weeks.flatMap((w) => w.days)} today={today} weekStart={settings.weekStart} overrides={ovMap} selected={openDate} onSelect={openDay} />
          <Card padded={false} className="overflow-clip">
            {weeks.map((w) => (
              <section key={w.weekStart} aria-label={`Week of ${fmtDay(w.weekStart)}`}>
                <header className="sticky top-0 flex items-center justify-between border-b border-t border-line bg-raised-solid/95 px-4 py-2 backdrop-blur first:border-t-0" style={{ zIndex: 1 }}>
                  <h2 className="text-xs font-medium text-muted">Week of {fmtDay(w.weekStart)}</h2>
                  <span className="tnum flex items-center gap-2 text-xs text-muted">
                    {formatDuration(w.worked)} / {formatDuration(w.expected)}
                    <Badge tone={deltaTone(w.worked - w.expected)}>{formatDelta(w.worked - w.expected)}</Badge>
                  </span>
                </header>
                {w.days.map((s) => (
                  <DayRow key={s.date} stat={s} override={ovMap.get(s.date)} schedule={schedule}
                    sessions={sessions.filter((x) => dateKey(x.startTs) === s.date).sort((a, b) => a.startTs - b.startTs)}
                    open={openDate === s.date} onToggle={() => setOpenDate(openDate === s.date ? null : s.date)} refetch={refetch} />
                ))}
              </section>
            ))}
          </Card>
        </>
      )}
    </Page>
  )
}

/** Calendar heatmap: each day tinted by how far over or under target it landed. */
function MonthGrid({ y, m, days, today, weekStart, overrides, selected, onSelect }: {
  y: number
  m: number
  days: DayStat[]
  today: string
  weekStart: 0 | 6
  overrides: Map<string, DayOverride>
  selected: string | null
  onSelect: (date: string) => void
}) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const first = `${y}-${pad(m + 1)}-01`
  const lead = (weekdayIndex(first) - weekStart + 7) % 7
  const count = new Date(y, m + 1, 0).getDate()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${y}-${pad(m + 1)}-${pad(i + 1)}`)]
  const heads = weekStart === 6 ? ['Sun', ...WD.slice(0, 6)] : WD
  const maxAbs = Math.max(60, ...days.filter((d) => !d.credited).map((d) => Math.abs(d.deltaMin)))

  const fill = (d: DayStat | undefined, date: string): { bg?: string; cls: string } => {
    if (!d) return { cls: date > today ? 'text-faint/60' : 'text-faint' }
    if (overrides.has(date) || d.credited) return { cls: 'bg-accent-soft text-accent' }
    if (d.expectedMin === 0 && d.workedMin === 0) return { cls: 'text-faint' }
    const t = Math.min(1, Math.abs(d.deltaMin) / maxAbs)
    const col = d.deltaMin >= 0 ? 'var(--over)' : 'var(--under)'
    return { bg: `color-mix(in oklab, ${col} ${Math.round(14 + t * 46)}%, transparent)`, cls: 'text-fg' }
  }

  return (
    <Card>
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div role="grid" aria-label="Month overview" className="grid grid-cols-7 gap-1.5">
          {heads.map((h) => <div key={h} role="columnheader" className="pb-1 text-center text-[11px] text-faint">{h}</div>)}
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} />
            const d = byDate.get(date)
            const f = fill(d, date)
            const future = date > today
            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                disabled={future}
                onClick={() => onSelect(date)}
                aria-label={`${fmtDay(date)}${d ? `, ${formatDuration(d.workedMin)} worked, ${formatDelta(d.deltaMin)}` : ''}`}
                title={d ? `${fmtDay(date)} · ${formatDuration(d.workedMin)} (${formatDelta(d.deltaMin)})` : fmtDay(date)}
                className={cx(
                  'no-drag tnum grid h-9 place-items-center rounded-md text-xs font-medium transition-[transform,box-shadow] duration-150 enabled:hover:scale-105 enabled:active:scale-95',
                  f.cls,
                  date === today && 'ring-1 ring-accent',
                  selected === date && 'ring-2 ring-fg/70'
                )}
                style={f.bg ? { background: f.bg } : undefined}
              >
                {Number(date.slice(8))}
              </button>
            )
          })}
        </div>
        <ul className="flex flex-row flex-wrap gap-x-5 gap-y-2 self-end text-xs text-muted md:flex-col">
          <li className="flex items-center gap-2"><span className="size-3 rounded-[3px] bg-over/60" />Over target</li>
          <li className="flex items-center gap-2"><span className="size-3 rounded-[3px] bg-under/60" />Under target</li>
          <li className="flex items-center gap-2"><span className="size-3 rounded-[3px] bg-accent-soft ring-1 ring-accent/40" />Day off</li>
          <li className="flex items-center gap-2"><span className="size-3 rounded-[3px] ring-1 ring-accent" />Today</li>
        </ul>
      </div>
    </Card>
  )
}
