import type { ReactNode } from 'react'
import { cx } from './cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}
export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (v: T) => void
  label?: string
  size?: 'sm' | 'md'
}

export function Segmented<T extends string>({ options, value, onChange, label, size = 'md' }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('no-drag inline-flex gap-0.5 rounded-md bg-sunken p-0.5', size === 'sm' ? 'h-7' : 'h-8')}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-[5px] px-3 text-xs font-medium transition-[background-color,color,box-shadow] duration-150',
              on ? 'bg-raised text-fg shadow-card' : 'text-muted hover:text-fg'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
