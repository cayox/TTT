import { useCallback, useEffect, useMemo, useState } from 'react'
import { CaretDown, CaretLeft, CaretRight, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Badge, Button, Card, IconButton, Input, NumberField, Segmented, TimeField, cx } from '../components/ui'
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

function tsFor(date: string, hhmm: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, h, mi).getTime()
}
const fmtDay = (date: string): string => {
  const [, m, d] = date.split('-').map(Number)
  return `${WD[weekdayIndex(date)]}, ${d} ${MONTHS[m - 1].slice(0, 3)}`
}
const deltaTone = (n: number): Tone => (n > 0 ? 'over' : n < 0 ? 'under' : 'neutral')

function SessionEditor({
  date, initial, onSave, onCancel
}: {
  date: string
  initial?: Session
  onSave: (startTs: number, endTs: number, note: string) => Promise<void>
  onCancel: () => void
}) {
  const [start, setStart] = useState(initial ? formatClock(initial.startTs) : '09:00')
  const [end, setEnd] = useState(initial?.endTs ? formatClock(initial.endTs) : '17:00')
  const [note, setNote] = useState(initial?.note ?? '')
  const [busy, setBusy] = useState(false)
  const error = !start || !end ? 'Enter both times' : tsFor(date, end) <= tsFor(date, start) ? 'End must be after start' : undefined
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md bg-sunken p-3">
      <div className="w-28"><TimeField label="Start" value={start} onChange={setStart} /></div>
      <div className="w-28"><TimeField label="End" value={end} onChange={setEnd} error={error} /></div>
      <div className="min-w-48 flex-1"><Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
      <div className="flex items-center gap-2 pt-[22px]">
        <Button variant="primary" disabled={!!error || busy} onClick={async () => { setBusy(true); await onSave(tsFor(date, start), tsFor(date, end), note); setBusy(false) }}>Save</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

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
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const quiet = stat.expectedMin === 0 && stat.workedMin === 0 && !override
  const actual = stat.credited ? Math.max(0, stat.workedMin) : stat.workedMin
  const run = async (fn: () => Promise<unknown>): Promise<void> => { await fn(); await refetch() }
  return (
    <div className={cx('border-t border-line first:border-t-0', quiet && !open && 'opacity-55')}>
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
                onSave={async (a, b, note) => { await run(() => window.api['sessions:update'](s.id, { startTs: a, endTs: b, note })); setEditing(null) }} />
            ) : (
              <div key={s.id} className="flex items-center gap-3 text-[13px]">
                <span className="tnum w-28 shrink-0">{formatClock(s.startTs)} - {s.endTs ? formatClock(s.endTs) : 'running'}</span>
                <span className="tnum w-14 shrink-0 text-muted">{s.endTs ? formatDuration((s.endTs - s.startTs) / 60000) : ''}</span>
                <Badge>{s.source === 'wifi' ? 'Wi-Fi' : 'Manual'}</Badge>
                <span className="min-w-0 flex-1 truncate text-muted">{s.note}</span>
                {confirmId === s.id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-muted">Delete?</span>
                    <Button size="sm" variant="danger" onClick={() => run(() => window.api['sessions:remove'](s.id))}>Delete</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Keep</Button>
                  </span>
                ) : (
                  <span className="flex">
                    {s.endTs != null && <IconButton size="sm" label="Edit session" onClick={() => setEditing(s.id)}><PencilSimple size={14} /></IconButton>}
                    <IconButton size="sm" label="Delete session" onClick={() => setConfirmId(s.id)}><Trash size={14} /></IconButton>
                  </span>
                )}
              </div>
            )
          )}
          {editing === 'new' ? (
            <SessionEditor date={stat.date} onCancel={() => setEditing(null)}
              onSave={async (a, b, note) => { await run(() => window.api['sessions:add']({ startTs: a, endTs: b, source: 'manual', note })); setEditing(null) }} />
          ) : (
            <div><Button size="sm" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Add session</Button></div>
          )}
          <div className="border-t border-line pt-3">
            <OverrideControl date={stat.date} override={override} schedule={schedule}
              onSet={(o) => run(() => window.api['overrides:set'](o))}
              onClear={() => run(() => window.api['overrides:remove'](stat.date))} />
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

  const refetch = useCallback(async () => {
    const [s, o, sch, st] = await Promise.all([
      window.api['sessions:list'](startOfDay(first) - 86400000, startOfDay(nextFirst)),
      window.api['overrides:list'](first, last),
      window.api['schedule:get'](),
      window.api['settings:get']()
    ])
    setSessions(s); setOverrides(o); setSchedule(sch); setSettings(st); setLoaded(true)
  }, [first, nextFirst, last])
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
  const shift = (n: number): void => { setOpenDate(null); const d = new Date(ym.y, ym.m + n, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }) }
  const ovMap = new Map(overrides.map((o) => [o.date, o]))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{MONTHS[ym.m]} {ym.y}</h1>
          <p className="tnum mt-1 text-[13px] text-muted">
            {formatDuration(monthWorked)} worked of {formatDuration(monthExpected)}
            {monthExpected > 0 || monthWorked > 0 ? <> · <span className={cx(monthWorked - monthExpected > 0 ? 'text-over' : monthWorked - monthExpected < 0 ? 'text-under' : '')}>{formatDelta(monthWorked - monthExpected)}</span></> : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton label="Previous month" onClick={() => shift(-1)}><CaretLeft size={16} /></IconButton>
          <Button disabled={isCurrent} onClick={() => { setOpenDate(null); setYm({ y: now.getFullYear(), m: now.getMonth() }) }}>Today</Button>
          <IconButton label="Next month" onClick={() => shift(1)}><CaretRight size={16} /></IconButton>
        </div>
      </header>

      {!loaded ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-11 animate-pulse rounded-md bg-sunken" />)}
        </div>
      ) : weeks.length === 0 ? (
        <Card><p className="py-10 text-center text-[13px] text-muted">Nothing to show yet for this month.</p></Card>
      ) : (
        weeks.map((w) => (
          <Card key={w.weekStart} padded={false}
            title={<span className="px-0">Week of {fmtDay(w.weekStart)}</span>}
            action={
              <span className="tnum flex items-center gap-2 text-xs text-muted">
                {formatDuration(w.worked)} / {formatDuration(w.expected)}
                <Badge tone={deltaTone(w.worked - w.expected)}>{formatDelta(w.worked - w.expected)}</Badge>
              </span>
            }>
            <div className="mt-3">
              {w.days.map((s) => (
                <DayRow key={s.date} stat={s} override={ovMap.get(s.date)} schedule={schedule}
                  sessions={sessions.filter((x) => dateKey(x.startTs) === s.date).sort((a, b) => a.startTs - b.startTs)}
                  open={openDate === s.date} onToggle={() => setOpenDate(openDate === s.date ? null : s.date)} refetch={refetch} />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
