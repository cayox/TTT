import { useEffect, useState } from 'react'
import { AppShell, type NavId } from './components/ui'
import { OPEN_ONBOARDING, Onboarding } from './components/Onboarding'
import { TrackerProvider, useTracker } from './lib/tracker'
import { ToastProvider } from './lib/toast'
import { TodayPage } from './pages/Today'
import { HistoryPage } from './pages/History'
import { StatsPage } from './pages/Stats'
import { SettingsPage } from './pages/Settings'

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
  useEffect(() => {
    const open = (): void => setTour(true)
    window.addEventListener(OPEN_ONBOARDING, open)
    return () => window.removeEventListener(OPEN_ONBOARDING, open)
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
    <AppShell active={active} onNavigate={setActive}>
      <Page key={active} />
    </AppShell>
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
