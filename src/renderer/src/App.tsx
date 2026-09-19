import { useState } from 'react'
import { AppShell, type NavId } from './components/ui'
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

export function App() {
  const [active, setActive] = useState<NavId>('today')
  const Page = PAGES[active]
  return (
    <AppShell active={active} onNavigate={setActive}>
      <Page />
    </AppShell>
  )
}
