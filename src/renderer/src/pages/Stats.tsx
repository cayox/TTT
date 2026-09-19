import { useEffect, useMemo, useState } from 'react'
import { BarChart, Card, Segmented, Stat } from '../components/ui'
import { formatDelta, formatDuration } from '../../../shared/format'
import type { Range, RangeStats } from '../../../shared/time'
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

  useEffect(() => {
    let live = true
    window.api['stats:range'](range).then((s) => live && setStats(s))
    return () => {
      live = false
    }
  }, [range])

  const points = useMemo(() => (stats ? chartPoints(stats.days, range, delta) : []), [stats, range, delta])
  const wd = useMemo(() => (stats ? weekdayAverages(stats.days) : []), [stats])
  const empty = !stats || stats.totalWorked === 0
  const wdMax = Math.max(1, ...wd.map((d) => Math.max(d.worked, d.expected)))
  const g = GRAN[granularity(range)]

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Stats</h1>
        <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
      </header>

      {empty ? (
        <Card>
          <div className="grid place-items-center gap-1 py-16 text-center">
            <p className="text-sm font-medium">No tracked time in this range</p>
            <p className="text-xs text-muted">Start a session on the Today page and your stats will appear here.</p>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
              <Stat label="Total worked" value={formatDuration(stats.totalWorked)} />
              <Stat label="Expected" value={formatDuration(stats.totalExpected)} />
              <Stat label="Balance" value={formatDelta(stats.balance)} deltaTone={tone(stats.balance)} hint={stats.balance >= 0 ? 'Over target' : 'Under target'} className={stats.balance > 0 ? 'text-over' : stats.balance < 0 ? 'text-under' : ''} />
              <Stat label="Avg per workday" value={formatDuration(stats.avgWorkedPerWorkday)} />
              <Stat label="Best day" value={stats.bestDay ? formatDuration(stats.bestDay.workedMin) : '-'} hint={stats.bestDay?.date} />
              <Stat label="Longest streak" value={`${stats.longestStreak} ${stats.longestStreak === 1 ? 'day' : 'days'}`} />
              <Stat label="Overtime days" value={stats.overtimeDays} />
              <Stat label="Undertime days" value={stats.undertimeDays} />
            </div>
          </Card>

          <Card
            title={`${g} ${delta ? 'over / under target' : 'worked hours'}`}
            action={<Segmented size="sm" label="Chart mode" options={[{ value: 'worked', label: 'Worked' }, { value: 'delta', label: 'Over / under' }]} value={delta ? 'delta' : 'worked'} onChange={(v) => setDelta(v === 'delta')} />}
          >
            <BarChart key={`${range}-${delta}`} data={points} mode={delta ? 'delta' : 'value'} height={220} title={`${g} ${delta ? 'delta' : 'worked'} hours`} format={hours} />
          </Card>

          <Card title="Average by weekday">
            <ul className="flex flex-col gap-2.5">
              {wd.map((d) => (
                <li key={d.label} className="grid grid-cols-[2.5rem_1fr_7rem] items-center gap-3 text-xs">
                  <span className="text-muted">{d.label}</span>
                  <div className="relative h-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(d.worked / wdMax) * 100}%` }} />
                    {d.expected > 0 && <div className="absolute -top-0.5 h-3 w-px bg-fg" style={{ left: `${(d.expected / wdMax) * 100}%` }} title="Expected" />}
                  </div>
                  <span className="tnum text-right text-muted">{d.n ? `${formatDuration(d.worked)} / ${formatDuration(d.expected)}` : '-'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-faint">Bar is average worked, tick is expected.</p>
          </Card>
        </>
      )}
    </div>
  )
}
