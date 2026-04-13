-- Auth
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invite_token TEXT,
  invite_expires_at TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'he',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Core entities
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('retainer','project','internal')),
  active INTEGER NOT NULL DEFAULT 1,
  hours_bank REAL,
  weekly_day TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  email TEXT DEFAULT '',
  slack_webhook TEXT DEFAULT '',
  scope INTEGER NOT NULL DEFAULT 100,
  visible INTEGER NOT NULL DEFAULT 1,
  preferred_clients TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Per-month configuration
CREATE TABLE IF NOT EXISTS months (
  month_key TEXT PRIMARY KEY,
  work_days REAL,
  holidays TEXT
);

-- Monthly hours
CREATE TABLE IF NOT EXISTS client_monthly_hours (
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, month_key)
);

CREATE TABLE IF NOT EXISTS client_billed_hours (
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, month_key)
);

CREATE TABLE IF NOT EXISTS employee_monthly_hours (
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (employee_id, month_key)
);

CREATE TABLE IF NOT EXISTS vacations (
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  days REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (employee_id, month_key)
);

-- Allocation matrix
CREATE TABLE IF NOT EXISTS allocations (
  month_key TEXT NOT NULL,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  hours REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (month_key, employee_id, client_id)
);

-- Weekly schedule
CREATE TABLE IF NOT EXISTS weekly_schedule (
  month_key TEXT NOT NULL,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  client_ids TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (month_key, employee_id, day)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_expires   ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_alloc_month        ON allocations(month_key);
CREATE INDEX IF NOT EXISTS idx_alloc_emp          ON allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_weekly_month       ON weekly_schedule(month_key);
CREATE INDEX IF NOT EXISTS idx_cmh_client         ON client_monthly_hours(client_id);
CREATE INDEX IF NOT EXISTS idx_emh_emp            ON employee_monthly_hours(employee_id);
