export type SessionSource = 'manual' | 'wifi'

export interface Session {
  id: number
  startTs: number // epoch ms
  endTs: number | null // null while running
  source: SessionSource
  note: string
}

export type DayKind = 'holiday' | 'vacation' | 'sick' | 'custom'

export interface DayOverride {
  date: string // YYYY-MM-DD (local)
  kind: DayKind
  expectedMinutes: number | null // null = use weekly schedule
}

/** Expected minutes per weekday, index 0 = Monday … 6 = Sunday */
export type Schedule = number[]

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  weekStart: 0 | 6 // 0 = Monday, 6 = Sunday
  workSsids: string[]
  graceMinutes: number
  autoTrack: boolean
  launchAtLogin: boolean
  creditKinds: DayKind[] // kinds credited with expected worktime
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weekStart: 0,
  workSsids: [],
  graceMinutes: 5,
  autoTrack: false,
  launchAtLogin: false,
  creditKinds: ['vacation', 'sick', 'holiday']
}

export const DEFAULT_SCHEDULE: Schedule = [480, 480, 480, 480, 480, 0, 0]
