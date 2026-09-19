import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, EVENT_SESSIONS_CHANGED, type Api } from '@shared/ipc'

const api = Object.fromEntries(CHANNELS.map((ch) => [ch, (...args: unknown[]) => ipcRenderer.invoke(ch, ...args)])) as unknown as Api

contextBridge.exposeInMainWorld('api', api)

contextBridge.exposeInMainWorld('events', {
  onSessionsChanged: (cb: () => void) => {
    const h = (): void => cb()
    ipcRenderer.on(EVENT_SESSIONS_CHANGED, h)
    return () => ipcRenderer.removeListener(EVENT_SESSIONS_CHANGED, h)
  }
})
