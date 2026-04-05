# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WorkHours** — a workforce hours management system for allocating employee time across clients. Hebrew RTL interface. Used by a design agency (~15 employees, ~22 clients) to plan monthly hours, distribute workload, and generate reports.

## Development Commands

```bash
npm run dev          # Vite dev server on :3000 (proxies /api → :4000)
npm run server       # Fastify API server on :4000
npm run build        # Production build → dist/

# Both must run simultaneously for local dev
npm run server &     # start backend
npm run dev          # start frontend

# Admin seeding
node scripts/seed-admin.js --email admin@example.com --password secret --name Admin

# Data migration from old localStorage
node scripts/migrate-localstorage.js data-export.json
```

## Deployment & CI/CD

```
main (legacy, not used)
production  ← PR + 1 dev approval → auto-deploys to hours.tidyframework.com  [DEFAULT BRANCH]
staging     ← PR, no approval needed → auto-deploys to staging.hours.tidyframework.com
feature/*   ← anyone pushes freely
```

- **GitHub Actions** (`.github/workflows/deploy.yml`) SSHs into the DO droplet and runs `deploy.sh`
- **Production**: PM2 process `kido-hours` on port 4000, path `~/kido-worker-hours/`
- **Staging**: PM2 process `kido-staging` on port 4001, path `~/kido-worker-hours-staging/`, separate `data.db`
- **To deploy**: push to a branch → PR to `staging` → merge → test → PR to `production` → get approval → merge
- **Default GitHub branch**: `production` (PRs default to targeting `production`)

**SQLite WAL files on server:** SQLite WAL mode creates `data.db-shm` and `data.db-wal` sidecar files when the process runs. These are excluded in `.gitignore` but exist on the server as untracked files. Both `deploy.sh` scripts include `rm -f data.db-shm data.db-wal` before `git pull` to prevent git merge conflicts.

**Pre-deploy DB backup:** Both `deploy.sh` scripts run `cp data.db "data.db.bak.$(date +%Y%m%d%H%M%S)"` before `git pull`, keeping the 7 most recent backups. If a deploy corrupts the database, restore with `cp data.db.bak.<timestamp> data.db`.

## Architecture

### Frontend (`src/client/`)

Vanilla JS ES modules bundled by Vite. **No framework** — pages render by setting `innerHTML` via render functions. SPA routing via `navigate(page)` in `router.js`.

**Key files:**
| File | Purpose |
|------|---------|
| `main.js` | Entry point: async `init()`, login page, `logout()`, registers renderers |
| `router.js` | `navigate()`, `renderPage()`, `onMonthChange()`, mutable view state |
| `state.js` | Singleton `state` object, `loadState()` (async, fetches from API), `saveState()` (no-op) |
| `api.js` | Fetch wrapper: `api.get/post/put/patch/delete()`, auto-shows toast on errors, redirects to login on 401 via `setLoginHandler()` |
| `utils.js` | `closeModal()`, `mkLabel()`, `initMonthSelect()`, `showToast(msg, type)`, `withLoading(btn, asyncFn)`, badge helpers |
| `working-days.js` | `getEmpHours()`, `getClientHours()`, `calcMonthWorkDays()` |
| `aggregations.js` | `getEmpAllocated()`, `getClientAllocated()`, `getEmpActiveClients()` |
| `hebrew-calendar.js` | Hebrew holiday calculation (pure functions) |
| `constants.js` | `MONTHS`, `MONTH_NAMES_HE` arrays |

