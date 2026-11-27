# Changelog

What changed in each release. TTT shows the entries newer than your version before it updates.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0-beta.1] - 2026-11-27

### Added

- Work places: automatic tracking by where you are, not only by Wi-Fi. In Settings → Automatic tracking, name a place and choose **Add where I am now**, then pick its radius and project. A work network still wins when both match.

### Changed

- Sessions started automatically are labeled **Auto** instead of **Wi-Fi**.

### Fixed

- **Allow location access** now shows the macOS prompt. Before, it could stay on "Waiting…" without macOS ever asking. If macOS still shows no prompt, TTT now offers to open System Settings instead. After this update, macOS may ask for Location access once more.

## [0.3.0-beta.1] - 2026-11-26

### Added

- A time interval for picking times (Settings → Work time → Time entry). Default is 15 minutes; choose 5, 10, 30 or any minute.
- Clock out ahead of time: on Today, **Clock out at…** sets when the running session ends, so you can do it before you leave. A time that has already passed ends the session right away.
- Break rules (German Working Hours Act): reminders when a break is due, the finish time on Today plans the break in, and History and timesheets flag days that miss it. Optionally deduct a missed break from the counted time (Settings → Work time → Breaks).
- Time away from your Mac: after a while without input, or after sleep, TTT asks when you are back whether that time was work, and can take it out (Settings → Tracking → Away from your Mac).
- Forgotten sessions: a session running 12 hours (adjustable) is ended when you were last at your Mac, or TTT asks if you are still there.
- Notifications for automatic tracking, today's hours done, breaks, planned clock-out and forgotten sessions, each switchable in Settings → General.
- Workdays with nothing tracked show on Today, one click away from fixing them in History.
- TTT suggests your usual project for the weekday and hour, and Today shows when you will reach your monthly hours at your current pace.
- Daily backups (two weeks kept), plus one before every database upgrade, with restore in Settings → Data & export.
- Export and import all data as JSON, every session as CSV, and a month as CSV or calendar file (.ics). Exports can round times to 5–30 minutes.
- A global shortcut to start or pause from any app, and `ttt://` links (start, pause, toggle, open) for Shortcuts and launchers.
- Search notes and filter by project in History; Undo after editing a session.
- Copy diagnostics and a log file for bug reports (Settings → Data & export).

### Changed

- Archiving a project with monthly hours offers to move its hours to the default project.
- The window runs sandboxed.

### Fixed

- Sessions can no longer overlap, end before they start or lie in the future; time already covered twice counts once, and History marks such sessions.
- Broken or out-of-range settings fall back to their defaults instead of breaking the numbers.
- Pausing while still on a work Wi-Fi no longer gets restarted by automatic tracking a few seconds later. It starts again once you have left the network and come back.
- Today and the menu bar now switch to the new day after midnight, even when no timer is running.
- Automatic tracking stops a Wi-Fi session again after TTT restarted (for example after an update); before, it ran until you paused it.
- Time asleep no longer counts: when the Mac wakes after a long sleep, even on the work network, the session ends when you were last seen and a new one starts.
- TTT now learns a work network's router whenever it can read the name, so it still recognizes the network when macOS hides the name later.
- A router that dropped out of the network cache is pinged once and read again, instead of counting as "away".

## [0.2.0-beta.1] - 2026-09-20

### Added

- Automatic updates: TTT checks GitHub releases, shows you what changed, and installs the update on your word.
- This changelog, readable in Settings under **What's new**.
- A proper Location permission request, so macOS lets TTT read Wi-Fi names instead of hiding them.

### Fixed

- Clicking the menu bar icon only opens its menu now; it no longer opens the window behind it.

## [0.1.0-beta.2] - 2026-09-19

### Changed

- Redesigned the Today page around a calmer hierarchy.

## [0.1.0-beta.1] - 2026-09-19

### Added

- First beta: day, week and month tracking with an overtime balance.
- Projects, with per-project monthly hours.
- Automatic tracking from your work Wi-Fi, with a grace period when you leave.
- A menu bar timer with a ring that fills as you work through the day.
- PDF timesheets and WhatsApp summaries.
- A welcome flow covering schedule, projects and automatic tracking.
