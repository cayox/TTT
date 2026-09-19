import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Card, Input, NumberField, Segmented, Toggle, cx } from '../components/ui'
import { useTheme } from '../lib/theme'
import type { Theme } from '../lib/theme'
import { DEFAULT_SCHEDULE, DEFAULT_SETTINGS } from '../../../shared/types'
import type { DayKind, Schedule, Settings } from '../../../shared/types'
import { formatDuration } from '../../../shared/format'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const CREDIT: { kind: DayKind; label: string; text: string }[] = [
  { kind: 'vacation', label: 'Vacation', text: 'Counts as a full working day at your expected hours.' },
  { kind: 'sick', label: 'Sick days', text: 'Counts as a full working day at your expected hours.' },
  { kind: 'holiday', label: 'Public holidays', text: 'Counts as a full working day at your expected hours.' }
]

const PRESETS: { label: string; make: () => Schedule }[] = [
  { label: '8h Mon-Fri', make: () => [480, 480, 480, 480, 480, 0, 0] },
  { label: '7.5h Mon-Fri', make: () => [450, 450, 450, 450, 450, 0, 0] },
  { label: '4 x 8h', make: () => [480, 480, 480, 480, 0, 0, 0] },
  { label: 'Clear', make: () => [0, 0, 0, 0, 0, 0, 0] }
]

/** Replace once the wifi IPC channel exists. */
async function detectSsid(): Promise<string | null> {
  try {
    const fn = (window.api as any)['wifi:current']
    if (typeof fn !== 'function') return null
    const r = await fn()
    return typeof r === 'string' && r ? r : null
  } catch {
    return null
  }
}

