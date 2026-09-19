import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  suffix?: ReactNode
  /** Right-align + tabular numerals, for hours/time values. */
  numeric?: boolean
}

export function Input({ label, hint, error, suffix, numeric, className, id, ...rest }: InputProps) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fid} className="text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <div
        className={cx(
          'no-drag flex h-8 items-center rounded-md border bg-raised px-2.5 transition-colors',
          'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25',
          error ? 'border-danger' : 'border-line-strong'
        )}
      >
        <input
          id={fid}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${fid}-d` : undefined}
          {...rest}
          className={cx(
            'min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint',
            numeric && 'tnum text-right',
            className
          )}
        />
        {suffix && <span className="ml-1.5 text-xs text-faint">{suffix}</span>}
      </div>
      {(error || hint) && (
        <p id={`${fid}-d`} className={cx('text-xs', error ? 'text-danger' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

export interface NumberFieldProps {
  label?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: ReactNode
  hint?: string
  error?: string
  /** Decimals shown, default 1. */
  precision?: number
}

/** Stepper number input, e.g. hours per weekday. */
export function NumberField({ label, value, onChange, min = 0, max = 24, step = 0.5, suffix, hint, error, precision = 1 }: NumberFieldProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 1000) / 1000))
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <div
        className={cx(
          'no-drag flex h-8 items-center overflow-hidden rounded-md border bg-raised',
          'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25',
          error ? 'border-danger' : 'border-line-strong'
        )}
      >
        <button type="button" aria-label="Decrease" onClick={() => onChange(clamp(value - step))} className="h-full w-7 text-muted hover:bg-sunken hover:text-fg">
          -
        </button>
        <input
          id={id}
          inputMode="decimal"
          value={Number.isFinite(value) ? value.toFixed(precision) : ''}
          onChange={(e) => {
            const n = parseFloat(e.target.value.replace(',', '.'))
            if (!Number.isNaN(n)) onChange(clamp(n))
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') (e.preventDefault(), onChange(clamp(value + step)))
            if (e.key === 'ArrowDown') (e.preventDefault(), onChange(clamp(value - step)))
          }}
          className="tnum min-w-0 w-14 flex-1 bg-transparent text-center text-[13px] outline-none"
        />
        {suffix && <span className="pr-1 text-xs text-faint">{suffix}</span>}
        <button type="button" aria-label="Increase" onClick={() => onChange(clamp(value + step))} className="h-full w-7 text-muted hover:bg-sunken hover:text-fg">
          +
        </button>
      </div>
      {(error || hint) && <p className={cx('text-xs', error ? 'text-danger' : 'text-muted')}>{error ?? hint}</p>}
    </div>
  )
}

export interface TimeFieldProps {
  label?: string
  /** "HH:MM" 24h */
  value: string
  onChange: (v: string) => void
  hint?: string
  error?: string
}

export function TimeField({ label, value, onChange, hint, error }: TimeFieldProps) {
  return <Input type="time" numeric label={label} value={value} onChange={(e) => onChange(e.target.value)} hint={hint} error={error} className="[color-scheme:inherit]" />
}
