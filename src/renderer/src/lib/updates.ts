import { useCallback, useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/types'

/** The updater's state, kept in step with the main process. */
export function useUpdates(): {
  state: UpdateState | null
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  skip: (version: string) => Promise<void>
  dismiss: () => Promise<void>
} {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    let live = true
    window.api['update:state']().then((s) => live && setState(s), () => undefined)
    const off = window.events.onUpdateChanged((s) => live && setState(s))
    return () => {
      live = false
      off()
    }
  }, [])
  // Every call returns the new state, so the UI does not have to wait for the pushed event.
  const call = useCallback(async (fn: () => Promise<UpdateState | void>) => {
    const s = await fn()
    if (s) setState(s)
  }, [])
  return {
    state,
    check: () => call(() => window.api['update:check']()),
    download: () => call(() => window.api['update:download']()),
    install: () => call(() => window.api['update:install']()),
    skip: (version) => call(() => window.api['update:skip'](version)),
    dismiss: () => call(() => window.api['update:dismiss']())
  }
}
