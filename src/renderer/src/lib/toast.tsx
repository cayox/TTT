import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle, Info, WarningCircle, X, XCircle } from '@phosphor-icons/react'
import { cx } from '../components/ui/cx'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}

export interface ToastInput {
  /** Reusing an id replaces that toast and restarts its timer (e.g. repeated "Saved"). */
  id?: string
  kind?: ToastKind
  title: string
  description?: string
  actions?: ToastAction[]
  /** ms; null keeps it until dismissed. Defaults depend on kind and actions. */
  duration?: number | null
}

interface ToastItem extends Required<Pick<ToastInput, 'id' | 'kind' | 'title'>> {
  description?: string
  actions: ToastAction[]
  duration: number | null
  /** Bumped on replace so the timer animation restarts. */
  version: number
  leaving: boolean
}

type Opts = Omit<ToastInput, 'title' | 'kind'>
interface ToastApi {
  show: (t: ToastInput) => string
  dismiss: (id: string) => void
  success: (title: string, opts?: Opts) => string
  error: (title: string, opts?: Opts) => string
  warning: (title: string, opts?: Opts) => string
  info: (title: string, opts?: Opts) => string
}

const Ctx = createContext<ToastApi | null>(null)
const MAX = 4

const ICON = { success: CheckCircle, error: XCircle, warning: WarningCircle, info: Info }
const TONE = { success: 'text-over', error: 'text-danger', warning: 'text-accent', info: 'text-muted' }
const BAR = { success: 'bg-over', error: 'bg-danger', warning: 'bg-accent', info: 'bg-line-strong' }

function defaultDuration(kind: ToastKind, hasActions: boolean): number {
  if (kind === 'error') return 8000
  if (hasActions) return 7000
  return kind === 'warning' ? 6000 : 3200
}

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
    clearTimeout(timers.current.get(id))
    // Matches the exit animation length.
    timers.current.set(id, setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 180))
  }, [])

  const show = useCallback((t: ToastInput): string => {
    const id = t.id ?? `t${++seq}`
    const kind = t.kind ?? 'info'
    const actions = t.actions ?? []
    const duration = t.duration === undefined ? defaultDuration(kind, actions.length > 0) : t.duration
    clearTimeout(timers.current.get(id))
    setItems((xs) => {
      const prev = xs.find((x) => x.id === id)
      const item: ToastItem = { id, kind, title: t.title, description: t.description, actions, duration, version: (prev?.version ?? 0) + 1, leaving: false }
      const rest = xs.filter((x) => x.id !== id)
      return [...rest, item].slice(-MAX)
    })
    return id
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (title, o) => show({ ...o, title, kind: 'success' }),
      error: (title, o) => show({ ...o, title, kind: 'error' }),
      warning: (title, o) => show({ ...o, title, kind: 'warning' }),
      info: (title, o) => show({ ...o, title, kind: 'info' })
    }),
    [show, dismiss]
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <ol
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 m-0 flex w-[22rem] list-none flex-col gap-2 p-0"
        style={{ zIndex: 'var(--z-toast)' }}
      >
        {items.map((t) => (
          <ToastCard key={t.id} t={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </ol>
    </Ctx.Provider>
  )
}

function ToastCard({ t, onDismiss }: { t: ToastItem; onDismiss: () => void }) {
  const Icon = ICON[t.kind]
  return (
    <li
      role={t.kind === 'error' ? 'alert' : 'status'}
      aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
      className="group pointer-events-auto relative overflow-hidden rounded-xl border border-line bg-raised-solid shadow-pop"
      style={{ animation: t.leaving ? 'ttt-toast-out 180ms ease-in both' : 'ttt-toast-in 320ms var(--ease-out-expo) both' }}
    >
      <div className="flex items-start gap-3 py-3 pl-3.5 pr-2">
        <Icon size={18} weight="fill" className={cx('mt-px shrink-0', TONE[t.kind])} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[13px] font-medium leading-snug">{t.title}</p>
          {t.description && <p className="m-0 mt-0.5 select-text text-xs leading-snug text-muted">{t.description}</p>}
          {t.actions.length > 0 && (
            <div className="-ml-1.5 mt-2 flex flex-wrap gap-1">
              {t.actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => {
                    void a.onClick()
                    onDismiss()
                  }}
                  className="no-drag h-6 rounded-md px-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft active:scale-[0.97]"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="no-drag grid size-6 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-sunken hover:text-fg"
        >
          <X size={12} />
        </button>
      </div>
      {t.duration !== null && (
        // The bar's animation is the timer: it pauses on hover and dismisses when it ends.
        <span
          key={t.version}
          aria-hidden
          onAnimationEnd={onDismiss}
          className={cx('toast-timer absolute bottom-0 left-0 h-0.5 w-full origin-left opacity-60 group-hover:[animation-play-state:paused]', BAR[t.kind])}
          style={{ animation: `ttt-toast-timer ${t.duration}ms linear both`, ['--toast-duration' as string]: `${t.duration}ms` }}
        />
      )}
    </li>
  )
}

export function useToast(): ToastApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast outside ToastProvider')
  return v
}

/** "Error invoking remote method 'x': Error: msg" -> "msg" */
export function errorText(e: unknown): string {
  return String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
