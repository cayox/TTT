import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type Tone = 'neutral' | 'over' | 'under' | 'accent'

const toneText: Record<Tone, string> = { neutral: 'text-fg', over: 'text-over', under: 'text-under', accent: 'text-accent' }
const toneBadge: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted',
  over: 'bg-over-soft text-over',
  under: 'bg-under-soft text-under',
  accent: 'bg-accent-soft text-accent'
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}
export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return <span {...rest} className={cx('tnum inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium', toneBadge[tone], className)} />
}

export interface StatProps {
  label: string
  value: ReactNode
  /** e.g. "+0:42". Colored by deltaTone. */
  delta?: string
  deltaTone?: Tone
  hint?: string
  className?: string
}
export function Stat({ label, value, delta, deltaTone = 'neutral', hint, className }: StatProps) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="tnum font-display text-[26px] font-semibold leading-none tracking-tight">{value}</span>
        {delta && <span className={cx('tnum text-xs font-medium', toneText[deltaTone])}>{delta}</span>}
      </div>
      {hint && <div className="text-xs text-faint">{hint}</div>}
    </div>
  )
}
