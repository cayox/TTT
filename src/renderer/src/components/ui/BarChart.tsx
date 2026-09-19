import { useId, useState } from 'react'

export interface BarDatum {
  label: string
  value: number
  /** Optional target, drawn as a tick across the bar slot (value mode only). */
  target?: number
}
export interface BarChartProps {
  data: BarDatum[]
  /** 'delta' colors by sign (over/under) around a zero baseline; 'value' uses the accent. */
  mode?: 'delta' | 'value'
  height?: number
  title: string
  /** Format a value for axis, tooltip and screen readers. */
  format?: (v: number) => string
  /** Show every nth x label (auto if omitted). */
  labelEvery?: number
  /** Index of a bar to emphasize, e.g. today. */
  highlight?: number
}

const W = 600
const PAD = { t: 14, r: 8, b: 22, l: 44 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/** Pure SVG, scales to container width. Arrow keys inspect bars; a table backs screen readers. */
export function BarChart({ data, mode = 'value', height = 200, title, format = (v) => String(Math.round(v * 100) / 100), labelEvery, highlight }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const id = useId()
  const signed = mode === 'delta'
  const targets = signed ? [] : data.map((d) => d.target ?? 0)
  const maxV = Math.max(0, ...data.map((d) => d.value), ...targets)
  const minV = signed ? Math.min(0, ...data.map((d) => d.value)) : 0
  const top = niceMax(maxV || Math.abs(minV))
  const bot = signed && minV < 0 ? -niceMax(-minV) : 0
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const y = (v: number) => PAD.t + ((top - v) / (top - bot)) * ih
  const slot = data.length ? iw / data.length : iw
  const bw = Math.max(2, Math.min(30, slot * 0.62))
  const step = labelEvery ?? Math.max(1, Math.ceil(data.length / 8))
  const ticks = signed && bot < 0 ? [bot, 0, top] : [0, top / 2, top]
  const color = (v: number) => (!signed ? 'var(--accent)' : v >= 0 ? 'var(--over)' : 'var(--under)')
  const dim = (i: number): number => (hover !== null ? (hover === i ? 1 : 0.4) : highlight === undefined || highlight === i ? 1 : 0.55)

  if (!data.length) {
    return (
      <div className="grid place-items-center rounded-md border border-dashed border-line-strong text-xs text-muted" style={{ height }}>
        No data in this range yet
      </div>
    )
  }

  const h = hover !== null ? data[hover] : null
  const hx = hover !== null ? ((PAD.l + slot * hover + slot / 2) / W) * 100 : 0
  return (
    <figure
      className="relative m-0 w-full rounded-md"
      tabIndex={0}
      aria-label={`${title}. Use arrow keys to inspect values.`}
      onBlur={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        e.preventDefault()
        const d = e.key === 'ArrowRight' ? 1 : -1
        setHover((i) => (i === null ? (d > 0 ? 0 : data.length - 1) : Math.min(data.length - 1, Math.max(0, i + d))))
      }}
    >
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}t`} className="block w-full overflow-visible" style={{ height: 'auto' }}>
        <title id={`${id}t`}>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 && signed ? 'var(--line-strong)' : 'var(--line)'} strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--faint)" className="tnum">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.l + slot * i + (slot - bw) / 2
          const y0 = y(0)
          const y1 = y(d.value)
          const hh = Math.max(Math.abs(y1 - y0), d.value === 0 ? 0 : 1)
          const showTarget = !signed && !!d.target
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={ih} fill="transparent" />
              <rect x={x} y={Math.min(y0, y1)} width={bw} height={hh} rx={Math.min(3, bw / 2)} fill={color(d.value)} opacity={dim(i)} style={{ transition: 'opacity 150ms' }} />
              {showTarget && (
                <line x1={x - 3} x2={x + bw + 3} y1={y(d.target!)} y2={y(d.target!)} stroke="var(--fg)" strokeOpacity={0.55} strokeWidth={1.5} strokeLinecap="round" />
              )}
              {i % step === 0 && (
                <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize={10} fill={highlight === i ? 'var(--fg)' : 'var(--faint)'} fontWeight={highlight === i ? 600 : 400}>
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute -top-2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-raised-solid px-2 py-1 text-xs shadow-pop"
          style={{ left: `${Math.min(92, Math.max(8, hx))}%`, zIndex: 'var(--z-pop)' }}
        >
          <span className="text-muted">{h.label} </span>
          <span className="tnum font-medium" style={{ color: color(h.value) }}>
            {signed && h.value > 0 ? '+' : ''}
            {format(h.value)}
          </span>
          {!signed && !!h.target && <span className="tnum text-faint"> / {format(h.target)}</span>}
        </div>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
              {d.target !== undefined && <td>target {format(d.target)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
