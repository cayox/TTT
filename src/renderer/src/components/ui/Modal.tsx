import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from '@phosphor-icons/react'
import { IconButton } from './Button'
import { cx } from './cx'

export interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  /** Sticky footer, usually the actions. */
  footer?: ReactNode
  className?: string
  children: ReactNode
}

/** Centered dialog over a dimmed backdrop. Escape and a click outside close it. */
export function Modal({ open, title, description, onClose, footer, className, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') (e.stopPropagation(), onClose())
    }
    window.addEventListener('keydown', onKey)
    // Focus moves into the dialog so Escape and Tab land here and not on the page behind it.
    panel.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      className="no-drag fixed inset-0 z-50 grid place-items-center bg-black/35 p-6 backdrop-blur-sm"
      style={{ animation: 'ttt-fade 160ms var(--ease-out-expo)' }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ animation: 'ttt-rise 220ms var(--ease-out-expo)' }}
        className={cx('flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-raised-solid shadow-pop outline-none', className)}
      >
        <header className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <IconButton size="sm" label="Close" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-1">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}
