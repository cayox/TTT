import { formatClock, formatDelta, formatDuration } from '@shared/format'
import { KIND_NAMES, dayLabel, type MonthReport, type ReportDay } from '@shared/report'

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Light-theme project palette (paper has no CSS variables from the app). */
const PRINT_COLORS: Record<string, string> = { brass: '#8e6421', sage: '#4f7a42', clay: '#a4553a', slate: '#4e6680', teal: '#2f7a70', plum: '#7a5690', rose: '#a2495e', ochre: '#8a7418' }

const signClass = (m: number): string => (Math.round(m) > 0 ? 'pos' : Math.round(m) < 0 ? 'neg' : '')

function dayRow(d: ReportDay): string {
  const quiet = !d.segments.length && !d.kind && d.expectedMin === 0
  const times = d.segments.length
    ? d.segments.map((s) => `<span class="seg">${formatClock(s.startTs)}–${s.running ? 'running' : formatClock(s.endTs)}</span>`).join(', ')
    : d.kind
      ? `<em>${KIND_NAMES[d.kind]}</em>`
      : ''
  const projects = [...new Set(d.segments.map((s) => s.project ?? '–'))].map(esc).join(', ')
  const notes = [...new Set(d.segments.map((s) => s.note.trim()).filter(Boolean))].map(esc).join('; ')
  const show = !d.future && (d.expectedMin > 0 || d.countedMin > 0)
  return `<tr class="${quiet ? 'quiet' : ''} ${d.weekday >= 5 ? 'weekend' : ''}">
    <td class="day">${dayLabel(d)}</td>
    <td class="num">${times}</td>
    <td>${projects}</td>
    <td class="note">${notes}${d.credited && d.kind ? '<span class="tag">credited</span>' : ''}</td>
    <td class="num r">${show ? formatDuration(d.countedMin) : ''}</td>
    <td class="num r muted">${show && d.expectedMin ? formatDuration(d.expectedMin) : ''}</td>
    <td class="num r ${signClass(d.deltaMin)}">${show ? formatDelta(d.deltaMin) : ''}</td>
  </tr>`
}

/** Standalone, print-ready A4 page (white paper; no web fonts so it renders offline in a hidden window). */
export function timesheetHtml(r: MonthReport): string {
  const generated = new Date(r.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const projects = r.byProject.filter((p) => p.minutes >= 1)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Timesheet ${esc(r.title)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 8.5pt/1.35 -apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif; color: #24211c; }
  .num { font-variant-numeric: tabular-nums; }
  header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10pt; border-bottom: 2pt solid #b48a45; }
  h1 { font: 600 22pt/1.1 'New York', 'Iowan Old Style', Georgia, serif; margin: 0; letter-spacing: -0.3pt; }
  h1 small { display: block; font: 500 9pt -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #8a8174; letter-spacing: 1pt; text-transform: uppercase; margin-bottom: 3pt; }
  .who { text-align: right; color: #5f584d; }
  .who strong { display: block; font-size: 11pt; color: #24211c; }
  .summary { display: flex; gap: 0; margin: 10pt 0 8pt; border: 0.75pt solid #d9d3c8; border-radius: 5pt; }
  .summary div { flex: 1; padding: 7pt 10pt; border-left: 0.75pt solid #d9d3c8; }
  .summary div:first-child { border-left: 0; }
  .summary span { display: block; color: #8a8174; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.6pt; }
  .summary b { font: 600 14pt/1.3 'New York', Georgia, serif; font-variant-numeric: tabular-nums lining-nums; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 600; font-size: 7.5pt; color: #8a8174; text-transform: uppercase; letter-spacing: 0.6pt; padding: 0 6pt 4pt; border-bottom: 0.75pt solid #bdb5a8; }
  td { padding: 2.2pt 6pt; border-bottom: 0.5pt solid #e7e2d9; vertical-align: top; }
  tr { break-inside: avoid; }
  .r { text-align: right; }
  .day { white-space: nowrap; font-weight: 500; width: 46pt; }
  .note { color: #5f584d; }
  .seg { white-space: nowrap; }
  .muted { color: #8a8174; }
  .weekend td { background: #f6f3ee; }
  .quiet td { color: #aaa296; }
  .pos { color: #3f6b33; }
  .neg { color: #a2412f; }
  .tag { margin-left: 4pt; font-size: 7pt; color: #8a8174; border: 0.5pt solid #cfc8bc; border-radius: 2pt; padding: 0 2pt; }
  tfoot td { font-weight: 600; border-top: 1pt solid #24211c; border-bottom: 0; padding-top: 5pt; }
  .projects { margin: 0 0 10pt; color: #5f584d; }
  .projects b { color: #24211c; font-weight: 600; }
  .projects i { display: inline-block; width: 6pt; height: 6pt; border-radius: 3pt; background: #b48a45; margin: 0 3pt 0 8pt; }
  .sign { display: flex; gap: 28pt; margin-top: 22pt; break-inside: avoid; }
  .sign div { flex: 1; }
  .line { border-bottom: 0.75pt solid #24211c; height: 28pt; }
  .sign p { margin: 4pt 0 0; color: #5f584d; font-size: 8pt; }
  footer { margin-top: 10pt; color: #aaa296; font-size: 7pt; }
</style></head>
<body>
  <header>
    <h1><small>Timesheet</small>${esc(r.title)}</h1>
    <div class="who">${r.name ? `<strong>${esc(r.name)}</strong>` : ''}Generated ${esc(generated)}</div>
  </header>

  <section class="summary">
    <div><span>Worked</span><b class="num">${formatDuration(r.countedMin)}</b></div>
    <div><span>Target</span><b class="num">${formatDuration(r.expectedMin)}</b></div>
    <div><span>This month</span><b class="num ${signClass(r.deltaMin)}">${formatDelta(r.deltaMin)}</b></div>
    <div><span>Balance</span><b class="num ${signClass(r.balanceAtEnd)}">${formatDelta(r.balanceAtEnd)}</b></div>
  </section>
  ${
    projects.length > 1
      ? `<p class="projects">By project:${projects.map((p) => `<i style="background:${PRINT_COLORS[p.color ?? ''] ?? '#aaa296'}"></i>${esc(p.name ?? 'No project')} <b class="num">${formatDuration(p.minutes)}</b>`).join('')}</p>`
      : ''
  }

  <table>
    <thead><tr><th>Day</th><th>Time</th><th>Project</th><th>Note</th><th class="r">Worked</th><th class="r">Target</th><th class="r">+/−</th></tr></thead>
    <tbody>${r.days.map(dayRow).join('')}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td class="num r">${formatDuration(r.countedMin)}</td><td class="num r">${formatDuration(r.expectedMin)}</td><td class="num r ${signClass(r.deltaMin)}">${formatDelta(r.deltaMin)}</td></tr></tfoot>
  </table>

  <section class="sign">
    <div><div class="line"></div><p>Date, signature employee${r.name ? ` (${esc(r.name)})` : ''}</p></div>
    <div><div class="line"></div><p>Date, signature supervisor</p></div>
  </section>

  <footer>Balance includes any starting balance and all tracked time up to the end of ${esc(r.title)}. Created with TTT, the Time Tracking Tool.</footer>
</body></html>`
}
