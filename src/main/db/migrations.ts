export const migrations: string[] = [
  `
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_ts INTEGER NOT NULL,
    end_ts INTEGER,
    source TEXT NOT NULL DEFAULT 'manual',
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_sessions_start ON sessions(start_ts);
  CREATE TABLE schedule (weekday INTEGER PRIMARY KEY, expected_minutes INTEGER NOT NULL);
  CREATE TABLE day_overrides (
    date TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    expected_minutes INTEGER
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `
]
