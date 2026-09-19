# TTT: Work Time Tracker: Plan

> **Resume protocol (for any AI session):** read this file first. Find the first unchecked `[ ]` task, do it, tick it `[x]`, and add a line to the Session Log. Keep the Decisions section authoritative. Never re-ask a decided question.

## Decisions (confirmed by user)
| Topic | Decision |
|---|---|
| Platform | macOS only |
| Stack | Electron + React + Tailwind CSS, TypeScript, **electron-vite** |
| Storage | **SQLite via better-sqlite3** (main process only; rebuilt for Electron with `electron-rebuild`) |
| Background | Menu bar tray, launch at login, live timer in tray title |
| Auto-tracking | Auto start on joining work SSID, auto stop on leaving; manual override always available |
| Design | Modern, tasteful, dark mode + light mode + system. Use the `design-taste-frontend` skill for all UI work |

## More decisions (answered)
- Week starts Monday (configurable).
- Multiple sessions per day; breaks are gaps between sessions (pause = stop + start).
- Wifi leave grace period: 5 min default, configurable.
- Vacation/sick days: day is **credited with the expected worktime** (worked = expected, no under/overtime); configurable per kind (credit vs. zero expected).
- Export: **Word (.docx) printable/signable timesheet** + **Markdown / WhatsApp-style chat text** (copy to clipboard or save). CSV optional later.

## Architecture
```
src/
  main/            Electron main: window, tray, IPC, wifi watcher, DB
    db/            better-sqlite3 setup, migrations, repositories
    wifi/          SSID detection + watcher (macOS)
    tray/          menu bar item + live timer
    ipc/           typed IPC handlers
  preload/         contextBridge API (typed)
  renderer/        React app
    components/    UI primitives + feature components
    pages/         Today, History, Stats, Settings
    hooks/  lib/   time math, formatting, stats
  shared/          types + pure logic shared by main & renderer (overtime, stats)
```
- Pure logic (overtime balance, stat ranges) lives in `shared/` and is unit tested (Vitest).
- Renderer never touches DB or OS; only through typed IPC.

### Data model
- `sessions(id, start_ts, end_ts NULL, source 'manual'|'wifi', note)`; an open session has `end_ts NULL`
- `schedule(weekday 0-6, expected_minutes)`; expected work time per weekday
- `day_overrides(date, expected_minutes, kind 'holiday'|'vacation'|'sick'|'custom')`
- `settings(key, value)`; work SSIDs, grace period, theme, launch at login, week start
- Overtime for a day = worked minutes minus expected minutes. Balance = running sum over all days since first session.

### Wifi detection (macOS)
- Poll every ~10 s (and on network change events) for current SSID. Since macOS 14.4 `airport` is removed and SSID needs Location permission, so use a small approach: `networksetup -getairportnetwork en0` first, with fallback to `system_profiler`/CoreWLAN helper. **Spike this first (task 4.1)**; if SSID is redacted, we add a tiny signed Swift helper or request location permission.

## Features → Phases

### Phase 0: Foundation
- [x] 0.1 Scaffold electron-vite + React + TS, add Tailwind v4, Vitest, ESLint/Prettier
- [x] 0.2 better-sqlite3 + electron-rebuild wired, migration runner, smoke test
- [x] 0.3 Typed IPC + preload skeleton
- [x] 0.4 `.gitignore`, README, npm scripts (dev, build, test, rebuild)

### Phase 1: Core tracking (parallelizable: A/B/C)
- [x] 1.A Data layer: repositories for sessions, schedule, overrides, settings + tests
- [x] 1.B Shared logic: overtime/undertime math, range stats (7/30/90/365/all), tests
- [x] 1.C Design system: tokens, dark/light/system theme, primitives (Button, Card, Input, Toggle, Segmented, Stat, Chart shell). Run the design-taste skill first
- [x] 1.D Integrate: start/stop/pause session via IPC

### Phase 2: Screens (parallelizable after Phase 1)
- [x] 2.1 Today: big timer, start/stop, progress vs. expected, running balance
- [x] 2.2 Schedule/Settings: per-weekday expected hours editor, theme, wifi SSID, grace, launch at login
- [x] 2.3 History: day list, edit/add/delete sessions, per-day over/under badge
- [x] 2.4 Stats: 7d / 30d / 90d / 1y / all, with total, average/day, overtime, best day, chart

### Phase 3: Tray & background
- [x] 3.1 Tray icon + live elapsed title, quick start/stop menu
- [x] 3.2 Close-to-tray, launch at login, single instance
- [x] 3.3 Crash safety: recover open session on relaunch

### Phase 4: Wifi auto-tracking
- [x] 4.1 Spike: reliable SSID read on current macOS (document result here)
  - **Spike result (Darwin 25):** `networksetup -getairportnetwork en0` wrongly reports "not associated"; `ipconfig getsummary en0` and `system_profiler SPAirPortDataType` return `<redacted>` for SSID/BSSID; `wdutil info` needs sudo. So nothing works without Location permission. Fallback: CoreWLAN Swift helper at src/main/wifi/helper/ssid.swift (build note inside; needs NSLocationUsageDescription in Info.plist, Location permission granted to the app, and com.apple.security.personal-information.location entitlement if sandboxed/signed hardened). src/main/wifi/ssid.ts tries networksetup, then the helper (TTT_SSID_HELPER or Resources/ssid-helper).
