import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  action?: ReactNode
  padded?: boolean
}

export function Card({ title, action, padded = true, className, children, ...rest }: CardProps) {
  return (
    <section {...rest} className={cx('rounded-xl border border-line bg-raised shadow-card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between px-4 pt-3.5">
          <h3 className="text-[12.5px] font-medium text-muted">{title}</h3>
          {action}
        </header>
      )}
      <div className={cx(padded && 'p-4', !!title && padded && 'pt-2.5')}>{children}</div>
    </section>
  )
}
