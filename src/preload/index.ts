import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type Api } from '@shared/ipc'

const api = Object.fromEntries(CHANNELS.map((ch) => [ch, (...args: unknown[]) => ipcRenderer.invoke(ch, ...args)])) as unknown as Api

contextBridge.exposeInMainWorld('api', api)