**Pages** (`src/client/pages/`):
| File | Page | Key exports |
|------|------|-------------|
| `overview.js` | Dashboard + charts | `renderOverview()`, `initCharts()` |
| `clients.js` | Client management | `renderClients()`, `saveClient()`, `deleteClient()` |
| `employees.js` | Employee management | `renderEmployees()`, `saveEmployee()`, `openEmpModal()`, `saveMonthSetup()` |
| `matrix.js` | Allocation matrix | `renderMatrix()`, `onMatrixChange()`, `copyAllocations()` |
| `auto-distribute.js` | Auto-distribution | `autoDistribute()`, `_split5()` |
| `weekly-schedule.js` | Weekly schedule | `renderWeeklySchedule()`, `wsToggleClient()`, `wsShowPopover()` |
| `settings.js` | Settings + export | `renderSettings()`, `deleteMonth()` |

**Rendering pattern:**
```js
// Every page exports a renderXxx() function that returns an HTML string
export function renderClients() {
  return `<div>...</div>`;
}
// Event handlers are attached as inline onclick="functionName(args)"
// Functions must be on window.* to be accessible from inline handlers
window.saveClient = saveClient;
```

**State flow:**
1. `main.js` calls `loadState()` → fetches all data from API in parallel
2. Local `state` object is the in-memory cache; UI reads from it directly
3. Every user mutation calls a specific API endpoint (e.g., `api.patch('/api/matrix/...')`)
4. Then calls `renderPage()` to re-render the current page
5. `saveState()` is a no-op — kept for compatibility, does nothing

**Circular dependency resolution:**
- `router.js` exports `setRenderers()` — called by `main.js` with page render functions
- `clients.js` uses dynamic `import()` for `openEmpModal` from `employees.js`
- `api.js` exports `setLoginHandler(fn)` — called by `main.js` to register `showLogin`; avoids `window.__showLogin` hack
- `api.js` imports `showToast` from `utils.js` (not circular — utils.js does not import api.js)

### Backend (`src/server/`)

Fastify 5 with plugin architecture. SQLite via better-sqlite3 (synchronous). Session cookies via `@fastify/session` + bcrypt.

**Key files:**
| File | Purpose |
|------|---------|
| `index.js` | Fastify setup, SQLiteStore for sessions, global error handler, session cleanup, registers all plugins, serves static `dist/` |
| `db.js` | Opens SQLite, enables WAL + foreign keys, runs `schema.sql` on startup |
| `schema.sql` | All table definitions + 6 performance indexes (idx_sessions_expires, idx_alloc_month, etc.) |
| `auth.js` | Login/logout/me endpoints, exports `requireAuth` and `requireAdmin` preHandlers |
| `utils.js` | `buildHoursMap(rows, idField)`, `serializeClient()`, `serializeEmployee()` — shared between routes and export |
| `validate.js` | Zod schemas + `validate(schema, data)` helper — throws 400 on invalid input; used by all mutation routes |

**Route plugins** (`src/server/routes/`):
| File | Endpoints |
|------|-----------|
| `clients.js` | GET/POST/PUT/DELETE `/api/clients`, PUT `/api/clients/:id/hours/:month`, PUT `/api/clients/:id/billed/:month` |
| `employees.js` | GET/POST/PUT/DELETE `/api/employees`, PUT `/api/employees/:id/hours/:month` |
| `months.js` | GET/POST/PUT/DELETE `/api/months` |
| `vacations.js` | GET/PUT `/api/vacations/:month/:empId` |
| `matrix.js` | GET/PUT `/api/matrix/:month`, PATCH `/api/matrix/:month/:empId/:clientId` |
| `weekly.js` | GET/PUT/DELETE `/api/weekly/:month`, PATCH `/api/weekly/:month/:empId/:day` |
| `users.js` | GET `/api/users`, POST `/api/users/invite`, POST `/api/users/accept-invite` |

All routes except auth endpoints require session authentication via `requireAuth` preHandler.

### Database Schema

SQLite with these tables: `users`, `sessions`, `clients`, `employees`, `months`, `client_monthly_hours`, `client_billed_hours`, `employee_monthly_hours`, `vacations`, `allocations`, `weekly_schedule`. See `src/server/schema.sql` for full definitions.

