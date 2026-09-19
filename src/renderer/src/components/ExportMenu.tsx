import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CaretDown, Copy, Export, FilePdf, WhatsappLogo } from '@phosphor-icons/react'
import { Button } from './ui'
import { errorText, useToast } from '../lib/toast'

function Item({ icon, title, hint, onClick, disabled }: { icon: ReactNode; title: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="no-drag flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-sunken focus-visible:bg-sunken disabled:opacity-45"
    >
      <span className="mt-0.5 text-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  )
}

/** Export the given month: signable PDF, or a WhatsApp-ready summary. */
export function ExportMenu({ year, month, label }: { year: number; month: number; label: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const act = async (fn: () => Promise<void>): Promise<void> => {
    setOpen(false)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      console.error('Export failed', e)
      const msg = errorText(e)
      toast.error('Export failed', {
        description: msg.startsWith('No handler registered') || msg.includes('is not a function')
          ? 'This running TTT is older than the export feature. Quit it from the menu bar and start it again.'
          : msg
      })
    } finally {
      setBusy(false)
    }
  }

  const pdf = (): Promise<void> =>
    act(async () => {
      const path = await window.api['export:pdf'](year, month)
      if (!path) return
      toast.success('Timesheet saved', {
        id: 'export',
        description: path.split('/').pop(),
        actions: [
          { label: 'Open', onClick: () => void window.api['export:openLast']() },
          { label: 'Show in Finder', onClick: () => void window.api['export:revealLast']() },
          { label: 'Share…', onClick: () => void window.api['export:shareLast']() }
        ]
      })
    })
  const copy = (): Promise<void> =>
    act(async () => {
      await window.api['export:copyText'](year, month)
      toast.success('Copied for WhatsApp', { id: 'export', description: `${label} summary. Paste it into any chat.` })
    })
  const whatsapp = (): Promise<void> =>
    act(async () => {
      if (await window.api['export:openWhatsapp'](year, month)) return
      toast.warning('WhatsApp is not installed', {
        id: 'export',
        description: 'Copy the summary instead and paste it into WhatsApp Web or on your phone.',
        actions: [{ label: 'Copy summary', onClick: () => void copy() }]
      })
    })

  return (
    <div ref={ref} className="relative">
      <Button icon={<Export size={14} />} disabled={busy} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {busy ? 'Exporting…' : 'Export'}
        <CaretDown size={11} className="text-faint" />
      </Button>

      {open && (
        <div
          role="menu"
          aria-label={`Export ${label}`}
          className="absolute right-0 top-[calc(100%+6px)] w-72 rounded-lg border border-line bg-raised-solid p-1.5 shadow-pop"
          style={{ zIndex: 'var(--z-pop)', animation: 'ttt-rise 180ms var(--ease-out-expo) both' }}
        >
          <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium text-faint">{label}</p>
          <Item
            icon={<FilePdf size={17} />}
            title="Timesheet PDF…"
            hint="A4 with daily times, totals and signature lines"
            onClick={() => void pdf()}
          />
          <Item
            icon={<Copy size={17} />}
            title="Copy for WhatsApp"
            hint="Formatted summary, ready to paste into a chat"
            onClick={() => void copy()}
          />
          <Item
            icon={<WhatsappLogo size={17} />}
            title="Open in WhatsApp"
            hint="Starts a message with the summary; you pick the chat"
            onClick={() => void whatsapp()}
          />
        </div>
      )}

    </div>
  )
}
