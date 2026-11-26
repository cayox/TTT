import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, EVENT_DATA_REPLACED, EVENT_NAVIGATE, EVENT_PROJECTS_CHANGED, EVENT_SESSIONS_CHANGED, EVENT_UPDATE_CHANGED, type Api } from '@shared/ipc'
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
  onDataReplaced: (cb: () => void) => {
    const h = (): void => cb()
    ipcRenderer.on(EVENT_DATA_REPLACED, h)
    return () => void ipcRenderer.removeListener(EVENT_DATA_REPLACED, h)
  },
  onNavigate: (cb: (page: string) => void) => {
    const h = (_e: unknown, page: string): void => cb(page)
    ipcRenderer.on(EVENT_NAVIGATE, h)
    return () => void ipcRenderer.removeListener(EVENT_NAVIGATE, h)
  },
  onUpdateChanged: (cb: (state: UpdateState) => void) => {
    const h = (_e: unknown, state: UpdateState): void => cb(state)
    ipcRenderer.on(EVENT_UPDATE_CHANGED, h)
    return () => void ipcRenderer.removeListener(EVENT_UPDATE_CHANGED, h)
  }
})
