# Codebase Analysis & Improvement Roadmap

## What's here

A functional jQuery-era SPA + Fastify backend that works for the current team size (~15 employees, ~22 clients) but has accumulated patterns that make changes expensive and risky. Maintainability score: **~2.5/10 frontend, ~4/10 backend**.

---

## If building from zero

### Frontend
- **Preact or Solid.js** instead of raw innerHTML — tiny bundle, component model, reactive rendering, no virtual DOM overhead. No need for React's full weight.
- **TypeScript** — the state shape (`state.matrix[mk][eid][cid]`) is complex enough that missing types cost real debugging time.
- **File-per-component** — one card, one modal, one table row = one file. Right now employees.js is 799 lines because a "page" contains 20 things.
- **Central store with subscriptions** (Zustand/nanostores) — no more `renderPage()` calls sprinkled through every event handler.
- No `window.functionName` hacks — inline handlers only exist because there's no component system.

### Backend
- **Zod on every route input** — currently zero validation; any garbage goes into the database.
- **JOINs instead of N+1** — `GET /api/clients` runs 3 queries, filters in JS. One query with LEFT JOIN would be correct.
- **Database indexes** on `users.email`, `sessions.expires_at`, `allocations(month_key, employee_id)` — currently every lookup is a full table scan.
- **Migration system** (even a simple versioned SQL files runner) — right now schema changes are impossible without wiping the database.
- **Shared serialization helpers** — the same `{ id, name, type, active: r.active===1, monthlyHours: Object.fromEntries(...) }` shape is copy-pasted between `GET /api/clients` and `GET /api/export`. Will drift.
- **Proper error handling** — no try/catch anywhere; SQLite errors surface as generic 500s.

---

## What NOT to do

- Don't rewrite frontend to React/Vue — the app is Hebrew RTL, the team is small, the bundle would balloon, and it provides zero user-facing value. Preact or Solid.js only if doing a full frontend rewrite.
- Don't migrate to PostgreSQL — SQLite is fine for this scale. WAL mode already handles concurrency.
- Don't add an ORM — better-sqlite3 is fast and the query surface is small. An ORM adds abstraction without benefit here.

---

## Incremental improvement plan (preserves all functionality)

Ordered by impact vs. risk. Each phase is independently deployable.

---

### Phase A — Backend: Indexes + N+1 queries
**Risk: None. Pure performance/correctness.**

1. Add to `schema.sql`:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
   CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
   CREATE INDEX IF NOT EXISTS idx_alloc_month ON allocations(month_key);
   CREATE INDEX IF NOT EXISTS idx_alloc_emp ON allocations(employee_id);
   CREATE INDEX IF NOT EXISTS idx_weekly_month ON weekly_schedule(month_key);
   CREATE INDEX IF NOT EXISTS idx_cmh_client ON client_monthly_hours(client_id);
   CREATE INDEX IF NOT EXISTS idx_emh_emp ON employee_monthly_hours(employee_id);
   ```
   SQLite applies these on next startup (IF NOT EXISTS = safe).

2. Rewrite `GET /api/clients` and `GET /api/employees` to use JOINs instead of 3-query + filter-in-JS pattern. Replace in clients.js and employees.js only; all other routes unchanged.

3. Add shared serializer helper `src/server/utils.js` to avoid GET vs export drift.

**Files:** `schema.sql`, `routes/clients.js`, `routes/employees.js`, new `server/utils.js`

---

### Phase B — Backend: Input validation + error handling
**Risk: Low. Additive only — existing valid calls pass through unchanged.**

1. Add `zod` as dependency.
2. Create `src/server/validate.js` — thin wrapper that calls `schema.parse(body)` and throws 400 with message on failure.
3. Add schemas and validation to each route — fields, types, ranges. Examples:
   - employee scope: 1–100
   - hours: non-negative number
   - month_key: `/^\d{4}-\d{2}$/`
   - type: enum('retainer', 'project', 'internal')
4. Add a global error handler in `index.js` — catches thrown errors, logs them, returns `{ error: message }` with proper status.
5. Add expired session cleanup: cron-style `setInterval` every 24h to `DELETE FROM sessions WHERE expires_at < datetime('now')`.

**Files:** `package.json`, new `server/validate.js`, all route files, `index.js`

---

### Phase C — Frontend: Error handling + loading states
**Risk: Low. Additive, doesn't touch rendering logic.**

1. Add try/catch to all `api.get/post/put` calls in page modules — right now any failure is a silent crash.
2. Show toast/alert on API errors (reuse existing alert pattern from overview.js).
3. Add a simple `withLoading(btn, asyncFn)` utility — disables button, shows "…", re-enables after. Apply to all save/delete buttons.
4. Fix `api.js` to not use `window.__showLogin` hack — use a proper event (`CustomEvent` dispatch) or module-level callback set via `setLoginHandler()` (same pattern as `setRenderers` in router.js).

**Files:** `api.js`, `utils.js`, all page modules (event handlers only, not render functions)

---

### Phase D — Frontend: Split page modules by concern
**Risk: Medium. Structural change, but functionality identical.**

Right now each page file mixes: data logic, HTML generation, modal logic, event handlers, API calls. Split each into:

```
pages/
  employees/
    render.js       ← renderEmployees() HTML only
    handlers.js     ← event handlers (toggleEmpVisibility, saveEmployee, etc.)
    modals.js       ← openEmpModal, saveMonthSetup HTML + handlers
  clients/
    render.js
    handlers.js
    modals.js
  matrix/
    render.js
    handlers.js
  ...
