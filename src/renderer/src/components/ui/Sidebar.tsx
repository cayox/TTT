import type { ReactNode } from 'react'
import { CalendarBlank, ChartBar, ClockCountdown, GearSix } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cx } from './cx'

export type NavId = 'today' | 'history' | 'stats' | 'settings'

export const NAV_ITEMS: { id: NavId; label: string; icon: Icon }[] = [
  { id: 'today', label: 'Today', icon: ClockCountdown },
  { id: 'history', label: 'History', icon: CalendarBlank },
  { id: 'stats', label: 'Stats', icon: ChartBar },
  { id: 'settings', label: 'Settings', icon: GearSix }
]

export interface SidebarProps {
  active: NavId
  onNavigate: (id: NavId) => void
  footer?: ReactNode
}

/** Translucent (vibrancy shows through), traffic-light safe zone on top. */
export function Sidebar({ active, onNavigate, footer }: SidebarProps) {
  return (
    <aside className="drag flex w-[196px] shrink-0 flex-col border-r border-line bg-sidebar px-2.5 pb-3 pt-12 backdrop-blur-2xl backdrop-saturate-150">
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ id, label, icon: I }) => {
          const on = id === active
          return (
            <button
              key={id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => onNavigate(id)}
              className={cx(
                'no-drag flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150',
                on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-sunken/70 hover:text-fg'
              )}
            >
              <I size={17} weight={on ? 'fill' : 'regular'} />
              {label}
            </button>
          )
        })}
      </nav>
      <div className="mt-auto no-drag">{footer}</div>
    </aside>
  )
}

export interface AppShellProps extends SidebarProps {
  children: ReactNode
}

/** Sidebar + solid main pane with a draggable titlebar strip. */
export function AppShell({ active, onNavigate, footer, children }: AppShellProps) {
  return (
    <div className="flex h-full w-full">
      <Sidebar active={active} onNavigate={onNavigate} footer={footer} />
      <main className="relative flex min-w-0 flex-1 flex-col bg-bg">
        <div className="drag absolute inset-x-0 top-0 h-10" aria-hidden />
        <div className="flex-1 overflow-y-auto px-8 pb-8 pt-12">{children}</div>
      </main>
    </div>
  )
}
