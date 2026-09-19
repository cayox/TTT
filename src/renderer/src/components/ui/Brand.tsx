import { cx } from './cx'

/** The app icon's ring and brass arc, reduced to a glyph. Track follows text color; arc uses the accent. */
export function BrandMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={cx('shrink-0', className)}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.16" strokeWidth="3.2" />
      <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  )
}

/** "TTT" set in the display face with wide caps spacing, next to the mark; optionally with the full name in a quieter tone. */
export function Wordmark({ size = 'sm', tagline, className }: { size?: 'sm' | 'lg'; tagline?: boolean; className?: string }) {
  const lg = size === 'lg'
  return (
    <span className={cx('inline-flex items-center', lg ? 'gap-3' : 'gap-2', className)}>
      <BrandMark size={lg ? 34 : 18} className="text-fg" />
      <span
        className={cx('font-display font-semibold leading-none text-fg', lg ? 'text-[34px] tracking-[0.14em]' : 'text-[15px] tracking-[0.16em]')}
        style={{ fontVariationSettings: "'opsz' 96" }}
      >
        TTT
        {tagline && <span className="ml-[0.3em] font-medium tracking-normal text-muted">- Time Tracking Tool</span>}
      </span>
    </span>
  )
}
