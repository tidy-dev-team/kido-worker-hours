# Plan: Convert WorkHours Prototype to Production App

## Status
- ✅ **Phase 1 complete** — Monolith split into Vite + ES modules (`src/client/`). App works identically with localStorage.
- ✅ **Phase 2 complete** — Fastify backend + SQLite + auth (session cookies, bcrypt, invite flow) + all CRUD/matrix/weekly/export routes + seed + migrate scripts.
- ✅ **Phase 3 complete** — Frontend fully connected to backend API. `saveState()` is a no-op; every mutation calls a specific endpoint. Login page + 401 redirect added.
- 🔜 **Phase 4 next** — Deploy to DigitalOcean (PM2 + Nginx + SSL + cron backup).

## Context

The current app is a **single `index.html` file** (~3,065 lines: 182 CSS, 26 HTML, 2,845 JS) that runs entirely in the browser with localStorage. It works but is fragile — data lives only in one browser, there's no auth, no backup, and the monolith is hard to maintain. We need to turn it into a real, deployable, multi-user application while keeping it lightweight.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Vanilla JS + **Vite** bundler | The existing ~2,845 lines of render-via-innerHTML work fine at this scale. A framework rewrite adds months of work for no user-facing benefit. Vite gives us ES modules, HMR, and optimized builds with zero config. |
| **Backend** | **Node.js + Fastify** | Same language as frontend. Fastify's plugin system maps 1:1 to future integrations (each Wrike/Slack integration = one plugin file). Fast, low overhead. |
| **Database** | **SQLite via better-sqlite3** | Single-team tool with 5-20 users. Zero-ops (no DB server), trivial backup (copy one file), fast synchronous reads. Easy migration to PostgreSQL later if ever needed. |
| **Auth** | **Session cookies** (fastify/session + bcrypt) | Simpler than JWT for single-server. httpOnly cookies, server-side session store in SQLite. Instant revocation. |
| **Deploy** | **PM2 + Nginx** on existing DO droplet | PM2 for process management, Nginx as reverse proxy with Let's Encrypt SSL. No Docker needed for a single-process app. |

---

## Project Structure

```
kido-worker-hours/
├── package.json
├── vite.config.js
├── .env / .env.example
│
├── src/
│   ├── client/                          # Frontend (served as static by Fastify)
│   │   ├── index.html                   # Shell: nav, #app, #modal-root
│   │   ├── main.js                      # Entry: imports modules, calls init()
│   │   ├── style.css                    # Extracted from current <style> (lines 9-190)
│   │   ├── api.js                       # fetch wrapper for /api/* calls
│   │   ├── router.js                    # navigate(), onMonthChange()
│   │   ├── state.js                     # Client-side state cache + API sync
│   │   ├── utils.js                     # closeModal(), mkLabel(), shared helpers
│   │   ├── hebrew-calendar.js           # Lines 229-273 (pure functions, unchanged)
│   │   ├── working-days.js              # Lines 291-347 (calc functions)
│   │   └── pages/
│   │       ├── overview.js              # Dashboard + charts (lines 463-714)
│   │       ├── insights.js              # Business insights engine (lines 715-917)
│   │       ├── clients.js               # Client management (lines 918-~1151)
│   │       ├── employees.js             # Employee management (lines ~1152-1940)
│   │       ├── matrix.js                # Allocation matrix + inputs (lines ~1941-2547)
│   │       ├── auto-distribute.js       # _split5(), autoDistribute()
│   │       ├── weekly-schedule.js       # Weekly schedule + popover (lines 2563-2838)
│   │       └── settings.js              # Settings + export (lines 2839-3058)
│   │
│   └── server/
│       ├── index.js                     # Fastify setup, register plugins, serve static
│       ├── db.js                        # better-sqlite3 init + migrations
│       ├── schema.sql                   # Table definitions
│       ├── auth.js                      # Fastify plugin: login, session, invite
│       ├── routes/
│       │   ├── clients.js               # CRUD /api/clients
│       │   ├── employees.js             # CRUD /api/employees
│       │   ├── matrix.js               # GET/PUT/PATCH /api/matrix/:month
│       │   ├── months.js                # CRUD /api/months
│       │   ├── vacations.js             # GET/PUT /api/vacations/:month
│       │   ├── weekly-schedule.js       # GET/PUT/PATCH /api/weekly/:month
│       │   ├── export.js                # GET /api/export (XLSX generation)
│       │   └── users.js                 # Invite, list users
│       └── integrations/
│           ├── slack.js                 # Future: server-side Slack webhooks
│           └── wrike.js                 # Future: Wrike API sync
│
└── scripts/
    ├── migrate-localstorage.js          # One-time: JSON → SQLite
    └── seed-admin.js                    # Create first admin user
```

