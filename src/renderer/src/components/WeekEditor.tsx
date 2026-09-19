import { useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Segmented, cx } from './ui'
import type { Schedule } from '../../../shared/types'
import { formatDurationLong } from '../../../shared/format'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MAX_DAY = 12 * 60
const PRESETS: { label: string; days: Schedule }[] = [
  { label: '8h, Mon to Fri', days: [480, 480, 480, 480, 480, 0, 0] },
  { label: '7.5h, Mon to Fri', days: [450, 450, 450, 450, 450, 0, 0] },
  { label: '4 days of 8h', days: [480, 480, 480, 480, 0, 0, 0] },
  { label: 'Half days', days: [240, 240, 240, 240, 240, 0, 0] }
]
const hm = (m: number): string => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

/** One weekday as a vertical slider: drag, click, or use the arrow keys (15 min steps). */
function DayBar({ index, value, onChange, height }: { index: number; value: number; onChange: (m: number) => void; height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const fromY = (y: number): number => {
    const r = ref.current!.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (r.bottom - y) / r.height))
    return Math.round((f * MAX_DAY) / 15) * 15
  }
  const onKey = (e: ReactKeyboardEvent): void => {
    const d = { ArrowUp: 15, ArrowRight: 15, ArrowDown: -15, ArrowLeft: -15, PageUp: 60, PageDown: -60 }[e.key]
    if (d !== undefined) (e.preventDefault(), onChange(Math.max(0, Math.min(MAX_DAY, value + d))))
    else if (e.key === 'Home') (e.preventDefault(), onChange(0))
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={`${DAY_NAMES[index]} hours`}
        aria-valuemin={0}
        aria-valuemax={MAX_DAY}
        aria-valuenow={value}
        aria-valuetext={value ? formatDurationLong(value) : 'Day off'}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          onChange(fromY(e.clientY))
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && onChange(fromY(e.clientY))}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        style={{ height }}
        className="no-drag group relative w-full cursor-ns-resize overflow-hidden rounded-lg border border-line bg-sunken"
      >
        {/* 4h and 8h guides */}
        <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-line-strong" style={{ bottom: `${(480 / MAX_DAY) * 100}%` }} />
        <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(240 / MAX_DAY) * 100}%` }} />
        <span
          aria-hidden
          className={cx(
            'absolute inset-x-0 bottom-0 rounded-[7px] bg-accent group-hover:bg-accent-hover',
            !dragging && 'transition-[height] duration-300 ease-out-expo'
          )}
          style={{ height: `${(value / MAX_DAY) * 100}%` }}
        />
      </div>
      <span className="text-xs font-medium">{DAYS[index]}</span>
      <span className={cx('tnum -mt-1.5 text-xs', value ? 'text-muted' : 'text-faint')}>{value ? hm(value) : 'Off'}</span>
    </div>
  )
}

export interface WeekEditorProps {
  schedule: Schedule
  onChange: (s: Schedule) => void
  weekStart: 0 | 6
  onWeekStart: (w: 0 | 6) => void
  /** Bar height in px. */
  height?: number
}

/** Expected hours per weekday as draggable bars, with presets, the weekly total and the first day of the week. */
export function WeekEditor({ schedule, onChange, weekStart, onWeekStart, height = 160 }: WeekEditorProps) {
  const total = schedule.reduce((a, b) => a + b, 0)
  const order = weekStart === 6 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]
  const workdays = schedule.filter((m) => m > 0).length
  return (
    <div className="flex flex-col">
      <div className="mb-5 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const on = p.days.every((m, i) => m === schedule[i])
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange([...p.days])}
              className={cx(
                'no-drag h-7 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
                on ? 'border-accent bg-accent-soft text-fg' : 'border-line-strong text-muted hover:bg-sunken hover:text-fg'
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-7 gap-2.5">
        {order.map((i) => (
          <DayBar key={i} index={i} height={height} value={schedule[i]} onChange={(m) => onChange(schedule.map((v, j) => (j === i ? m : v)))} />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
        <div>
          <div className="font-display tnum text-[26px] font-semibold leading-none tracking-tight">{formatDurationLong(total) || '0h'}</div>
          <div className="mt-1.5 text-xs text-muted">
            a week across {workdays} {workdays === 1 ? 'day' : 'days'}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted">Week starts on</span>
          <Segmented
            size="sm"
            label="Week start"
            value={String(weekStart) as '0' | '6'}
            onChange={(v) => onWeekStart(Number(v) as 0 | 6)}
            options={[
              { value: '0', label: 'Monday' },
              { value: '6', label: 'Sunday' }
            ]}
          />
        </div>
      </div>
    </div>
  )
}
