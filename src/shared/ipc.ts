import type { DayOverride, Schedule, Session, SessionSource, Settings } from './types'
import type { Range, RangeStats } from './time'

export interface NewSession {
  startTs: number
  endTs: number | null
  source: SessionSource
  note?: string
}

/** Typed IPC contract: channel → [args, result]. */
export interface IpcContract {
  'app:ping': [[], string]

  'sessions:current': [[], Session | null]
  'sessions:start': [[], Session]
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

  'settings:get': [[], Settings]
  'settings:set': [[Partial<Settings>], Settings]

  /** Stats for a range, computed in main from live DB data. */
  'stats:range': [[Range], RangeStats]
  /** Running overtime balance (minutes) since first session. */
  'stats:balance': [[], number]
}
export type Channel = keyof IpcContract
export type Api = {
  [C in Channel]: (...args: IpcContract[C][0]) => Promise<IpcContract[C][1]>
}
export const CHANNELS: Channel[] = [
  'app:ping',
  'sessions:current', 'sessions:start', 'sessions:stop', 'sessions:list',
  'sessions:add', 'sessions:update', 'sessions:remove',
  'schedule:get', 'schedule:set',
  'overrides:list', 'overrides:set', 'overrides:remove',
  'settings:get', 'settings:set',
  'stats:range', 'stats:balance'
]

/** Push events main → renderer. */
export const EVENT_SESSIONS_CHANGED = 'sessions:changed'
