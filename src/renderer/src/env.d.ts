/// <reference types="vite/client" />
import type { Api } from '@shared/ipc'
declare global {
  interface Window {
    api: Api
    events: {
      onSessionsChanged: (cb: () => void) => () => void
      onProjectsChanged: (cb: () => void) => () => void
    }
  }
}
