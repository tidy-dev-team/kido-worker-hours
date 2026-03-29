# WorkHours

Workforce hours management system for allocating employee time across clients. Hebrew RTL interface.

## Stack

- **Frontend:** Vanilla JS + Vite (ES modules, no framework)
- **Backend:** Node.js + Fastify 5
- **Database:** SQLite (better-sqlite3)
- **Auth:** Session cookies (bcrypt + @fastify/session)
- **CI/CD:** GitHub Actions → SSH deploy

## Quick Start

```bash
git clone https://github.com/tidy-dev-team/kido-worker-hours.git
cd kido-worker-hours
npm install
cp .env.example .env   # edit: set SESSION_SECRET (run `openssl rand -hex 32`)
node scripts/seed-admin.js --email you@example.com --password yourpass --name "Your Name"
```

Run in two terminals:
```bash
npm run server   # API on :4000
npm run dev      # Vite dev server on :3000 (proxies /api → :4000)
```

Open http://localhost:3000 and log in.

## Project Structure

```
src/
├── client/                    # Frontend (Vite SPA)
│   ├── index.html             # Shell: nav, #app, #modal-root
│   ├── main.js                # Entry: init, login, renderers
│   ├── style.css              # All styles (CSS custom properties)
│   ├── api.js                 # Fetch wrapper (/api/* calls)
│   ├── router.js              # SPA navigation, renderPage()
│   ├── state.js               # State cache + async loadState()
│   ├── utils.js               # Shared helpers
│   ├── working-days.js        # Hour calculations
│   ├── aggregations.js        # Allocation sums
│   ├── hebrew-calendar.js     # Hebrew holiday dates
│   ├── constants.js           # Month names, labels
│   └── pages/
│       ├── overview.js        # Dashboard + Chart.js charts
│       ├── clients.js         # Client CRUD
│       ├── employees.js       # Employee CRUD + month setup modal
│       ├── matrix.js          # Allocation matrix (table/cards)
│       ├── auto-distribute.js # Auto-assign hours to employees
│       ├── weekly-schedule.js # Weekly day-by-day schedule
│       └── settings.js        # Month management + Excel export
│
├── server/                    # Backend (Fastify + SQLite)
│   ├── index.js               # Server setup, session store, plugins
│   ├── db.js                  # SQLite init (WAL, foreign keys)
│   ├── schema.sql             # Table definitions
│   ├── auth.js                # Login/logout + requireAuth helper
│   └── routes/
│       ├── clients.js         # /api/clients
│       ├── employees.js       # /api/employees
│       ├── months.js          # /api/months
│       ├── vacations.js       # /api/vacations
│       ├── matrix.js          # /api/matrix
│       ├── weekly.js          # /api/weekly
│       └── users.js           # /api/users (invite flow)
│
scripts/
├── seed-admin.js              # Create admin user
└── migrate-localstorage.js    # Import from old localStorage app

.github/workflows/
└── deploy.yml                 # Auto-deploy on push to production/staging
```

## Environments

| | Production | Staging |
|---|---|---|
| **URL** | `hours.tidyframework.com` | `staging.hours.tidyframework.com` |
| **Branch** | `production` | `staging` |
| **Deploy** | PR + 1 approval → auto | PR (no approval) → auto |
| **PM2** | `kido-hours` (:4000) | `kido-staging` (:4001) |

## Git Workflow

```
feature-branch → PR to staging (merge freely) → PR to production (needs 1 approval)
```

1. Create a feature branch from `staging`
2. Push changes, open PR to `staging`
3. Merge — auto-deploys to staging, test at `staging.hours.tidyframework.com`
4. Open PR from `staging` → `production`
5. Get 1 developer approval, merge — auto-deploys to production

## API Endpoints

All routes require session auth except `/api/auth/login`.

```
POST   /api/auth/login              # { email, password } → user + session cookie
POST   /api/auth/logout
GET    /api/auth/me                 # current user or 401

GET    /api/clients                 # all clients with monthlyHours/billedHours
POST   /api/clients                 # { id?, name, type, ... }
PUT    /api/clients/:id
DELETE /api/clients/:id
PUT    /api/clients/:id/hours/:month    # { hours }
PUT    /api/clients/:id/billed/:month   # { hours }

GET    /api/employees
POST   /api/employees               # { id?, name, scope, ... }
PUT    /api/employees/:id
DELETE /api/employees/:id
PUT    /api/employees/:id/hours/:month  # { hours }

GET    /api/months
POST   /api/months                  # { monthKey, workDays, holidays }
PUT    /api/months/:month
DELETE /api/months/:month           # cascades: allocations, schedule, vacations

GET    /api/vacations/:month        # { empId: days }
PUT    /api/vacations/:month/:empId # { days }

GET    /api/matrix/:month           # { empId: { clientId: hours } }
PUT    /api/matrix/:month           # bulk replace
PATCH  /api/matrix/:month/:empId/:clientId  # { hours }

GET    /api/weekly/:month           # { empId: { day: [clientIds] } }
PUT    /api/weekly/:month           # bulk replace
PATCH  /api/weekly/:month/:empId/:day       # { clientIds }
DELETE /api/weekly/:month           # clear all

GET    /api/users                   # admin only
POST   /api/users/invite            # { email, name }
POST   /api/users/accept-invite     # { token, password }
```

## Migrate Data from Old App

If you have data in the old `index.html` (localStorage version):

1. Open the old file in browser
2. Press F12 → Console
3. Run: `copy(localStorage.getItem('wh-state-v3'))`
4. Paste into `data-export.json`
5. Run: `node scripts/migrate-localstorage.js data-export.json`

## Key Business Rules

- **Employee hours** = `workDays × 7 × (scope/100) - (vacationDays × 7)`, overridable per month
- **Allocations** are always multiples of 5 (largest-remainder algorithm)
- **Max 6 clients** per employee in the matrix
- **Auto-distribution** only assigns to employee's `preferredClients`
- **Client types**: `retainer` (monthly), `project` (hours bank), `internal` (overhead)
- **Project bank** = `hoursBank - sum(billedHours)` across months

## Manual Deploy (if CI/CD is down)

SSH into the droplet:
```bash
cd ~/kido-worker-hours          # or ~/kido-worker-hours-staging
git pull origin production      # or staging
npm ci
npm run build
pm2 restart kido-hours          # or kido-staging
```

## Backup

Daily cron at 3am: `cp data.db /backups/data-YYYY-MM-DD.db`

Manual: `cp ~/kido-worker-hours/data.db /backups/data-$(date +%F).db`
