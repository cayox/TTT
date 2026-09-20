/// <reference types="vite/client" />
import type { Api } from '@shared/ipc'
import type { UpdateState } from '@shared/types'
declare global {
  interface Window {
    api: Api
    events: {
      onSessionsChanged: (cb: () => void) => () => void
      onProjectsChanged: (cb: () => void) => () => void
      onUpdateChanged: (cb: (state: UpdateState) => void) => () => void
    }
  }
}
