import { DEFAULT_SETTINGS, EXPORT_ROUNDING, GLOBAL_SHORTCUTS, TIME_STEPS, type DayKind, type Settings } from './types'

const KINDS: DayKind[] = ['holiday', 'vacation', 'sick', 'custom']
type Key = keyof Settings

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined)
const int = (v: unknown, min: number, max: number): number | undefined => {
  const n = num(v, min, max)
  return n !== undefined && Number.isInteger(n) ? n : undefined
}
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : undefined)
const record = <T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> | undefined =>
  isObj(v) && Object.values(v).every(ok) ? (v as Record<string, T>) : undefined
const isString = (x: unknown): x is string => typeof x === 'string'
const isMinutes = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0
const isId = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0

/** Checks one value; undefined means it is not acceptable for that key. */
const CHECK: { [K in Key]: (v: unknown) => Settings[K] | undefined } = {
  theme: (v) => (v === 'system' || v === 'light' || v === 'dark' ? v : undefined),
  weekStart: (v) => (v === 0 || v === 6 ? v : undefined),
  workSsids: (v) =>
    strings(v)
      ?.map((s) => s.trim())
      .filter(Boolean),
  graceMinutes: (v) => num(v, 0, 240),
  autoTrack: (v) => (typeof v === 'boolean' ? v : undefined),
  launchAtLogin: (v) => (typeof v === 'boolean' ? v : undefined),
  creditKinds: (v) => strings(v)?.filter((k): k is DayKind => (KINDS as string[]).includes(k)),
  defaultProjectId: (v) => (v === null || isId(v) ? v : undefined),
  networkRouters: (v) => record(v, isString),
  ssidProjects: (v) => record(v, isId),
  startingBalance: (v) => num(v, -1e7, 1e7),
  exportName: (v) => (typeof v === 'string' ? v.slice(0, 200) : undefined),
  monthlyHoursMin: (v) => num(v, 0, 744 * 60),
  monthlyHoursByProject: (v) => (typeof v === 'boolean' ? v : undefined),
  projectMonthlyMin: (v) => record(v, isMinutes),
  onboarded: (v) => (typeof v === 'boolean' ? v : undefined),
  autoCheckUpdates: (v) => (typeof v === 'boolean' ? v : undefined),
  skippedUpdate: (v) => (typeof v === 'string' ? v : undefined),
  timeStep: (v) => ((TIME_STEPS as readonly unknown[]).includes(v) ? (v as number) : undefined),
  breakRules: (v) => (typeof v === 'boolean' ? v : undefined),
  deductBreaks: (v) => (typeof v === 'boolean' ? v : undefined),
  idleMinutes: (v) => int(v, 0, 240),
  maxSessionHours: (v) => int(v, 0, 24),
  notifications: (v) => {
    if (!isObj(v)) return undefined
    const out = { ...DEFAULT_SETTINGS.notifications }
    for (const k of Object.keys(out) as (keyof typeof out)[]) if (typeof v[k] === 'boolean') out[k] = v[k] as boolean
    return out
  },
  exportRoundMin: (v) => ((EXPORT_ROUNDING as readonly unknown[]).includes(v) ? (v as number) : undefined),
  globalShortcut: (v) => (typeof v === 'string' && GLOBAL_SHORTCUTS.some((s) => s.value === v) ? v : undefined)
}

/** Keeps the acceptable keys of a patch and drops the rest (unknown keys, wrong types, out of range). */
export function cleanPatch(patch: Record<string, unknown>): {
  clean: Partial<Settings>
  rejected: string[]
} {
  const clean: Record<string, unknown> = {}
  const rejected: string[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    const check = (CHECK as Record<string, (v: unknown) => unknown>)[k]
    const ok = check?.(v)
    if (ok === undefined) rejected.push(k)
    else clean[k] = ok
  }
  return { clean: clean as Partial<Settings>, rejected }
}

/** Full settings from stored values: anything missing or broken falls back to its default. */
export function readSettings(stored: Record<string, unknown>): Settings {
  return { ...DEFAULT_SETTINGS, ...cleanPatch(stored).clean }
}

