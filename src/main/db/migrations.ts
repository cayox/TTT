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
  `,
  `
  CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'brass',
    archived INTEGER NOT NULL DEFAULT 0
  );
  ALTER TABLE sessions ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
  CREATE INDEX idx_sessions_project ON sessions(project_id);
  INSERT INTO projects (name, color) VALUES ('General', 'brass');
  UPDATE sessions SET project_id = (SELECT id FROM projects LIMIT 1);
  `,
  `
  -- Existing installs already know their way around: skip the welcome flow for them.
  INSERT OR IGNORE INTO settings (key, value) SELECT 'onboarded', 'true' WHERE EXISTS (SELECT 1 FROM sessions);
  `,
  `
  -- The monthly goal became monthly contract hours.
  INSERT OR IGNORE INTO settings (key, value) SELECT 'monthlyHoursMin', value FROM settings WHERE key = 'monthlyGoalMin';
  DELETE FROM settings WHERE key = 'monthlyGoalMin';
  `
]
