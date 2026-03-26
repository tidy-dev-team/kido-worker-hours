# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WorkHours — a workforce hours management system for allocating employee time across clients. Hebrew RTL interface. Vanilla JS + Vite frontend, Fastify backend, SQLite database, session-based auth.

## Development Commands

```bash
# Frontend dev server (port 3000, proxies /api → :4000)
npm run dev

# Backend API server (port 4000)
npm run server

# Production build
npm run build

# Seed first admin user
node scripts/seed-admin.js --email admin@example.com --password secret --name Admin

# Migrate data from old localStorage export
node scripts/migrate-localstorage.js data-export.json
```

Run both `npm run dev` and `npm run server` simultaneously for local development.

## Architecture

**Frontend** (`src/client/`): Vanilla JS ES modules bundled by Vite. SPA with `navigate(page)` swapping `#app` content. Six pages: Overview, Clients, Employees, Matrix, Weekly Schedule, Settings.

**Backend** (`src/server/`): Fastify 5 with plugin architecture. SQLite via better-sqlite3 (synchronous). Session cookies via `@fastify/session` + bcrypt. Schema auto-applied on startup from `schema.sql`.

**State flow:**
1. `main.js` calls `loadState()` on init → fetches all data from API in parallel
2. Local `state` object acts as cache for snappy UI rendering
3. Every mutation calls a specific API endpoint directly (no batch save)
4. `saveState()` is a no-op kept for compatibility

**Key data structures (same shape client and server):**
- `state.matrix[monthKey][empId][clientId]` — hours allocation grid
- `state.weeklySchedule[monthKey][empId][day]` — array of clientIds per day
- `state.monthSetup[monthKey]` — work days, holidays per month
- `state.vacations[monthKey][empId]` — vacation days

## Critical Implementation Notes

**Auth hooks scope:** Route plugins must NOT be wrapped with `fastify-plugin` (`fp()`). Without `fp`, each plugin's `addHook('preHandler', requireAuth)` is scoped to that plugin only. With `fp`, hooks leak globally and break the public login endpoint.

**Employee `visible`/`hidden` duality:** Employees have both `visible` (server field) and `hidden` (client convenience field, `!visible`). `loadState()` maps `hidden: !e.visible`. Both must be updated in toggle operations.

**Client-generated IDs:** Client code generates IDs (`'c'+Date.now()`, `'e'+Date.now()`) and passes them to POST endpoints. Server uses client-provided ID if present, otherwise generates with nanoid.

**Allocations rounded to multiples of 5** using largest-remainder (`_split5` in `auto-distribute.js`).

**Max 6 clients per employee** in the allocation matrix.

**Auto-distribution** uses `preferredClients` array on each employee.

## Environment

Copy `.env.example` to `.env` and fill in:
- `SESSION_SECRET` — random string ≥32 chars
- `DB_PATH` — path to SQLite file (default: `./data.db`)
- `PORT` — server port (default: 4000)

## Language

UI text is Hebrew (RTL). Variable names and code are English. `FUNCTIONALITY.md` contains the full feature specification in Hebrew.
