import type { CurrentNetwork, DayOverride, LocationStatus, UpdateState, Project, ProjectColor, Schedule, Session, SessionSource, Settings } from './types'
import type { ProjectTotal, Range, RangeStats } from './time'
import type { MonthHours, MonthTotal } from './hours'
import type { ChangelogEntry } from './changelog'

export interface NewSession {
  startTs: number
  endTs: number | null
  source: SessionSource
  note?: string
  /** undefined = default project */
  projectId?: number | null
}

/** Typed IPC contract: channel → [args, result]. */
export interface IpcContract {
  'app:ping': [[], string]
  /** App version, e.g. 0.1.0-beta.1. */
  'app:version': [[], string]
  /** The bundled CHANGELOG.md, parsed; newest release first. Empty when it is missing. */
  'app:changelog': [[], ChangelogEntry[]]

  'sessions:current': [[], Session | null]
  /** projectId undefined = default project. */
  'sessions:start': [[projectId?: number | null], Session]
  'sessions:stop': [[], Session | null]
  'sessions:list': [[fromTs: number, toTs: number], Session[]]
  'sessions:add': [[NewSession], Session]
  'sessions:update': [[id: number, patch: Partial<Omit<Session, 'id'>>], Session | null]
  'sessions:remove': [[id: number], void]

  'schedule:get': [[], Schedule]
  'schedule:set': [[Schedule], Schedule]

  'overrides:list': [[fromDate: string, toDate: string], DayOverride[]]
  'overrides:set': [[DayOverride], void]
  'overrides:remove': [[date: string], void]

  'projects:list': [[], Project[]]
  'projects:add': [[{ name: string; color: ProjectColor }], Project]
  'projects:update': [[id: number, patch: Partial<Omit<Project, 'id'>>], Project | null]
  'projects:remove': [[id: number], void]
  /** Session count per project id. */
  'projects:usage': [[], Record<number, number>]

  /** Current network: SSID (often hidden by macOS) plus the router id used as a fallback. */
  'wifi:current': [[], CurrentNetwork]
  /** Location authorization, which macOS requires before any app may read the Wi-Fi name. Never prompts. */
  'wifi:locationStatus': [[], LocationStatus]
  /** Shows the system Location prompt if undecided, then reports the resulting status. */
  'wifi:requestLocation': [[], LocationStatus]
  /** Opens System Settings at Location Services, for when access was denied. */
  'wifi:openLocationSettings': [[], void]

  /** Month timesheet as PDF via a save dialog; returns the saved path, or null if cancelled. month is 0-based. */
  'export:pdf': [[year: number, month: number], string | null]
  /** Copies the WhatsApp-formatted month summary to the clipboard and returns it. */
  'export:copyText': [[year: number, month: number], string]
  /** Opens WhatsApp with the month summary prefilled; false if WhatsApp is not installed. */
  'export:openWhatsapp': [[year: number, month: number], boolean]
  /** Act on the last saved PDF (main remembers the path; the renderer never passes one). */
  'export:openLast': [[], void]
  'export:revealLast': [[], void]
  'export:shareLast': [[], void]

  /** Where the updater stands; also pushed to the renderer on every change. */
  'update:state': [[], UpdateState]
  /** Looks for newer releases now; a manual check reports its failures. */
  'update:check': [[], UpdateState]
  /** Downloads and unpacks the newest release, ready to install. */
  'update:download': [[], UpdateState]
  /** Replaces the app with the downloaded build and restarts it. */
  'update:install': [[], void]
  /** Stop offering this version until a newer one appears. */
  'update:skip': [[version: string], UpdateState]
  /** Put the offer away until the next check. */
  'update:dismiss': [[], UpdateState]
  /** Opens a release page on GitHub; the newest one by default. */
  'update:openRelease': [[version?: string], void]

  'settings:get': [[], Settings]
  'settings:set': [[Partial<Settings>], Settings]

  /** Stats for a range, computed in main from live DB data. */
  'stats:range': [[Range], RangeStats]
  /** Running overtime balance (minutes) since first session. */
  'stats:balance': [[], number]
  /** Progress through this month's contract hours (contractMin is 0 when not tracked). */
  'stats:month': [[], MonthHours]
  /** Totals for the last `count` months, oldest first. */
  'stats:months': [[count: number], MonthTotal[]]
  /** Minutes per project within a range. */
  'stats:projects': [[Range], ProjectTotal[]]
}
export type Channel = keyof IpcContract
export type Api = {
  [C in Channel]: (...args: IpcContract[C][0]) => Promise<IpcContract[C][1]>
}
export const CHANNELS: Channel[] = [
  'app:ping', 'app:version', 'app:changelog',
  'sessions:current', 'sessions:start', 'sessions:stop', 'sessions:list',
  'sessions:add', 'sessions:update', 'sessions:remove',
  'schedule:get', 'schedule:set',
  'overrides:list', 'overrides:set', 'overrides:remove',
  'projects:list', 'projects:add', 'projects:update', 'projects:remove', 'projects:usage',
  'wifi:current', 'wifi:locationStatus', 'wifi:requestLocation', 'wifi:openLocationSettings',
  'export:pdf', 'export:copyText', 'export:openWhatsapp', 'export:openLast', 'export:revealLast', 'export:shareLast',
  'update:state', 'update:check', 'update:download', 'update:install', 'update:skip', 'update:dismiss', 'update:openRelease',
  'settings:get', 'settings:set',
  'stats:range', 'stats:balance', 'stats:projects', 'stats:month', 'stats:months'
]

/** Push events main → renderer. */
export const EVENT_SESSIONS_CHANGED = 'sessions:changed'
export const EVENT_PROJECTS_CHANGED = 'projects:changed'
/** Carries the new UpdateState. */
export const EVENT_UPDATE_CHANGED = 'update:changed'