- [x] 4.2 Watcher with debounce + grace period, source='wifi' sessions
- [ ] 4.3 Settings UI: detect current network, choose work SSID(s), status indicator
- [ ] 4.4 Notifications on auto start/stop

### Phase 5: Polish
- [ ] 5.1 Holidays/vacation day overrides
- [ ] 5.2 Export: .docx timesheet (with signature lines) + Markdown/WhatsApp text
- [ ] 5.3 Empty states, animations, keyboard shortcuts, a11y pass
- [ ] 5.4 App icon, packaging (electron-builder dmg)
- [ ] 5.5 Final review (/code-review) and README

## Subagent plan
- After Phase 0: run **1.A, 1.B, 1.C in parallel** (disjoint files: `main/db`, `shared`, `renderer/components + styles`).
- After Phase 1: run **2.1–2.4 in parallel** (one page each) and **3.x / 4.1 spike** alongside.
- Each subagent must tick its own boxes in this file and append to the Session Log.

## Session Log
- 2026-09-19: Questions answered (macOS, TS+electron-vite, SQLite, tray+auto). Plan written. No code yet.
- 2026-09-19: Phase 0 done (electron-vite scaffold, Tailwind v4, Vitest, SQLite+migrations, typed IPC ping). Notes: vite pinned ^7 + plugin-react ^5 (electron-vite peer); better-sqlite3 13 ships prebuilds for Electron+Node, no rebuild step needed. Shared types in src/shared/types.ts. Next: Phase 1 (A/B/C in parallel).
- 2026-09-19: 1.A done: src/main/db/repos.ts createRepos(db) -> {sessions, schedule, overrides, settings} + repos.test.ts.
- 2026-09-19: 1.B done: src/shared/time.ts (+stats.ts re-export, format.ts, time.test.ts); credited day => worked=max(actual,expected), expected=override.expectedMinutes ?? schedule.
- 2026-09-19: 1.C done: index.css tokens (bg/surface/raised/sunken/line/fg/muted/faint/accent/over/under/danger/sidebar, radius, shadow-card/pop, SF font stack; dark via html[data-theme] or system fallback), lib/theme.ts (applyTheme, useTheme, getStoredTheme), components/ui/* (Button, IconButton, Card, Input, NumberField, TimeField, Toggle, Segmented, Stat, Badge, ProgressRing, ProgressBar, Sidebar, AppShell, BarChart, Gallery temp; barrel index.ts). Added dep @phosphor-icons/react. Call applyTheme(getStoredTheme()) at startup; wrap App in <AppShell>.
- 2026-09-19: 1.D done: full IPC contract in src/shared/ipc.ts + handlers in src/main/index.ts; App.tsx routes to stub pages in src/renderer/src/pages/{Today,History,Stats,Settings}.tsx. Next: Phase 2 pages + 3.x tray + 4.1 spike in parallel.
- 2026-09-19: 2.1 done: pages/Today.tsx (live ring timer, Start/Pause, remaining/overtime + projected finish, balance, session list, week BarChart; refetch on focus + 30s).
- 2026-09-19: 2.4 done: Stats page (src/renderer/src/pages/Stats.tsx + pages/stats/aggregate.ts); range picker, headline stats, day/week/month chart with delta toggle, weekday averages, empty state.
- 2026-09-19: 2.2 done: pages/Settings.tsx (schedule editor+presets+week start, theme via useTheme+settings:set, autoTrack/SSIDs/grace, launch at login, credit kinds; auto-save w/ Saved indicator). SSID detect uses local detectSsid() shim calling window.api['wifi:current'] with manual fallback; swap when wifi IPC lands (4.3 UI done).
- 2026-09-19: 2.3 done: pages/History.tsx (month nav, weekly groups + subtotals, expandable days, session add/edit/delete, per-day override control). Overrides UI (vacation/sick/holiday/custom/clear) exists, i.e. UI half of 5.1 done.
- 2026-09-19: 3.1-3.3 done: src/main/tray/ (generated template clock icon, live H:MM title, Start/Pause/Open/Quit), close-to-tray + single instance + launch-at-login (settings:set wrapped), stale-session recovery via meta table (migration #2, heartbeat 30s) + src/main/recovery.ts (tested), push channel 'sessions:changed' -> window.events.onSessionsChanged(cb) returns unsubscribe.
- 2026-09-19: 4.1/4.2 done: src/main/wifi/{ssid.ts,watcher.ts,watcher.test.ts,helper/ssid.swift}. SSID is redacted w/o Location permission -> needs compiled Swift helper + permission before wifi auto-track works. Watcher: createWifiWatcher(...) with tick/start/stop/markManual/startedByWatcher; wire in later.