```

`main.js` imports from all of them and registers on `window`. No change to how the browser sees it.

Benefit: employees.js goes from 799 lines to 3 files of ~200 lines each, each focused on one thing.

**Files:** All page modules restructured. `main.js` import paths updated.

---

### Phase E — Frontend: Extract reusable UI components (functions)
**Risk: Low if done carefully. No structural change.**

Create `src/client/components.js` with pure functions that return HTML strings for repeated UI patterns:

```js
export const badge = (text, color) => `<span class="chip" style="...">...</span>`
export const utilBar = (alloc, capacity) => `<div class="progress">...</div>`
export const kpiCard = (label, value, sub, color) => `<div class="card">...</div>`
export const actionBtn = (label, icon, onclick, variant) => `<button class="btn ...">`
```

Then replace inline repeated patterns in render functions. No behavior change, just extraction.

Benefit: changing a KPI card style means editing one function, not 6 places.

**Files:** New `client/components.js`, all page render functions updated to use it.

---

### Phase F — Backend: Schema migration system
**Risk: Low. Doesn't touch existing schema, only adds tooling.**

1. Add `scripts/migrate.js` — runs SQL files from `src/server/migrations/` in order, tracks applied migrations in a `_migrations` table.
2. Move current `schema.sql` content into `src/server/migrations/001_initial.sql`.
3. Future schema changes go in numbered files (e.g., `002_add_indexes.sql`).
4. `db.js` calls `runMigrations()` on startup instead of `exec(schema)`.

This is the minimum needed to safely evolve the schema (e.g., adding `updated_at` columns, renaming fields) without wiping data.

**Files:** `db.js`, new `scripts/migrate.js`, new `src/server/migrations/` directory

---

## Summary: Priority order

| Phase | What | Risk | Value |
|-------|------|------|-------|
| A | DB indexes + fix N+1 queries | None | High (immediate perf) |
| B | Input validation + error handling | Low | High (data integrity) |
| C | Frontend error handling | Low | High (UX + debuggability) |
| D | Split page modules | Medium | Medium (maintainability) |
| E | Extract UI component functions | Low | Medium (consistency) |
| F | Migration system | Low | High (future schema changes) |

**Don't do:** full frontend framework rewrite, ORM, PostgreSQL migration.

---

## What stays the same regardless

- Hebrew RTL UI — no change
- innerHTML rendering pattern — improved but not replaced in early phases
- All existing API endpoints, request/response shapes
- SQLite — stays as-is
- Fastify — stays as-is
- Deployment setup — untouched
