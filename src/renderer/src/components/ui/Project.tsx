import { useId } from 'react'
import { CaretUpDown } from '@phosphor-icons/react'
import type { Project, ProjectColor } from '../../../../shared/types'
import { cx } from './cx'

export const projectColor = (c: ProjectColor | undefined): string => (c ? `var(--p-${c})` : 'var(--faint)')

export function ProjectDot({ color, className }: { color?: ProjectColor; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: projectColor(color) }} />
}

/** Dot + name; "No project" when unassigned. */
export function ProjectLabel({ project, className }: { project?: Project; className?: string }) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', className)}>
      <ProjectDot color={project?.color} />
      <span className={cx('truncate', !project && 'text-faint')}>{project ? project.name : 'No project'}</span>
    </span>
  )
}

export interface ProjectSelectProps {
  projects: Project[]
  value: number | null
  onChange: (id: number | null) => void
  label?: string
  /** Accessible name when there is no visible label. */
  ariaLabel?: string
  /** Adds a "No project" (or custom) choice mapped to null. */
  noneLabel?: string
  /** 'field' is a bordered input; 'inline' is borderless text for pills and rows. */
  variant?: 'field' | 'inline'
  disabled?: boolean
  className?: string
}

/** Native select (real macOS menu, keyboard for free) dressed with the project dot. */
export function ProjectSelect({ projects, value, onChange, label, ariaLabel, noneLabel, variant = 'field', disabled, className }: ProjectSelectProps) {
  const id = useId()
  const selected = projects.find((p) => p.id === value)
  const options = projects.filter((p) => !p.archived || p.id === value)
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <div
        className={cx(
          'no-drag relative flex items-center gap-1.5 transition-colors',
          variant === 'field'
            ? 'h-8 rounded-md border border-line-strong bg-raised-solid pl-2.5 pr-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25'
            : 'h-6 rounded-md px-1.5 hover:bg-sunken focus-within:ring-2 focus-within:ring-accent/40',
          disabled && 'opacity-45'
        )}
      >
        <ProjectDot color={selected?.color} />
        <span className={cx('min-w-0 flex-1 truncate text-[13px]', !selected && 'text-faint', variant === 'inline' && 'text-[12.5px] font-medium')}>
          {selected ? selected.name : (noneLabel ?? 'No project')}
        </span>
        <CaretUpDown size={12} className="shrink-0 text-faint" />
        <select
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="absolute inset-0 cursor-default opacity-0"
        >
          {(noneLabel !== undefined || value === null) && <option value="">{noneLabel ?? 'No project'}</option>}
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.archived ? ' (archived)' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** Row of color swatches as a radio group. */
export function ColorPicker({ value, onChange, colors, label }: { value: ProjectColor; onChange: (c: ProjectColor) => void; colors: readonly ProjectColor[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className={cx(
            'no-drag grid size-5 place-items-center rounded-full transition-transform duration-150 hover:scale-110 active:scale-95',
            c === value && 'ring-2 ring-fg/60 ring-offset-2 ring-offset-[var(--raised-solid)]'
          )}
        >
          <span className="size-3.5 rounded-full" style={{ background: projectColor(c) }} />
        </button>
      ))}
    </div>
  )
}
