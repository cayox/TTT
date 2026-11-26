/** Window event asking the app to switch pages; detail is the page id. */
export const NAVIGATE = 'ttt-navigate'

let pendingDay: string | null = null

/** Opens History at a day (YYYY-MM-DD) and expands it. */
export function openDayInHistory(date: string): void {
  pendingDay = date
  window.dispatchEvent(new CustomEvent(NAVIGATE, { detail: 'history' }))
}

/** The day History should open with, once; null when none was asked for. */
export function takePendingDay(): string | null {
  const d = pendingDay
  pendingDay = null
  return d
}