---

## Database Schema

```sql
-- Auth
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  invite_token TEXT,
  invite_expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Core entities
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('retainer','project','internal')),
  active INTEGER NOT NULL DEFAULT 1,
  hours_bank REAL,
  weekly_day TEXT,              -- JSON array e.g. '[0,2]'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  email TEXT DEFAULT '',
  slack_webhook TEXT DEFAULT '',
  scope INTEGER NOT NULL DEFAULT 100,
  visible INTEGER NOT NULL DEFAULT 1,
  preferred_clients TEXT,      -- JSON array of client IDs
  created_at TEXT DEFAULT (datetime('now'))
);

-- Per-month configuration
CREATE TABLE months (
  month_key TEXT PRIMARY KEY,
  work_days REAL,
  holidays TEXT                -- JSON array of day numbers
);

-- Monthly hours (replaces nested monthlyHours objects)
CREATE TABLE client_monthly_hours (
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  month_key TEXT,
  hours REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, month_key)
);

CREATE TABLE client_billed_hours (
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  month_key TEXT,
  hours REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, month_key)
);

CREATE TABLE employee_monthly_hours (
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  month_key TEXT,
  hours REAL NOT NULL,
  PRIMARY KEY (employee_id, month_key)
);

CREATE TABLE vacations (
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  month_key TEXT,
  days REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (employee_id, month_key)
);

-- Allocation matrix (flattened from state.matrix[mk][eid][cid])
CREATE TABLE allocations (
  month_key TEXT NOT NULL,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  hours REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (month_key, employee_id, client_id)
);

-- Weekly schedule (flattened from state.weeklySchedule[mk][eid][day])
CREATE TABLE weekly_schedule (
  month_key TEXT NOT NULL,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  client_ids TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (month_key, employee_id, day)
);
```

---

## API Endpoints

All routes require authenticated session except `/api/auth/login` and `/api/auth/accept-invite`.

```
Auth:
  POST   /api/auth/login
  POST   /api/auth/logout
  GET    /api/auth/me

Users (admin only):
  GET    /api/users
  POST   /api/users/invite
  POST   /api/users/accept-invite    (public, with token)

Clients:
  GET    /api/clients
  POST   /api/clients
  PUT    /api/clients/:id
  DELETE /api/clients/:id
  PUT    /api/clients/:id/hours/:month
  PUT    /api/clients/:id/billed/:month

Employees:
  GET    /api/employees
  POST   /api/employees
  PUT    /api/employees/:id
  DELETE /api/employees/:id
  PUT    /api/employees/:id/hours/:month

Matrix:
  GET    /api/matrix/:month
  PUT    /api/matrix/:month           (bulk update)
  PATCH  /api/matrix/:month/:empId/:clientId  (single cell)
  POST   /api/matrix/:month/distribute

Months:
  GET    /api/months
  POST   /api/months
  PUT    /api/months/:month
  DELETE /api/months/:month

Vacations:
  GET    /api/vacations/:month
  PUT    /api/vacations/:month/:empId

Weekly:
  GET    /api/weekly/:month
  PUT    /api/weekly/:month
  PATCH  /api/weekly/:month/:empId/:day
  POST   /api/weekly/:month/distribute
  DELETE /api/weekly/:month

Export:
  GET    /api/export?months=2026-01,2026-02
```

---

## Implementation Phases

### Phase 1: Frontend Modularization (no backend yet)

