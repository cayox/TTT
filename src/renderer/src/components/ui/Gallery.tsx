import { useState } from 'react'
import { Play, Plus } from '@phosphor-icons/react'
import { useTheme } from '../../lib/theme'
import type { Theme } from '../../lib/theme'
import { AppShell, Badge, BarChart, Button, Card, IconButton, Input, NumberField, ProgressBar, ProgressRing, Segmented, Stat, TimeField, Toggle } from './index'
import type { NavId } from './index'

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const worked = [8.4, 7.1, 9.2, 6.3, 7.8, 0, 2.1].map((value, i) => ({ label: days[i], value }))
const delta = [0.4, -0.9, 1.2, -1.7, -0.2, 0, 0.6, 0.3, -0.4, 1.1, -0.8, 0.2].map((value, i) => ({ label: `${i + 1}`, value }))
const fmtH = (v: number) => `${v.toFixed(1)}h`
const fmtD = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}h`

/** Temporary design-system showcase. Not wired into App. */
export function Gallery() {
  const { theme, setTheme } = useTheme()
  const [nav, setNav] = useState<NavId>('today')
  const [on, setOn] = useState(true)
  const [hrs, setHrs] = useState(7.5)
  const [range, setRange] = useState('30d')
  return (
    <AppShell active={nav} onNavigate={setNav} footer={<Segmented<Theme> size="sm" label="Theme" value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Auto' }]} />}>
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Design system</h1>
        <div className="grid grid-cols-[auto_1fr] gap-6">
          <ProgressRing value={0.72} tone="accent" label="Today">
            <div>
              <div className="tnum font-display text-4xl font-semibold tracking-tight">5:46</div>
              <div className="text-xs text-muted">of 8:00</div>
            </div>
          </ProgressRing>
          <div className="flex flex-col justify-center gap-4">
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Balance" value="+3:12" delta="+0:42" deltaTone="over" />
              <Stat label="This week" value="31:40" delta="-1:20" deltaTone="under" />
              <Stat label="Average" value="7:38" hint="last 30 days" />
            </div>
            <ProgressBar value={0.72} label="Today" />
            <div className="flex gap-2">
              <Button variant="primary" size="lg" icon={<Play weight="fill" size={14} />}>Start</Button>
              <Button>Pause</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Delete</Button>
              <IconButton label="Add session"><Plus size={16} /></IconButton>
            </div>
          </div>
        </div>
        <Card title="Daily delta" action={<Segmented size="sm" value={range} onChange={setRange} options={[{ value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: '1y', label: '1y' }]} />}>
          <BarChart data={delta} mode="delta" title="Daily over and under time" format={fmtD} />
        </Card>
        <Card title="Worked hours">
          <BarChart data={worked} title="Hours worked per weekday" format={fmtH} />
        </Card>
        <Card title="Settings">
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Monday" value={hrs} onChange={setHrs} suffix="h" />
            <TimeField label="Start" value="09:00" onChange={() => {}} />
            <Input label="Wi-Fi network" placeholder="Office" hint="Auto-start when connected" />
            <Input label="Grace minutes" numeric defaultValue="abc" error="Enter a number" />
            <Toggle label="Launch at login" description="Start in the menu bar" checked={on} onChange={setOn} />
            <div className="flex items-center gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="over">+0:42</Badge>
              <Badge tone="under">-1:10</Badge>
              <Badge tone="accent">Running</Badge>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