**Key relationships:**
- `allocations` → links employees to clients per month with hours
- `weekly_schedule` → links employees to client arrays per day per month
- `client_monthly_hours` / `client_billed_hours` → hours per client per month
- `employee_monthly_hours` → optional override for auto-calculated hours

## Data Structures

**State object (same shape client ↔ server):**
```js
state.matrix[monthKey][empId][clientId] = hours        // allocation grid
state.weeklySchedule[monthKey][empId][day] = [clientId] // weekly schedule
state.monthSetup[monthKey] = { workDays }               // month config
state.vacations[monthKey][empId] = days                  // vacation days
```

**Month key format:** `"YYYY-MM"` (e.g., `"2026-04"`)

**Client object:**
```js
{ id, name, type, active, monthlyHours:{mk:hours}, billedHours:{mk:hours}, hoursBank, weeklyDay:[0-4] }
// type: 'retainer' | 'project' | 'internal'
```

**Employee object:**
```js
{ id, name, role, email, slackWebhook, scope, visible, hidden, monthlyHours:{mk:hours}, preferredClients:[clientId] }
// scope: 1-100 (percent of full time)
// visible + hidden must stay in sync (hidden = !visible)
```

## Critical Implementation Rules

**DO NOT wrap route plugins with `fastify-plugin` (`fp()`).** Each plugin uses `fastify.addHook('preHandler', requireAuth)` — without `fp()`, hooks are scoped to that plugin only. With `fp()`, hooks leak globally and break the public login endpoint (returns 401 on everything).

**Employee `visible`/`hidden` duality.** Employees have both fields. Different modules check different fields (`e.visible !== false` vs `!e.hidden`). Always update BOTH when toggling. `loadState()` maps `hidden: !e.visible`.

**Client-generated IDs.** Client code generates IDs (`'c'+Date.now()`, `'e'+Date.now()`) and passes them to POST endpoints. Server uses client-provided ID if present, otherwise generates with nanoid.

**Allocations are multiples of 5.** The `_split5()` function in `auto-distribute.js` uses largest-remainder method.

**Max 6 clients per employee** in the allocation matrix.

**Auto-distribution** only assigns to `preferredClients` per employee. Unassigned hours are left empty for manual editing.

**`trustProxy: true`** is set on Fastify because Nginx terminates SSL. Without it, `@fastify/session` won't set secure cookies (it checks `request.protocol`).

## Business Logic Formulas

```
Employee hours/month = workDays × 7 × (scope/100) - (vacationDays × 7)
                       ↑ can be overridden per month via monthlyHours

Client hours/month   = monthlyHours[mk] (set manually per month)

Project bank remaining = hoursBank - Σ(billedHours for all previous months)
```

## Environment

Copy `.env.example` to `.env`:
- `SESSION_SECRET` — random string ≥32 chars (`openssl rand -hex 32`)
- `DB_PATH` — path to SQLite file (default: `./data.db`)
- `PORT` — server port (default: 4000)

## Language & Style

- UI text is **Hebrew (RTL)**. All user-facing strings are in Hebrew.
- Variable names and code are **English**.
- `FUNCTIONALITY.md` contains the complete feature specification in Hebrew — read it before making UI changes.
- No framework — all rendering is `innerHTML` with template literals.
- Event handlers use inline `onclick="fn()"` — functions must be on `window.*`.
- CSS is in `src/client/style.css` — CSS custom properties in `:root` for theming.

## Semantic IDs & Classes (for targeting UI elements)

All pages have been annotated with semantic IDs and classes. Use these when making targeted changes.

### Login (`main.js`)
`#login-page`, `#login-card`, `#login-logo`, `#login-form`, `#login-error`, `#btn-login`

### Sidebar (`index.html`)
`#btn-new-month`

