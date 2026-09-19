/** Typed IPC contract: channel → [args, result]. Extend as features land. */
export interface IpcContract {
  'app:ping': [[], string]
}
export type Channel = keyof IpcContract
export type Api = {
  [C in Channel]: (...args: IpcContract[C][0]) => Promise<IpcContract[C][1]>
}
export const CHANNELS: Channel[] = ['app:ping']
