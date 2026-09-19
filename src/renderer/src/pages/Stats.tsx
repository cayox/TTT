import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BarChart, Card, Page, ProjectLabel, Segmented, Stat, cx, projectColor } from '../components/ui'
import { useTracker } from '../lib/tracker'
import { errorText, useToast } from '../lib/toast'
import { formatDelta, formatDuration } from '../../../shared/format'
import type { ProjectTotal, Range, RangeStats } from '../../../shared/time'
import { contractMinutes, type MonthTotal } from '../../../shared/hours'
import { chartPoints, granularity, weekdayAverages } from './stats/aggregate'

const RANGES: { value: Range; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: 'Year' },
  { value: 'all', label: 'All time' }
]
const GRAN = { day: 'Daily', week: 'Weekly', month: 'Monthly' }
const hours = (v: number): string => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v * 10) / 10)}h`
const tone = (m: number) => (m > 0 ? 'over' : m < 0 ? 'under' : 'neutral') as 'over' | 'under' | 'neutral'

export function StatsPage() {
  const [range, setRange] = useState<Range>('30d')
  const [delta, setDelta] = useState(false)
  const [stats, setStats] = useState<RangeStats | null>(null)
  const [byProject, setByProject] = useState<ProjectTotal[]>([])
  const [months, setMonths] = useState<MonthTotal[]>([])
  const { projectById, settings, projects } = useTracker()
  const contractMin = settings ? contractMinutes(settings, projects.filter((p) => !p.archived).map((p) => p.id)) : 0
  const toast = useToast()

  useEffect(() => {
    let live = true
    const fail = (e: unknown): void => void (live && toast.error("Couldn't load stats", { id: 'stats-load', description: errorText(e) }))
    window.api['stats:range'](range).then((s) => live && setStats(s), fail)
    window.api['stats:projects'](range).then((p) => live && setByProject(p), fail)
    window.api['stats:months'](6).then((m) => live && setMonths(m), fail)
    return () => {
      live = false
    }
  }, [range, toast])

  const points = useMemo(() => (stats ? chartPoints(stats.days, range, delta) : []), [stats, range, delta])
  const wd = useMemo(() => (stats ? weekdayAverages(stats.days) : []), [stats])
  const empty = !!stats && stats.totalWorked === 0
  const wdMax = Math.max(1, ...wd.map((d) => Math.max(d.worked, d.expected)))
  const g = GRAN[granularity(range)]

  return (
    <Page title="Stats" subtitle={RANGES.find((r) => r.value === range)?.label} width="lg" actions={<Segmented label="Range" options={RANGES} value={range} onChange={setRange} />}>
      {!stats ? (
        <div className="flex animate-pulse flex-col gap-4" aria-busy="true">
          <div className="h-36 rounded-xl bg-sunken" />
          <div className="h-64 rounded-xl bg-sunken" />
        </div>
      ) : empty ? (
        <Card>
          <div className="grid place-items-center gap-1 py-16 text-center">
            <p className="text-sm font-medium">No tracked time in this range</p>
            <p className="text-xs text-muted">Start a session on the Today page and your stats will appear here.</p>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] md:items-end">
              <Stat
                size="lg"
                label="Balance"
                value={formatDelta(stats.balance)}
                valueTone={tone(stats.balance)}
                hint={
                  range === 'all' && settings?.startingBalance
                    ? `Includes ${formatDelta(settings.startingBalance)} carried over`
                    : stats.balance > 0 ? 'Over target' : stats.balance < 0 ? 'Under target' : 'Exactly on target'
                }
              />
              <div className="grid grid-cols-3 gap-6">
                <Stat label="Worked" value={formatDuration(stats.totalWorked)} />
                <Stat label="Expected" value={formatDuration(stats.totalExpected)} />
                <Stat label="Avg per workday" value={formatDuration(stats.avgWorkedPerWorkday)} />
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-4 text-[13px] md:grid-cols-4">
              <Fact label="Best day" value={stats.bestDay ? formatDuration(stats.bestDay.workedMin) : '–'} hint={stats.bestDay ? fmtDate(stats.bestDay.date) : undefined} />
              <Fact label="Longest streak" value={`${stats.longestStreak} ${stats.longestStreak === 1 ? 'day' : 'days'}`} />
              <Fact label="Overtime days" value={stats.overtimeDays} tone="over" />
              <Fact label="Undertime days" value={stats.undertimeDays} tone="under" />
            </dl>
          </Card>

          {contractMin > 0 && months.length > 0 && <HoursCard months={months} contractMin={contractMin} />}

          {byProject.length > 0 && (
            <Card title="By project">
              <ul className="flex flex-col gap-3">
                {byProject.map((b) => {
                  const p = projectById(b.projectId)
                  const total = byProject.reduce((a, x) => a + x.minutes, 0)
                  return (
                    <li key={b.projectId ?? 'none'} className="grid grid-cols-[10rem_1fr_4.5rem_3rem] items-center gap-3 text-[13px]">
                      <ProjectLabel project={p} />
                      <div className="h-2 rounded-full bg-sunken">
                        <div className="h-full rounded-full" style={{ width: `${(b.minutes / byProject[0].minutes) * 100}%`, background: projectColor(p?.color) }} />
                      </div>
                      <span className="tnum text-right font-medium">{formatDuration(b.minutes)}</span>
                      <span className="tnum text-right text-xs text-muted">{Math.round((b.minutes / total) * 100)}%</span>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          <Card
            title={`${g} ${delta ? 'over / under target' : 'worked hours'}`}
            action={<Segmented size="sm" label="Chart mode" options={[{ value: 'worked', label: 'Worked' }, { value: 'delta', label: 'Over / under' }]} value={delta ? 'delta' : 'worked'} onChange={(v) => setDelta(v === 'delta')} />}
          >
            <BarChart
              key={`${range}-${delta}`}
              data={points.map((p) => ({ label: p.label, value: p.value, target: delta ? undefined : p.expected }))}
              mode={delta ? 'delta' : 'value'}
              height={220}
              title={`${g} ${delta ? 'delta' : 'worked'} hours`}
              format={hours}
            />
          </Card>

          <Card title="Average by weekday" action={<span className="text-[11px] text-faint">Bar is worked, tick is expected</span>}>
            <ul className="flex flex-col gap-3">
              {wd.map((d) => (
                <li key={d.label} className="grid grid-cols-[2.5rem_1fr_7rem] items-center gap-3 text-xs">
                  <span className="text-muted">{d.label}</span>
                  <div className="relative h-2 rounded-full bg-sunken">
                    <div className={cx('h-full rounded-full', d.expected > 0 && d.worked >= d.expected ? 'bg-over' : 'bg-accent')} style={{ width: `${(d.worked / wdMax) * 100}%` }} />
                    {d.expected > 0 && <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-fg/60" style={{ left: `${(d.expected / wdMax) * 100}%` }} title="Expected" />}
                  </div>
                  <span className="tnum text-right text-muted">{d.n ? `${formatDuration(d.worked)} / ${formatDuration(d.expected)}` : '–'}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Page>
  )
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Last six months against the monthly contract hours; the current month is still in progress. */
function HoursCard({ months, contractMin: goalMin }: { months: MonthTotal[]; contractMin: number }) {
  const done = months.slice(0, -1).filter((m) => m.countedMin > 0 || m.scheduleMin > 0)
  const hit = done.filter((m) => m.countedMin >= goalMin).length
  const cur = months[months.length - 1]
  return (
    <Card
      title="Monthly hours"
      action={
        <span className="tnum text-xs text-muted">
          {done.length ? (
            <>
              Met in <span className="font-medium text-fg">{hit}</span> of {done.length} {done.length === 1 ? 'month' : 'months'}
            </>
          ) : (
            formatDuration(goalMin) + ' a month'
          )}
        </span>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_12rem] md:items-center">
        <BarChart
          title="Hours per month against the monthly hours"
          data={months.map((m) => ({ label: MONTH_SHORT[Number(m.month.slice(5)) - 1], value: m.countedMin / 60, target: goalMin / 60 }))}
          format={hours}
          height={170}
          labelEvery={1}
          highlight={months.length - 1}
        />
        <div className="flex flex-col gap-3 border-line md:border-l md:pl-6">
          <Stat
            size="sm"
            label={`${MONTH_SHORT[Number(cur.month.slice(5)) - 1]} so far`}
            value={formatDuration(cur.countedMin)}
            valueTone={cur.countedMin >= goalMin ? 'over' : 'neutral'}
            hint={cur.countedMin >= goalMin ? 'Done' : `${formatDuration(goalMin - cur.countedMin)} left`}
          />
          <Stat size="sm" label="Per month" value={formatDuration(goalMin)} hint={cur.scheduleMin ? `Schedule: ${formatDuration(cur.scheduleMin)}` : undefined} />
        </div>
      </div>
    </Card>
  )
}

function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function Fact({ label, value, hint, tone: t }: { label: string; value: ReactNode; hint?: string; tone?: 'over' | 'under' }) {
  return (
    <div className="flex items-baseline justify-between gap-2 md:flex-col md:items-start md:gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cx('tnum m-0 font-medium', t === 'over' && 'text-over', t === 'under' && 'text-under')}>
        {value}
        {hint && <span className="ml-1.5 text-xs font-normal text-faint">{hint}</span>}
      </dd>
    </div>
  )
}
