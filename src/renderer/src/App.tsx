import { useEffect, useState } from 'react'
import { AppShell, type NavId } from './components/ui'
import { OPEN_ONBOARDING, Onboarding } from './components/Onboarding'
import { UpdateDialog } from './components/UpdateDialog'
import { TrackerProvider, useTracker } from './lib/tracker'
import { ToastProvider } from './lib/toast'
import { TodayPage } from './pages/Today'
import { HistoryPage } from './pages/History'
import { StatsPage } from './pages/Stats'
import { SettingsPage } from './pages/Settings'
import { NAVIGATE } from './lib/nav'

const PAGES: Record<NavId, () => React.JSX.Element> = {
  today: TodayPage,
  history: HistoryPage,
  stats: StatsPage,
  settings: SettingsPage
}

/** Shows the welcome flow on first run (or when reopened from Settings), the app otherwise. */
function Root() {
  const { settings } = useTracker()
  const [active, setActive] = useState<NavId>('today')
  const [tour, setTour] = useState(false)
  /** Bumped when all data was replaced, so every page mounts fresh. */
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const open = (): void => setTour(true)
    window.addEventListener(OPEN_ONBOARDING, open)
    const go = (page: string): void => {
      if (page in PAGES) setActive(page as NavId)
    }
    const onNav = (e: Event): void => go((e as CustomEvent<string>).detail)
    window.addEventListener(NAVIGATE, onNav)
    const off = window.events.onNavigate(go)
    // An import replaced everything: start over from Today with fresh data.
    const offD = window.events.onDataReplaced(() => setReload((n) => n + 1))
    return () => {
      window.removeEventListener(OPEN_ONBOARDING, open)
      window.removeEventListener(NAVIGATE, onNav)
      off()
      offD()
    }
  }, [])

  // Until settings arrive we cannot tell which one to show; an empty titlebar avoids a flash of the wrong one.
  if (!settings) return <div className="drag h-14" />
  if (tour || !settings.onboarded)
    return (
      <Onboarding
        onDone={() => {
          setTour(false)
          setActive('today')
        }}
      />
    )
  const Page = PAGES[active]
  return (
    <>
      <AppShell active={active} onNavigate={setActive}>
        <Page key={`${active}-${reload}`} />
      </AppShell>
      <UpdateDialog />
    </>
  )
}

export function App() {
  return (
    <ToastProvider>
      <TrackerProvider>
        <Root />
      </TrackerProvider>
    </ToastProvider>
  )
}
