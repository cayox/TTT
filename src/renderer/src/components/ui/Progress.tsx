import type { ReactNode } from 'react'
import { cx } from './cx'
import type { Tone } from './Stat'

const stroke: Record<Tone, string> = { neutral: 'var(--muted)', over: 'var(--over)', under: 'var(--under)', accent: 'var(--accent)' }

export interface ProgressRingProps {
  /** 0..1, values above 1 render a full ring */
  value: number
  size?: number
  thickness?: number
  tone?: Tone
  label?: string
  children?: ReactNode
}

export function ProgressRing({ value, size = 220, thickness = 10, tone = 'accent', label = 'Progress', children }: ProgressRingProps) {
  const v = Math.max(0, Math.min(1, value))
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke[tone]}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1), stroke 200ms' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export interface ProgressBarProps {
  value: number
  tone?: Tone
  label?: string
  className?: string
}
export function ProgressBar({ value, tone = 'accent', label = 'Progress', className }: ProgressBarProps) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className={cx('h-1.5 overflow-hidden rounded-full bg-sunken', className)}>
      <div className="h-full rounded-full transition-[width] duration-500 ease-out-expo" style={{ width: `${v * 100}%`, background: stroke[tone] }} />
    </div>
  )
}
