import { Notification } from 'electron'
import type { NotificationSettings } from '@shared/types'

export type NotifyKind = keyof NotificationSettings | 'always'

/** macOS notifications, each kind switchable in Settings. Clicking one opens the window. */
export function createNotifier(o: { enabled: () => NotificationSettings; onClick: () => void }) {
  return (kind: NotifyKind, title: string, body: string): void => {
    if (kind !== 'always' && !o.enabled()[kind]) return
    if (!Notification.isSupported()) return
    try {
      const n = new Notification({ title, body, silent: kind === 'always' })
      n.on('click', o.onClick)
      n.show()
    } catch (e) {
      console.error('[notify] failed', e)
    }
  }
}
