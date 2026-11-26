import type { ChangelogGroup } from './changelog'

export type SessionSource = 'manual' | 'wifi'

export interface Session {
  id: number
  startTs: number // epoch ms
  endTs: number | null // null while running
  source: SessionSource
  note: string
  projectId: number | null
}

/** Palette keys; each maps to a theme-aware CSS color (--p-<key>). */
export const PROJECT_COLORS = ['brass', 'sage', 'clay', 'slate', 'teal', 'plum', 'rose', 'ochre'] as const
export type ProjectColor = (typeof PROJECT_COLORS)[number]

export interface Project {
  id: number
  name: string
  color: ProjectColor
  archived: boolean
}

/** What the Mac can see of the current network. ssid is null when macOS hides it (no Location permission). */
export interface CurrentNetwork {
  ssid: string | null
  /** MAC address of the default router; identifies the network without the SSID. */
  routerId: string | null
  gateway: string | null
}

/** macOS Location authorization for TTT; 'unknown' when it cannot be read (no helper, or not macOS). */
export type LocationStatus = 'granted' | 'denied' | 'restricted' | 'notDetermined' | 'unknown'

/** A release on GitHub that is newer than the running app. */
export interface UpdateRelease {
  /** Without a leading `v`. */
  version: string
  /** Release notes, parsed into changelog groups. */
  groups: ChangelogGroup[]
  publishedAt: string | null
  /** Release page on GitHub. */
  url: string
  prerelease: boolean
  /** The downloadable build for this Mac; null when the release has none. */
  asset: {
    name: string
    url: string
    size: number
    sha256: string | null
  } | null
}

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  /** Releases newer than the running version, newest first; empty when up to date. */
  releases: UpdateRelease[]
  /** 0..1 while downloading. */
  progress: number
  error: string | null
  /** When the last check finished, epoch ms. */
  lastCheck: number | null
  /** Version the user chose to skip; '' = none. The dialog stays closed for it, Settings still shows it. */
  skipped: string
  /** False when TTT cannot replace itself (unpackaged, or installed somewhere read-only). */
  canInstall: boolean
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
  /** Project new sessions go to; null = first active project. */
  defaultProjectId: number | null
  /** Work network name -> router MAC, to recognize it when macOS hides the SSID. */
  networkRouters: Record<string, string>
  /** Work SSID -> project for Wi-Fi started sessions; missing = default project. */
  ssidProjects: Record<string, number>
  /** Overtime (+) or undertime (−) in minutes carried over from before tracking; added to the running balance. */
  startingBalance: number
  /** Name printed on exported timesheets. */
  exportName: string
  /** Monthly hours from the work contract, in minutes; 0 = not tracked. */
  monthlyHoursMin: number
  /** Monthly hours are set per project (projectMonthlyMin) instead of as one total. */
  monthlyHoursByProject: boolean
  /** Project id -> monthly hours in minutes, used when monthlyHoursByProject is on. */
  projectMonthlyMin: Record<string, number>
  /** First-run welcome flow finished or skipped. */
  onboarded: boolean
  /** Look for new releases on GitHub in the background. */
  autoCheckUpdates: boolean
  /** Version the user chose to skip; '' = none. */
  skippedUpdate: string
  /** Minute interval offered when picking a time (1 = every minute). */
  timeStep: number
  /** Watch the German break rules (ArbZG): remind about breaks, flag days that break them. */
  breakRules: boolean
  /** Take a missed legal break off the counted time, the way payroll does. */
  deductBreaks: boolean
  /** Ask what to do with time away from the Mac (idle or asleep) once it is this long; 0 = never. */
  idleMinutes: number
  /** A session running this long is probably forgotten: ask, or stop it when you are away; 0 = never. */
  maxSessionHours: number
  /** Which macOS notifications TTT sends. */
  notifications: NotificationSettings
  /** Round session times on exports to this many minutes; 0 = exact. */
  exportRoundMin: number
  /** Start or pause from anywhere; an Electron accelerator, '' = off. */
  globalShortcut: string
}

export interface NotificationSettings {
  /** Wi-Fi started or stopped tracking. */
  autoTrack: boolean
  /** Today's expected hours are done. */
  target: boolean
  /** A legal break is due, or the day gets too long. */
  breaks: boolean
  /** A planned clock-out is coming up or happened. */
  clockOut: boolean
  /** A session has been running for very long. */
  forgotten: boolean
}

/** Offered in Settings; the value is an Electron accelerator. */
export const GLOBAL_SHORTCUTS: { value: string; label: string }[] = [
  { value: '', label: 'Off' },
  { value: 'Control+Alt+Space', label: '⌃⌥Space' },
  { value: 'Control+Alt+Command+T', label: '⌃⌥⌘T' },
  { value: 'Alt+Shift+T', label: '⌥⇧T' }
]

export const EXPORT_ROUNDING = [0, 5, 10, 15, 30] as const

/** Minute intervals offered in Settings. */
export const TIME_STEPS = [1, 5, 10, 15, 30] as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weekStart: 0,
  workSsids: [],
  graceMinutes: 5,
  autoTrack: false,
  launchAtLogin: false,
  creditKinds: ['vacation', 'sick', 'holiday'],
  defaultProjectId: null,
  networkRouters: {},
  ssidProjects: {},
  startingBalance: 0,
  exportName: '',
  monthlyHoursMin: 0,
  monthlyHoursByProject: false,
  projectMonthlyMin: {},
  onboarded: false,
  autoCheckUpdates: true,
  skippedUpdate: '',
  timeStep: 15,
  breakRules: true,
  deductBreaks: false,
  idleMinutes: 15,
  maxSessionHours: 12,
  notifications: { autoTrack: true, target: true, breaks: true, clockOut: true, forgotten: true },
  exportRoundMin: 0,
  globalShortcut: ''
}

export const DEFAULT_SCHEDULE: Schedule = [480, 480, 480, 480, 480, 0, 0]

/** A database backup in the backups folder. */
export interface BackupEntry {
  name: string
  /** Epoch ms. */
  at: number
  size: number
  kind: 'daily' | 'migration' | 'manual' | 'import'
}

export interface BackupInfo {
  dir: string
  backups: BackupEntry[]
}
