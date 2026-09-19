import { cx } from './cx'

export interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-6">
      {(label || description) && (
        <div className="min-w-0">
          {label && <div className="text-[13px] font-medium">{label}</div>}
          {description && <div className="text-xs text-muted">{description}</div>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'no-drag relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-45',
          checked ? 'bg-accent' : 'bg-line-strong'
        )}
      >
        <span
          className={cx(
            'absolute left-0.5 top-0.5 size-[18px] rounded-full bg-white shadow-card transition-transform duration-200 ease-out-expo',
            checked && 'translate-x-4'
          )}
        />
      </button>
    </div>
  )
}
