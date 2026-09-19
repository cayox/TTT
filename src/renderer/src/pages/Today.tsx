import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import { Badge, BarChart, Button, Card, ProgressRing, Stat } from '../components/ui'
import type { DayOverride, Schedule, Session, Settings } from '../../../shared/types'
import {
  addDays,
  dateKey,
  expectedMinutesForDay,
  rangeStats,
  splitSessionsByDay,
  startOfDay,
  weekdayIndex,
  type DayStat
} from '../../../shared/time'
import { formatClock, formatDelta, formatDuration, formatDurationLong } from '../../../shared/format'

interface Data {
  current: Session | null
  sessions: Session[] // last 7 days
  schedule: Schedule
  overrides: DayOverride[]
  settings: Settings
  balance: number
  fetchedAt: number
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

async function load(): Promise<Data> {
  const now = Date.now()
  const today = dateKey(now)
  const from = addDays(today, -6)
  const [current, sessions, schedule, overrides, settings, balance] = await Promise.all([
    window.api['sessions:current'](),
    window.api['sessions:list'](startOfDay(from), startOfDay(addDays(today, 1))),
    window.api['schedule:get'](),
    window.api['overrides:list'](from, today),
    window.api['settings:get'](),
    window.api['stats:balance']()
  ])
  return { current, sessions, schedule, overrides, settings, balance, fetchedAt: now }
}

export function TodayPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async () => {
    try {
      setData(await load())
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const iv = setInterval(() => void refresh(), 30000)
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const running = !!data?.current
  useEffect(() => {
    setNow(Date.now())
    if (!running) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [running])

  const toggle = async (): Promise<void> => {
    if (!data || busy) return
    setBusy(true)
    try {
      if (data.current) await window.api['sessions:stop']()
      else await window.api['sessions:start']()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const view = useMemo(() => {
    if (!data) return null
    const today = dateKey(now)
    const todayStart = startOfDay(today)
    const sessions = data.sessions.some((s) => s.id === data.current?.id)
      ? data.sessions
      : data.current
        ? [...data.sessions, data.current]
        : data.sessions
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
    return { workedMs, workedMin, expectedMin, remaining, weekDays, list, ov, todayStart }
  }, [data, now])

  if (error && !data) {
    return (
      <div className="mx-auto grid max-w-3xl place-items-center p-16 text-center">
        <p className="text-sm text-muted">Could not load your data.</p>
        <Button className="mt-3" onClick={() => void refresh()}>Try again</Button>
      </div>
    )
  }

  if (!data || !view) return <Skeleton />

  const { workedMs, expectedMin, remaining, weekDays, list, ov } = view
  const over = remaining <= 0 && expectedMin > 0
  const noTarget = expectedMin === 0
  const secs = Math.floor(workedMs / 1000)
  const clock = `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  const progress = expectedMin > 0 ? view.workedMin / expectedMin : 0
  const finish = running && remaining > 0 ? formatClock(now + remaining * 60000) : null
  const balance = data.balance
  const dayLabel = new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  let status: string
  if (noTarget) status = ov ? `No work expected today (${ov.kind})` : 'No work expected today'
  else if (over) status = remaining === 0 ? 'Target reached' : `Overtime so far ${formatDuration(-remaining)}`
  else status = `${formatDurationLong(remaining)} remaining`

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-8 py-8">
      <header>
        <h1 className="font-display text-xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted">{dayLabel}</p>
      </header>

      <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <ProgressRing value={progress} size={240} thickness={12} tone={over ? 'over' : 'accent'} label="Progress toward today's expected time">
          <div className="flex flex-col items-center gap-1">
            <span className="tnum font-display text-[44px] font-semibold leading-none tracking-tight">{clock}</span>
            <span className="text-xs text-muted">{expectedMin > 0 ? `of ${formatDuration(expectedMin)}` : 'worked today'}</span>
          </div>
        </ProgressRing>

        <div className="flex flex-col items-start gap-5">
          <div>
            <p className={`font-display text-2xl font-semibold tracking-tight ${over ? 'text-over' : ''}`}>{status}</p>
            <p className="mt-1 text-sm text-muted">
              {running
                ? finish
                  ? `Tracking since ${formatClock(data.current!.startTs)}. On track to finish around ${finish}.`
                  : `Tracking since ${formatClock(data.current!.startTs)}.`
                : list.length
                  ? 'Paused. Start again when you are back.'
                  : 'Nothing tracked yet today.'}
            </p>
          </div>
          <Button
            variant={running ? 'secondary' : 'primary'}
            size="lg"
            disabled={busy}
            onClick={() => void toggle()}
            icon={running ? <Pause weight="fill" size={16} /> : <Play weight="fill" size={16} />}
          >
            {running ? 'Pause' : 'Start'}
          </Button>
          <Stat
            label="Overtime balance"
            value={formatDelta(balance)}
            deltaTone={balance > 0 ? 'over' : balance < 0 ? 'under' : 'neutral'}
            delta={balance > 0 ? 'ahead' : balance < 0 ? 'behind' : undefined}
            hint="Running total since your first session"
            className={balance > 0 ? '[&_.font-display]:text-over' : balance < 0 ? '[&_.font-display]:text-under' : ''}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Today's sessions">
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No sessions yet. Press Start to begin.</p>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="tnum">
                    {formatClock(s.startTs)} - {s.endTs ? formatClock(s.endTs) : 'now'}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={s.source === 'wifi' ? 'accent' : 'neutral'}>{s.source === 'wifi' ? 'Wi-Fi' : 'Manual'}</Badge>
                    <span className="tnum w-12 text-right text-muted">{formatDuration(((s.endTs ?? now) - s.startTs) / 60000)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="This week">
          <BarChart
            title="Worked hours this week"
            data={weekDays.map((d) => ({ label: WEEKDAYS[weekdayIndex(d.date)], value: d.workedMin / 60 }))}
            format={(v) => `${Math.round(v * 10) / 10}h`}
            height={180}
            labelEvery={1}
          />
        </Card>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="mx-auto flex max-w-4xl animate-pulse flex-col gap-8 px-8 py-8" aria-busy="true">
      <div className="h-8 w-40 rounded-md bg-sunken" />
      <div className="flex items-center gap-8">
        <div className="size-60 rounded-full border-[12px] border-sunken" />
        <div className="flex flex-col gap-4">
          <div className="h-7 w-56 rounded-md bg-sunken" />
          <div className="h-11 w-32 rounded-lg bg-sunken" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-48 rounded-lg bg-sunken" />
        <div className="h-48 rounded-lg bg-sunken" />
      </div>
    </div>
  )
}
