import { useEffect, useId, useState } from 'react'
import { Minus, Plus } from '@phosphor-icons/react'
import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from './cx'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  /** Marks the field invalid (red border). Explain the problem in a toast, not under the field. */
  error?: boolean
  suffix?: ReactNode
  /** Right-align + tabular numerals, for hours/time values. */
  numeric?: boolean
  /** Red border without message text (the message goes to a toast). */
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

export function Input({ label, error, suffix, numeric, invalid, className, id, ref, ...rest }: InputProps) {
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
          error || invalid ? 'border-danger' : 'border-line-strong'
        )}
      >
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error || !!invalid}
          {...rest}
          className={cx(
            'min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint',
            numeric && 'tnum text-right',
            className
          )}
        />
        {suffix && <span className="ml-1.5 text-xs text-faint">{suffix}</span>}
      </div>
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
  /** Marks the field invalid (red border). Explain the problem in a toast, not under the field. */
  error?: boolean
  /** Decimals shown, default 1. */
  precision?: number
}

/** Stepper number input, e.g. hours per weekday. */
export function NumberField({ label, value, onChange, min = 0, max = 24, step = 0.5, suffix, error, precision = 1 }: NumberFieldProps) {
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
        <button type="button" aria-label="Decrease" onClick={() => onChange(clamp(value - step))} className="grid h-full w-7 place-items-center text-muted transition-colors hover:bg-sunken hover:text-fg">
          <Minus size={12} />
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
        <button type="button" aria-label="Increase" onClick={() => onChange(clamp(value + step))} className="grid h-full w-7 place-items-center text-muted transition-colors hover:bg-sunken hover:text-fg">
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}

export interface TimeFieldProps {
  label?: string
  /** "HH:MM" 24h */
  value: string
  onChange: (v: string) => void
  /** Marks the field invalid (red border). Explain the problem in a toast, not under the field. */
  error?: boolean
  invalid?: boolean
  ariaLabel?: string
}

export function TimeField({ label, value, onChange, error, invalid, ariaLabel }: TimeFieldProps) {
  return <Input type="time" numeric label={label} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} error={error} invalid={invalid} className="[color-scheme:inherit]" />
}

const pad2 = (n: number): string => String(n).padStart(2, '0')
const showDuration = (min: number): string => `${Math.floor(min / 60)}:${pad2(min % 60)}`
/** Accepts "7:30", "7.5", "7,5" or "7" (hours). Returns minutes or null. */
function parseDuration(v: string): number | null {
  const t = v.trim()
  const hm = /^(\d{1,2}):(\d{1,2})$/.exec(t)
  if (hm) return Number(hm[2]) < 60 ? Number(hm[1]) * 60 + Number(hm[2]) : null
  const n = Number(t.replace(',', '.'))
  return t !== '' && Number.isFinite(n) ? Math.round(n * 60) : null
}

export interface DurationFieldProps {
  /** Minutes */
  value: number
  onChange: (min: number) => void
  label?: string
  /** Accessible name when there is no visible label. */
  ariaLabel?: string
  step?: number
  max?: number
}

/** Duration stepper shown as H:MM (not a clock time). Typing commits on blur or Enter. */
export function DurationField({ value, onChange, label, ariaLabel, step = 15, max = 24 * 60 }: DurationFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState(showDuration(value))
  useEffect(() => {
    setDraft(showDuration(value))
  }, [value])
  const clamp = (m: number): number => Math.min(max, Math.max(0, m))
  const commit = (): void => {
    const m = parseDuration(draft)
    if (m === null) setDraft(showDuration(value))
    else if (clamp(m) !== value) onChange(clamp(m))
    else setDraft(showDuration(value))
  }
  const btn = 'grid h-full w-6 place-items-center text-muted transition-colors hover:bg-sunken hover:text-fg'
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <div className="no-drag flex h-7 w-[7.5rem] items-center overflow-hidden rounded-md border border-line-strong bg-raised-solid focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
        <button type="button" tabIndex={-1} aria-label="Decrease" onClick={() => onChange(clamp(value - step))} className={btn}>
          <Minus size={11} />
        </button>
        <input
          id={id}
          aria-label={ariaLabel}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'ArrowUp') (e.preventDefault(), onChange(clamp(value + step)))
            if (e.key === 'ArrowDown') (e.preventDefault(), onChange(clamp(value - step)))
          }}
          className={cx('tnum min-w-0 flex-1 bg-transparent text-center text-[13px] outline-none', value === 0 && 'text-faint')}
        />
        <button type="button" tabIndex={-1} aria-label="Increase" onClick={() => onChange(clamp(value + step))} className={btn}>
          <Plus size={11} />
        </button>
      </div>
    </div>
  )
}
