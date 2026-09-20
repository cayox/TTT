import type { ChangelogEntry, ChangelogGroup } from '../../../shared/changelog'
import { cx } from './ui'

/** Colors the usual Keep a Changelog headings; anything else stays neutral. */
const TONE: Record<string, string> = {
  added: 'text-over',
  fixed: 'text-accent',
  changed: 'text-accent',
  removed: 'text-under',
  deprecated: 'text-under',
  security: 'text-under'
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso.length > 10 ? iso : `${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

export function ChangelogGroups({ groups }: { groups: ChangelogGroup[] }) {
  if (!groups.length) return <p className="text-[13px] text-muted">No notes for this release.</p>
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g, i) => (
        <div key={`${g.heading}-${i}`}>
          {g.heading && <div className={cx('mb-1 text-[11px] font-semibold uppercase tracking-wide', TONE[g.heading.toLowerCase()] ?? 'text-faint')}>{g.heading}</div>}
          <ul className="flex flex-col gap-1">
            {g.items.map((item, j) => (
              <li key={j} className="flex gap-2 text-[13px] leading-snug">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** One version and its notes, as shown before updating and under What's new. */
export function ChangelogEntryView({ entry, current }: { entry: ChangelogEntry & { publishedAt?: string | null }; current?: boolean }) {
  const date = formatDate(entry.publishedAt ?? entry.date)
  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h3 className="font-display text-[15px] font-semibold tracking-tight tnum">{entry.version}</h3>
        {current && <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[10.5px] font-medium text-muted">You have this</span>}
        {date && <span className="text-xs text-faint">{date}</span>}
      </header>
      <ChangelogGroups groups={entry.groups} />
    </section>
  )
}
