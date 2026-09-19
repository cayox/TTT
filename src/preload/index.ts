import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, EVENT_PROJECTS_CHANGED, EVENT_SESSIONS_CHANGED, type Api } from '@shared/ipc'

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
  }
})
