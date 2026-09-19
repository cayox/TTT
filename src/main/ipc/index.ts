import { ipcMain } from 'electron'
import type { Channel, IpcContract } from '@shared/ipc'

type Handlers = { [C in Channel]: (...args: IpcContract[C][0]) => IpcContract[C][1] | Promise<IpcContract[C][1]> }

export function registerIpc(handlers: Handlers): void {
  for (const ch of Object.keys(handlers) as Channel[]) {
    ipcMain.handle(ch, (_e, ...args) => (handlers[ch] as (...a: unknown[]) => unknown)(...args))
  }
}