const toClock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const fromClock = (v: string) => {
  const [h, m] = v.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,14rem)_1fr] md:gap-8">
      <div>
        <h2 className="text-[13px] font-medium">{title}</h2>
        {description && <p className="mt-1 max-w-[32ch] text-xs text-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    Promise.all([window.api['schedule:get'](), window.api['settings:get']()])
      .then(([sch, s]) => {
        setSchedule(sch)
        setSettings(s)
        if (s.theme !== theme) setTheme(s.theme as Theme)
      })
      .finally(() => setLoaded(true))
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flash = useCallback(() => {
    setSaved(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSaved(false), 1600)
  }, [])

  const patch = useCallback(
    (p: Partial<Settings>) => {
      setSettings((s) => ({ ...s, ...p }))
      window.api['settings:set'](p).then(flash)
    },
    [flash]
  )

  const saveSchedule = useCallback(
    (next: Schedule) => {
      setSchedule(next)
      window.api['schedule:set'](next).then(flash)
    },
    [flash]
  )

  const setDay = (i: number, min: number) => saveSchedule(schedule.map((v, j) => (j === i ? min : v)))
  const total = schedule.reduce((a, b) => a + b, 0)
  const order = settings.weekStart === 6 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]

  // SSIDs
  const [draft, setDraft] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detectMsg, setDetectMsg] = useState<string | null>(null)
  const addSsid = (name: string) => {
    const n = name.trim()
    if (!n || settings.workSsids.includes(n)) return
    patch({ workSsids: [...settings.workSsids, n] })
    setDraft('')
  }
  const useCurrent = async () => {
    setDetecting(true)
    setDetectMsg(null)
    const ssid = await detectSsid()
    setDetecting(false)
    if (ssid) addSsid(ssid)
    else setDetectMsg('Could not detect the current network. Type its name instead.')
  }

  const toggleCredit = (k: DayKind, on: boolean) =>
    patch({ creditKinds: on ? [...new Set([...settings.creditKinds, k])] : settings.creditKinds.filter((x) => x !== k) })

  if (!loaded) return <div className="p-8 text-sm text-muted">Loading</div>

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <span
          aria-live="polite"
          className={cx('text-xs text-muted transition-opacity duration-300', saved ? 'opacity-100' : 'opacity-0')}
        >
          Saved
        </span>
      </header>

      <Card>
        <Row title="Weekly schedule" description="Expected working time for each weekday.">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p.label} variant="secondary" size="sm" onClick={() => saveSchedule(p.make())}>
                {p.label}
              </Button>
            ))}
          </div>
          <ul className="divide-y divide-line rounded-md border border-line">
            {order.map((i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-3 py-1.5">
                <span className={cx('text-[13px]', schedule[i] === 0 && 'text-faint')}>{DAYS[i]}</span>
                <div className="flex items-center gap-3">
                  <span className="tnum w-12 text-right text-xs text-muted">{schedule[i] === 0 ? 'Off' : `${(schedule[i] / 60).toFixed(2).replace(/\.?0+$/, '')}h`}</span>
                  <input
                    type="time"
                    aria-label={`${DAYS[i]} expected hours (hours:minutes)`}
                    value={toClock(schedule[i])}
                    onChange={(e) => {
                      const m = fromClock(e.target.value)
                      if (m !== null) setDay(i, m)
                    }}
                    className="tnum no-drag h-7 w-[5.5rem] rounded-md border border-line-strong bg-raised px-2 text-right text-[13px] outline-none [color-scheme:inherit] focus:border-accent focus:ring-2 focus:ring-accent/25"
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted">
            Weekly total <span className="tnum font-medium text-fg">{formatDuration(total)}</span> h
          </p>
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium text-muted">Week starts on</div>
            <Segmented
              label="Week start"
              value={String(settings.weekStart) as '0' | '6'}
              onChange={(v) => patch({ weekStart: Number(v) as 0 | 6 })}
              options={[
                { value: '0', label: 'Monday' },
                { value: '6', label: 'Sunday' }
              ]}
            />
          </div>
        </Row>
      </Card>

      <Card className="mt-4">
        <Row title="Appearance">
          <Segmented
            label="Theme"
            value={theme}
            onChange={(t) => {
              setTheme(t)
              patch({ theme: t })
            }}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
          />
        </Row>
      </Card>

      <Card className="mt-4">
        <Row title="Automatic tracking" description="Start and stop the timer based on your network.">
          <div className="flex flex-col gap-4">
            <Toggle
              checked={settings.autoTrack}
              onChange={(v) => patch({ autoTrack: v })}
              label="Track automatically"
              description="Runs while connected to a work network."
            />
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">Work networks</div>
              {settings.workSsids.length === 0 ? (
                <p className="mb-2 text-xs text-muted">No networks yet. Add the Wi-Fi you use at work.</p>
              ) : (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {settings.workSsids.map((s) => (
                    <li key={s} className="flex items-center gap-1 rounded-md bg-sunken py-1 pl-2.5 pr-1 text-[13px]">
                      {s}
                      <button
                        type="button"
                        aria-label={`Remove ${s}`}
                        onClick={() => patch({ workSsids: settings.workSsids.filter((x) => x !== s) })}
                        className="no-drag grid size-5 place-items-center rounded text-muted hover:bg-line hover:text-fg"
                      >
                        x
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  addSsid(draft)
                }}
              >
                <div className="w-56">
                  <Input aria-label="Network name" placeholder="Network name" value={draft} onChange={(e) => setDraft(e.target.value)} />
                </div>
                <Button type="submit" variant="secondary" size="sm" disabled={!draft.trim()}>
                  Add
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={useCurrent} disabled={detecting}>
                  {detecting ? 'Detecting' : 'Use current network'}
                </Button>
              </form>
              {detectMsg && <p className="mt-2 text-xs text-muted">{detectMsg}</p>}
            </div>
            <div className="w-40">
              <NumberField
                label="Grace period"
                value={settings.graceMinutes}
                onChange={(v) => patch({ graceMinutes: v })}
                min={0}
                max={120}
                step={1}
                precision={0}
                suffix="min"
                hint="Wait this long after leaving before stopping."
              />
            </div>
          </div>
        </Row>
      </Card>

      <Card className="mt-4">
        <Row title="General">
          <Toggle checked={settings.launchAtLogin} onChange={(v) => patch({ launchAtLogin: v })} label="Launch at login" />
        </Row>
      </Card>

      <Card className="mt-4">
        <Row title="Days off" description="Credited days count as worked time equal to your expected hours, so they never leave a deficit.">
          <div className="flex flex-col gap-3.5">
            {CREDIT.map((c) => (
              <Toggle
                key={c.kind}
                checked={settings.creditKinds.includes(c.kind)}
                onChange={(v) => toggleCredit(c.kind, v)}
                label={c.label}
                description={c.text}
              />
            ))}
          </div>
        </Row>
      </Card>
    </div>
  )
}