**Goal:** Break the monolith into ES modules. App still works with localStorage.

1. `npm init`, install `vite`, `chart.js`, `xlsx` as npm deps
2. Create `src/client/index.html` — minimal shell (nav + `#app` + `#modal-root`)
3. Extract CSS → `src/client/style.css`
4. Extract JS into modules following the existing section boundaries:
   - `hebrew-calendar.js` — lines 229-273 (pure functions, copy as-is)
   - `working-days.js` — lines 291-347
   - `state.js` — lines 275-289 (still uses localStorage for now)
   - `router.js` — lines 414-444
   - `utils.js` — shared helpers (mkLabel, closeModal, etc.)
   - `pages/*.js` — one file per page render function
5. Wire up imports in `main.js`, verify `vite dev` works identically to current

**Verification:** Open in browser, click through all 6 pages, edit a matrix cell, check localStorage is still updating.

### Phase 2: Backend + Database

**Goal:** Fastify server with SQLite, all API routes, auth.

1. Set up `src/server/index.js` with Fastify
2. Create `schema.sql`, implement `db.js` with auto-migration on startup
3. Implement auth plugin (session cookies, bcrypt, invite flow)
4. Implement all CRUD routes (clients, employees, months, vacations)
5. Implement matrix and weekly-schedule routes (bulk + single-cell)
6. Move Excel export to server-side (`/api/export`)
7. Create `scripts/seed-admin.js` for initial admin account
8. Create `scripts/migrate-localstorage.js` (reads exported JSON, inserts into SQLite)

**Verification:** Test all endpoints with curl/Postman. Seed data, verify CRUD works.

### Phase 3: Connect Frontend to Backend

**Goal:** Replace localStorage with API calls.

1. Create `api.js` — fetch wrapper with error handling and 401 redirect
2. Rewrite `state.js`:
   - `loadState()` → fetches all data from API on app init
   - `saveState()` → removed; individual mutations call specific API endpoints
   - Keep local state object as cache for snappy UI
3. For matrix `oninput` handlers: update local state immediately, debounce PATCH calls (300ms)
4. Add login page, redirect to login on 401
5. Add user management UI in Settings page (admin only)

**Verification:** Full end-to-end test: login → navigate all pages → edit matrix → add client → export Excel → logout.

### Phase 4: Deploy

1. Configure Vite to build frontend to `dist/`
2. Fastify serves `dist/` as static files + `/api/*` routes
3. On the DO droplet:
   - Install Node.js, PM2
   - Clone repo, `npm ci && npm run build`
   - Configure `.env` (SESSION_SECRET, DB_PATH)
   - `pm2 start src/server/index.js --name kido-hours`
   - Nginx reverse proxy config with SSL (Let's Encrypt)
4. Set up daily SQLite backup via cron (`cp data.db /backups/data-$(date +%F).db`)
5. Create deploy script: `git pull && npm ci && npm run build && pm2 restart kido-hours`

### Phase 5: Integration Prep (future)

- Move Slack webhook sending from client → server (already has `slack_webhook` field on employees)
- Add `src/server/integrations/slack.js` as Fastify plugin
- Add `src/server/integrations/wrike.js` as Fastify plugin
- Each integration reads config from `.env`, registers routes under `/api/integrations/<name>/`

---

## Key Decisions

- **No framework rewrite.** The vanilla JS render pattern works. Vite modules give us the maintainability we need.
- **SQLite, not PostgreSQL.** For 5-20 users with simple data, SQLite is faster to develop, deploy, and back up. Migration path to PG exists if needed.
- **Sessions, not JWT.** Single server, single domain. Sessions are simpler and more secure.
- **No Docker.** Single Node process on an existing droplet. PM2 handles restarts.
- **Excel export moves server-side.** Keeps the XLSX library off the client bundle and enables future scheduled reports.

---

## Critical Files

- `index.html` — the entire monolith to decompose (lines 9-190 CSS, 218-3062 JS)
- `FUNCTIONALITY.md` — acceptance test checklist (every feature must survive the migration)
- `CLAUDE.md` — documents state structure and business rules