### Overview (`pages/overview.js`)
- Container: `#overview-page`, `#overview-alerts`, `#overview-kpis`, `#overview-charts`, `#overview-client-status`, `#overview-client-tbl`, `#overview-biz-insights`
- KPI cards: `#kpi-client-hours`, `#kpi-emp-capacity`, `#kpi-utilization`, `#kpi-capacity-gap`, `#kpi-work-days`, `#kpi-vacation-days`
- Chart cards: `#chart-card-alloc`, `#chart-card-type`, `#chart-card-trend`
- Insight sections: `#ins-emp-util`, `#ins-client-cov`, `#ins-holidays`, `#ins-vacations`, `#ins-project-bank`, `#ins-trend`
- Dynamic attributes: `data-emp-id`, `data-client-id`, `data-date` on rows

### Clients (`pages/clients.js`)
- Container: `#clients-page`, `#clients-card`, `#clients-tbl`
- Buttons: `#btn-toggle-inactive`, `#btn-add-client`, `#btn-save-client`
- Modal: `#modal-client`, `#client-emp-pref-grid`
- Rows: `.client-row[data-client-id]`
- Cell classes: `.client-name-cell`, `.client-type-cell`, `.client-hours-cell`, `.client-bank-cell`, `.client-alloc-cell`, `.client-util-cell`, `.client-actions-cell`
- Button classes: `.btn-edit-client`, `.btn-delete-client`, `.btn-cancel`

### Employees (`pages/employees.js`)
- Container: `#employees-page`, `#emp-list-card`, `#emp-tbl`
- Buttons: `#btn-show-all-emps`, `#btn-hide-all-emps`, `#btn-send-all-alloc`, `#btn-add-emp`, `#btn-save-emp`, `#btn-send-all-email`, `#btn-send-all-slack`
- Modals: `#modal-employee`, `#modal-send-alloc`, `#modal-send-all`, `#modal-month-setup`
- Month setup sections: `#ms-month-picker`, `#ms-calendar`, `#ms-workdays`, `#ms-vacations`, `#ms-new-clients`
- Month setup buttons: `#btn-add-vac`, `#btn-add-nc`, `#btn-save-month`
- Rows: `.emp-row[data-emp-id]`; cards: `.emp-card[data-emp-id]`
- Cell classes: `.emp-name-cell`, `.emp-role-cell`, `.emp-hours-cell`, `.emp-vac-cell`, `.emp-actions-cell`
- Button classes: `.btn-edit-emp`, `.btn-delete-emp`, `.btn-send-alloc`, `.btn-reset-hours`

### Matrix (`pages/matrix.js`)
- Container: `#matrix-page`, `#matrix-legend`, `#matrix-kpis`, `#matrix-toolbar`, `#matrix-layout`, `#matrix-wrap`, `#matrix-tbl`, `#matrix-tbody`, `#matrix-col-totals`
- Controls: `#btn-auto-distribute`, `#matrix-client-count`, `#matrix-sub`

### Weekly Schedule (`pages/weekly-schedule.js`)
- Container: `#weekly-page`, `#weekly-title`, `#weekly-sub`, `#weekly-actions`, `#weekly-week-tabs`, `#weekly-hint`, `#weekly-tbl-wrap`, `#weekly-tbl`, `#weekly-tbody`
- Buttons: `#btn-clear-weekly`, `#btn-auto-weekly`
- Rows: `.weekly-emp-row[data-emp-id]`; cells: `.weekly-emp-name-cell`, `.weekly-emp-hours`

### Settings (`pages/settings.js`)
- Container: `#settings-page`, `#settings-months-card`, `#settings-months-tbl`, `#settings-export-card`, `#settings-account-card`
- Buttons: `#btn-select-all-months`, `#btn-deselect-all-months`, `#btn-export-excel`, `#btn-export-json`, `#btn-logout`
- Rows: `.month-row[data-month]`; cells: `.month-name-cell`, `.month-actions-cell`
- Button classes: `.btn-export-month`, `.btn-delete-month`
