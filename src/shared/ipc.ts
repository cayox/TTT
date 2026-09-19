import type { CurrentNetwork, DayOverride, Project, ProjectColor, Schedule, Session, SessionSource, Settings } from './types'
import type { ProjectTotal, Range, RangeStats } from './time'
import type { MonthHours, MonthTotal } from './hours'

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
  'app:ping', 'app:version',
  'sessions:current', 'sessions:start', 'sessions:stop', 'sessions:list',
  'sessions:add', 'sessions:update', 'sessions:remove',
  'schedule:get', 'schedule:set',
  'overrides:list', 'overrides:set', 'overrides:remove',
  'projects:list', 'projects:add', 'projects:update', 'projects:remove', 'projects:usage',
  'wifi:current',
  'export:pdf', 'export:copyText', 'export:openWhatsapp', 'export:openLast', 'export:revealLast', 'export:shareLast',
  'settings:get', 'settings:set',
  'stats:range', 'stats:balance', 'stats:projects', 'stats:month', 'stats:months'
]

/** Push events main → renderer. */
export const EVENT_SESSIONS_CHANGED = 'sessions:changed'
export const EVENT_PROJECTS_CHANGED = 'projects:changed'
