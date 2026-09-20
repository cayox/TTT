import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, EVENT_PROJECTS_CHANGED, EVENT_SESSIONS_CHANGED, EVENT_UPDATE_CHANGED, type Api } from '@shared/ipc'
import type { UpdateState } from '@shared/types'

const api = Object.fromEntries(CHANNELS.map((ch) => [ch, (...args: unknown[]) => ipcRenderer.invoke(ch, ...args)])) as unknown as Api

contextBridge.exposeInMainWorld('api', api)

contextBridge.exposeInMainWorld('events', {
  onSessionsChanged: (cb: () => void) => {
    const h = (): void => cb()
    ipcRenderer.on(EVENT_SESSIONS_CHANGED, h)
    return () => void ipcRenderer.removeListener(EVENT_SESSIONS_CHANGED, h)
  },
  onProjectsChanged: (cb: () => void) => {
    const h = (): void => cb()
    ipcRenderer.on(EVENT_PROJECTS_CHANGED, h)
    return () => void ipcRenderer.removeListener(EVENT_PROJECTS_CHANGED, h)
  },
  onUpdateChanged: (cb: (state: UpdateState) => void) => {
    const h = (_e: unknown, state: UpdateState): void => cb(state)
    ipcRenderer.on(EVENT_UPDATE_CHANGED, h)
    return () => void ipcRenderer.removeListener(EVENT_UPDATE_CHANGED, h)
  }
})
