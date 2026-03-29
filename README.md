# WorkHours

Workforce hours management system for allocating employee time across clients. Hebrew RTL interface.

## Stack

- **Frontend:** Vanilla JS + Vite (ES modules, no framework)
- **Backend:** Node.js + Fastify 5
- **Database:** SQLite (better-sqlite3)
- **Auth:** Session cookies (bcrypt + @fastify/session)

## Setup

```bash
npm install
cp .env.example .env   # fill in SESSION_SECRET
node scripts/seed-admin.js --email admin@example.com --password secret --name Admin
```

## Development

Run both in separate terminals:

```bash
npm run server   # API on :4000
npm run dev      # Vite dev server on :3000 (proxies /api → :4000)
```

Open http://localhost:3000 and log in with the admin credentials you seeded.

## Migrate existing data

If you have data in the old `index.html` (localStorage), export it from the browser console:

```js
copy(localStorage.getItem('wh-state-v3'))
```

Paste into `data-export.json`, then:

```bash
node scripts/migrate-localstorage.js data-export.json
```

## Production deploy

```bash
npm run build                          # builds frontend to dist/
node scripts/seed-admin.js ...         # first-time only
npm run server                         # serves dist/ + /api on PORT
```

With PM2:

```bash
pm2 start src/server/index.js --name kido-hours
```

Nginx reverse proxy to `PORT` (default 4000) with Let's Encrypt SSL.

Daily backup: `cp data.db /backups/data-$(date +%F).db`

## Invite users

```bash
# As admin, POST /api/users/invite with {"email":"...","name":"..."}
# User receives invite token, calls POST /api/users/accept-invite with token + password
```

Or add user management UI via the Settings page (admin only).
