import { useState } from 'react'
import { Button, Input, ProjectSelect, TimeField } from './ui'
import { useTracker } from '../lib/tracker'
import { useToast } from '../lib/toast'
import { dateKey } from '../../../shared/time'
import { formatClock } from '../../../shared/format'
import type { Session } from '../../../shared/types'

export interface SessionDraft {
  startTs: number
  /** null keeps a running session running. */
  endTs: number | null
  note: string
  projectId: number | null
}

function tsFor(date: string, hhmm: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, h, mi).getTime()
}

const DAY = 864e5

/** Inline add/edit form: start and end date + time, project and note. Running sessions only edit the start. */
export function SessionEditor({ date, initial, onSave, onCancel, compact }: {
  /** Default date for a new session. */
  date: string
  initial?: Session
  onSave: (draft: SessionDraft) => Promise<void>
  onCancel: () => void
  /** Hide the note field (quick edit on Today). */
  compact?: boolean
}) {
  const { projects, nextProjectId } = useTracker()
  const running = !!initial && initial.endTs === null
  const [projectId, setProjectId] = useState<number | null>(initial ? initial.projectId : nextProjectId)
  const [startDate, setStartDate] = useState(initial ? dateKey(initial.startTs) : date)
  const [start, setStart] = useState(initial ? formatClock(initial.startTs) : '09:00')
  const [endDate, setEndDate] = useState(initial?.endTs ? dateKey(initial.endTs) : date)
  const [end, setEnd] = useState(initial?.endTs ? formatClock(initial.endTs) : '17:00')
  const [note, setNote] = useState(initial?.note ?? '')
  const [busy, setBusy] = useState(false)

  const toast = useToast()
  const [tried, setTried] = useState(false)
  const now = Date.now()
  const a = startDate && start ? tsFor(startDate, start) : NaN
  const b = running ? null : endDate && end ? tsFor(endDate, end) : NaN
  // Which side is wrong drives the red borders; the message itself goes to a toast on Save.
  let error: { text: string; field: 'start' | 'end' | 'both' } | undefined
  if (Number.isNaN(a)) error = { text: 'Enter a start date and time', field: 'start' }
  else if (b !== null && Number.isNaN(b)) error = { text: 'Enter an end date and time', field: 'end' }
  else if (a > now) error = { text: 'The start is in the future', field: 'start' }
  else if (b !== null && b <= a) error = { text: 'The end must be after the start', field: 'end' }
  else if (b !== null && b > now + 60000) error = { text: 'The end is in the future', field: 'end' }
  else if (b !== null && b - a > DAY) error = { text: 'Longer than 24 hours', field: 'both' }
  const badStart = tried && !!error && error.field !== 'end'
  const badEnd = tried && !!error && error.field !== 'start'

  const save = async (): Promise<void> => {
    setTried(true)
    if (error) {
      toast.warning("Can't save this session", {
        id: 'session-editor',
        description: error.field === 'both' ? `${error.text}. Check the start and end dates.` : `${error.text}.`
      })
      return
    }
    setBusy(true)
    try {
      await onSave({ startTs: a, endTs: b, note, projectId })
      toast.dismiss('session-editor')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-line bg-sunken p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <fieldset className="m-0 flex items-end gap-1.5 border-0 p-0">
          <div className="w-[8.5rem]"><Input type="date" label="Start" invalid={badStart} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="[color-scheme:inherit]" /></div>
          <div className="w-[5.5rem]"><TimeField ariaLabel="Start time" invalid={badStart} value={start} onChange={setStart} /></div>
        </fieldset>
        {running ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">End</span>
            <span className="flex h-8 items-center text-[13px] text-over">Still running</span>
          </div>
        ) : (
          <fieldset className="m-0 flex items-end gap-1.5 border-0 p-0">
            <div className="w-[8.5rem]"><Input type="date" label="End" invalid={badEnd} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="[color-scheme:inherit]" /></div>
            <div className="w-[5.5rem]"><TimeField ariaLabel="End time" invalid={badEnd} value={end} onChange={setEnd} /></div>
          </fieldset>
        )}
        <div className="w-44"><ProjectSelect label="Project" projects={projects} value={projectId} onChange={setProjectId} /></div>
        {!compact && <div className="min-w-40 flex-1"><Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>Save</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        {!error && b !== null && <span className="tnum ml-auto text-xs text-faint">{formatLen(b - a)}</span>}
      </div>
    </form>
  )
}

const formatLen = (ms: number): string => {
  const m = Math.round(ms / 60000)
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
