import { useCallback, useMemo } from 'react'
import type { NewSession } from '../../../shared/ipc'
import type { Session } from '../../../shared/types'
import { formatClock } from '../../../shared/format'
import { errorText, useToast } from './toast'
import { useTracker } from './tracker'

/** Session mutations with toast feedback; deletes are immediate and undoable. */
export function useSessionActions(onChanged: () => Promise<void> | void) {
  const toast = useToast()
  const { projectById } = useTracker()

  const run = useCallback(
    async (fn: () => Promise<unknown>, failTitle: string): Promise<boolean> => {
      try {
        await fn()
        await onChanged()
        return true
      } catch (e) {
        toast.error(failTitle, { description: errorText(e) })
        return false
      }
    },
    [onChanged, toast]
  )

  return useMemo(() => {
    const label = (s: { startTs: number; endTs: number | null; projectId?: number | null }): string =>
      `${formatClock(s.startTs)}–${s.endTs ? formatClock(s.endTs) : 'now'}${projectById(s.projectId) ? ` · ${projectById(s.projectId)!.name}` : ''}`

    return {
      async add(d: NewSession): Promise<boolean> {
        const ok = await run(() => window.api['sessions:add'](d), "Couldn't add the session")
        if (ok) toast.success('Session added', { description: label(d) })
        return ok
      },
      async update(id: number, patch: Partial<Omit<Session, 'id'>>, quiet = false): Promise<boolean> {
        const ok = await run(() => window.api['sessions:update'](id, patch), "Couldn't save the session")
        if (ok && !quiet) toast.success('Session updated', { id: `session-${id}` })
        return ok
      },
      async remove(s: Session): Promise<boolean> {
        const ok = await run(() => window.api['sessions:remove'](s.id), "Couldn't delete the session")
        if (ok)
          toast.success('Session deleted', {
            description: label(s),
            actions: [
              {
                label: 'Undo',
                onClick: async () => {
                  const back = await run(
                    () => window.api['sessions:add']({ startTs: s.startTs, endTs: s.endTs, source: s.source, note: s.note, projectId: s.projectId }),
                    "Couldn't restore the session"
                  )
                  if (back) toast.info('Session restored', { description: label(s) })
                }
              }
            ]
          })
        return ok
      }
    }
  }, [run, toast, projectById])
}
