import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-card',
  secondary: 'bg-raised text-fg border border-line-strong hover:bg-sunken shadow-card',
  ghost: 'text-muted hover:text-fg hover:bg-sunken',
  danger: 'bg-danger text-white hover:brightness-110 shadow-card'
}
const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3.5 text-[13px] gap-2',
  lg: 'h-11 px-6 text-sm gap-2.5 rounded-lg'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'no-drag inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium',
        'transition-[transform,background-color,filter] duration-150 ease-out-expo active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required accessible name (no tooltip component). */
  label: string
  size?: 'sm' | 'md'
  active?: boolean
}

export function IconButton({ label, size = 'md', active, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={cx(
        'no-drag inline-flex shrink-0 items-center justify-center rounded-md text-muted',
        'transition-[transform,background-color,color] duration-150 hover:bg-sunken hover:text-fg active:scale-95',
        'disabled:pointer-events-none disabled:opacity-45',
        active && 'bg-accent-soft text-accent',
        size === 'sm' ? 'size-6' : 'size-8',
        className
      )}
    >
      {children}
    </button>
  )
}
