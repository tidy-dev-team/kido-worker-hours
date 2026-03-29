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
main (legacy)
production  ← PR + 1 dev approval → auto-deploys to hours.tidyframework.com
staging     ← PR, no approval needed → auto-deploys to staging.hours.tidyframework.com
feature/*   ← anyone pushes freely
```

- **GitHub Actions** (`.github/workflows/deploy.yml`) SSHs into the DO droplet and runs `deploy.sh`
- **Production**: PM2 process `kido-hours` on port 4000
- **Staging**: PM2 process `kido-staging` on port 4001, separate `data.db`
- **To deploy**: push to a branch → PR to `staging` → merge → test → PR to `production` → get approval → merge

## Architecture

### Frontend (`src/client/`)

Vanilla JS ES modules bundled by Vite. **No framework** — pages render by setting `innerHTML` via render functions. SPA routing via `navigate(page)` in `router.js`.

**Key files:**
| File | Purpose |
|------|---------|
| `main.js` | Entry point: async `init()`, login page, `logout()`, registers renderers |
| `router.js` | `navigate()`, `renderPage()`, `onMonthChange()`, mutable view state |
| `state.js` | Singleton `state` object, `loadState()` (async, fetches from API), `saveState()` (no-op) |
| `api.js` | Fetch wrapper: `api.get/post/put/patch/delete()`, auto-redirects to login on 401 |
| `utils.js` | `closeModal()`, `mkLabel()`, `initMonthSelect()`, badge helpers |
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

### Backend (`src/server/`)

Fastify 5 with plugin architecture. SQLite via better-sqlite3 (synchronous). Session cookies via `@fastify/session` + bcrypt.

**Key files:**
| File | Purpose |
|------|---------|
| `index.js` | Fastify setup, SQLiteStore for sessions, registers all plugins, serves static `dist/` |
| `db.js` | Opens SQLite, enables WAL + foreign keys, runs `schema.sql` on startup |
| `schema.sql` | All table definitions (CREATE TABLE IF NOT EXISTS) |
| `auth.js` | Login/logout/me endpoints, exports `requireAuth` and `requireAdmin` preHandlers |

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
