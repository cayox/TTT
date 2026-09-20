import { useEffect, useRef, useState } from 'react'
import { ArrowClockwise, ArrowSquareOut, DownloadSimple } from '@phosphor-icons/react'
import { Button, Modal, ProgressBar } from './ui'
import { ChangelogEntryView } from './Changelog'
import { useUpdates } from '../lib/updates'
import { errorText, useToast } from '../lib/toast'

/** Opens the update dialog from elsewhere (Settings). */
export const OPEN_UPDATE = 'ttt-update'

function bytes(n: number): string {
  return n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(0)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

/**
 * Shows what a new release changes and installs it on request. It opens by itself when a check
 * finds something, unless that version was skipped; Settings can open it again at any time.
 */
export function UpdateDialog() {
  const { state, download, install, skip, dismiss } = useUpdates()
  const [open, setOpen] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const show = (): void => setOpen(true)
    window.addEventListener(OPEN_UPDATE, show)
    return () => window.removeEventListener(OPEN_UPDATE, show)
  }, [])

  const release = state?.releases[0]
  const version = release?.version
  const offered = state?.phase === 'available' || state?.phase === 'downloading' || state?.phase === 'ready'
  // Each version announces itself once: closing the dialog with Later should not bring it back on
  // the next check, and a skipped version waits in Settings instead.
  const announced = useRef('')
  useEffect(() => {
    if (!offered || !version || version === state?.skipped || announced.current === version) return
    announced.current = version
    setOpen(true)
  }, [offered, version, state?.skipped])

  if (!state || !release) return null
  const { phase, progress, canInstall } = state
  const busy = phase === 'downloading'
  const older = state.releases.slice(1)

  const act = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn()
    } catch (e) {
      toast.error(errorText(e), { id: 'update' })
    }
  }

  return (
    <Modal
      open={open}
      title={`TTT ${release.version} is out`}
      description={`You are on ${state.currentVersion}.${release.asset ? '' : ' This release has no download for your Mac.'}`}
      onClose={() => setOpen(false)}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" size="sm" icon={<ArrowSquareOut size={13} />} onClick={() => void window.api['update:openRelease'](release.version)}>
            On GitHub
          </Button>
          <span className="flex-1" />
          {phase !== 'ready' && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                void skip(release.version)
                void dismiss()
                setOpen(false)
              }}
            >
              Skip this version
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(false)}>
            Later
          </Button>
          {phase === 'ready' ? (
            <Button variant="primary" size="sm" icon={<ArrowClockwise size={13} />} onClick={() => void act(install)}>
              Install and restart
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={<DownloadSimple size={13} />}
              disabled={busy || !release.asset || !canInstall}
              onClick={() => void act(download)}
            >
              {busy ? 'Downloading…' : `Update${release.asset ? ` (${bytes(release.asset.size)})` : ''}`}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-3 pt-1">
        <ChangelogEntryView entry={{ version: release.version, date: null, groups: release.groups, publishedAt: release.publishedAt }} />
        {older.length > 0 && (
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <p className="text-xs text-muted">You also missed:</p>
            {older.map((r) => (
              <ChangelogEntryView key={r.version} entry={{ version: r.version, date: null, groups: r.groups, publishedAt: r.publishedAt }} />
            ))}
          </div>
        )}
        {busy && (
          <div className="flex flex-col gap-1.5">
            <ProgressBar value={progress} />
            <p className="text-xs text-muted tnum">{Math.round(progress * 100)}%</p>
          </div>
        )}
        {phase === 'ready' && <p className="text-[13px] text-over">Downloaded and checked. TTT will restart into the new version.</p>}
        {phase === 'error' && state.error && <p className="text-[13px] text-under">{state.error}</p>}
        {!canInstall && (
          <p className="text-xs text-muted">
            TTT can only replace itself from a folder it can write to. Move it to Applications, or download the release from GitHub.
          </p>
        )}
      </div>
    </Modal>
  )
}
