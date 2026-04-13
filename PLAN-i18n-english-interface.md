# Plan: Add English interface with HE/EN switch

## Context
The app currently has a Hebrew-only RTL interface (~354 hardcoded Hebrew strings across 13 files). We need to add a full English interface and a language toggle, handling both text translation and RTL↔LTR layout changes.

---

## Architecture: Simple dictionary-based i18n

No external i18n library. A single new module `src/client/i18n.js` exports:
- `t(key)` — returns the translated string for the current language
- `setLang(lang)` — switches language, updates `<html dir>` and `lang`, persists to server
- `getLang()` — returns current language (`'he'` | `'en'`)

Two dictionaries: `he` and `en`, keyed by dot-notation strings (e.g. `t('nav.overview')`, `t('kpi.clientHours')`).

---

## Files to create

### 1. `src/client/i18n.js` — Translation module (~350 keys)

```js
const he = {
  'nav.overview': 'מבט על',
  'nav.clients': 'לקוחות',
  'nav.employees': 'עובדים',
  'nav.matrix': 'מטריצת הקצאות',
  'nav.weekly': 'סידור שבועי',
  'nav.settings': 'הגדרות',
  // ... all ~350 keys
};
const en = {
  'nav.overview': 'Overview',
  'nav.clients': 'Clients',
  // ...
};

let _lang = 'he';
export function t(key) { return (_lang === 'he' ? he : en)[key] || key; }
export function getLang() { return _lang; }
export function setLang(lang) { _lang = lang; applyDir(); }
function applyDir() {
  document.documentElement.lang = _lang;
  document.documentElement.dir = _lang === 'he' ? 'rtl' : 'ltr';
}
```

Key categories to translate (~350 entries):
| Category | Count | Examples |
|----------|-------|---------|
| Navigation & page titles | 8 | Overview, Clients, Employees... |
| KPI labels & subs | 12 | Client Hours, Capacity Gap... |
| Table headers | 40+ | Name, Role, Hours, Status... |
| Button labels | 30+ | Save, Cancel, Delete, Export... |
| Form labels & placeholders | 15+ | Employee Name, Email, Role... |
| Modal titles | 10+ | Edit Employee, Add Client... |
| Alert/confirm messages | 20+ | Delete this client?... |
| Status badges | 10+ | Active, Inactive, Covered... |
| Insight/trend text | 25+ | Rising utilization, Burnout risk... |
| Month names | 12 | January–December |
| Day names | 5 | Sun–Thu (א׳–ה׳) |
| Holiday names | 19 | Passover, Yom Kippur... |
| Client types | 3 | Retainer, Project, Internal |
| Excel sheet names & headers | 20+ | Monthly Summary, Employee Details... |
| Misc hints, tooltips | 15+ | Click to edit, Up to 6 clients... |

---

## Files to modify

### 2. DB + Server: Store language preference per user

**`src/server/schema.sql`** — Add column:
```sql
-- In CREATE TABLE users: add preferred_language TEXT DEFAULT 'he'
```

**`src/server/db.js`** — Add migration to add column to existing DBs (ALTER TABLE IF NOT EXISTS pattern).

**`src/server/auth.js`** — `/api/auth/me` endpoint: include `preferredLanguage` in response.

**`src/server/routes/users.js`** — New endpoint `PUT /api/users/me/language` to persist preference.

**`src/server/validate.js`** — Add `LanguageSchema`.

### 3. Client init flow

**`src/client/main.js`**:
- Import `{ setLang }` from `i18n.js`
- In `init()`: after auth, before `loadState()`, call `/api/auth/me` to get user's `preferredLanguage`, then `setLang(lang)` to set direction before first render
- Import and register `changeLang` on `window`

**`src/client/state.js`**:
- No changes needed — language is not part of app state, it's in the i18n module

### 4. HTML template

**`src/client/index.html`**:
- Keep `dir="rtl" lang="he"` as default (overridden by JS on init)
- Sidebar nav text is static HTML — add `data-i18n` attributes to nav text spans and a `translateStatic()` function that updates them after language loads
- Nav items already have IDs (`nav-overview`, etc.)

### 5. All page renderers — replace Hebrew strings with `t()` calls

Each file imports `{ t }` from `'../i18n.js'` and replaces hardcoded Hebrew:

| File | Approx changes | Notes |
|------|---------------|-------|
| `index.html` | 10 | Static nav — handled by translateStatic() |
| `main.js` | 5 | Login page strings |
| `constants.js` | 12 | Month names — make `MONTH_NAMES` a function using `t()` |
| `utils.js` | 6 | `clientTypeBadge()`, `clientTypeLabel()` |
| `hebrew-calendar.js` | 19 | Holiday names |
| `pages/overview.js` | 75 | KPIs, alerts, insights, charts |
| `pages/clients.js` | 34 | Table, modal, confirms |
| `pages/employees.js` | 105 | Tables, modals, month setup, send allocation |
| `pages/matrix.js` | 35 | KPIs, legend, actions, confirms |
| `pages/weekly-schedule.js` | 12 | Day names, headers, buttons, popover |
| `pages/auto-distribute.js` | 9 | Alerts and confirm dialogs |
| `pages/settings.js` | 36 | Month management, export, account + new language toggle |

### 6. CSS — Convert RTL-specific to bidirectional

**`src/client/style.css`** — Critical changes:

| Current | Change to |
|---------|-----------|
| `body { direction:rtl }` | Remove (use `<html dir>` instead) |
| `.fi,.fs { direction:rtl }` | Remove or use `direction: inherit` |
| `thead th { text-align:right }` | `text-align: start` (logical) |
| `.s-logo { border-left; margin-left; padding-right }` | `border-inline-end`, `margin-inline-end`, `padding-inline-start` |
| `.s-month { border-right; margin-right; padding-left }` | `border-inline-start`, `margin-inline-start`, `padding-inline-end` |
| `.kpi-accent { right:0 }` | `inset-inline-start: 0` |
| `.kpi-ico { left:14px }` | `inset-inline-end: 14px` |
| `.mx-th-emp { right:0; border-left:2px }` | `inset-inline-start:0; border-inline-end:2px` |
| `.mx-td-emp { right:0; border-left:2px }` | `inset-inline-start:0; border-inline-end:2px` |
| `#toast-container { left:24px }` | `inset-inline-end: 24px` |

**Inline styles in JS files** — Directional fixes:

| File | Pattern | Fix |
|------|---------|-----|
| `weekly-schedule.js` | `position:sticky;right:0;border-right:2px` | `inset-inline-start:0;border-inline-start:2px` |
| `weekly-schedule.js` | `text-align:right` | `text-align:start` |
| `weekly-schedule.js` | `margin-left:4px` | `margin-inline-end:4px` |
| `overview.js` | `border-right:3px solid ${color}` (severity) | `border-inline-start:3px` |
| `overview.js` | `margin-right:4px` | `margin-inline-end:4px` |
| `matrix.js` | `margin-left:3px`, `margin-right:3px` | `margin-inline-end`, `margin-inline-start` |
| `settings.js` | `margin-right:7px`, `text-align:right` | `margin-inline-start`, `text-align:start` |

### 7. Settings page — Language toggle

Add a language card in `renderSettings()` with a simple select/toggle:
```
Language / שפה: [עברית ▾] / [English ▾]
```
On change: call `changeLang(value)` → updates i18n, persists to server via `PUT /api/users/me/language`, calls `renderPage()` to re-render with new language.

### 8. Export — Bilingual Excel headers

`settings.js` export functions: Excel sheet names and column headers should use `t()` so exports match the current language.

### 9. Migration script + JSON export

**`scripts/migrate-localstorage.js`** — No changes needed (data format unchanged).

**`src/server/routes/export.js`** — No changes needed (exports data, not UI strings).

**`deploy.sh`** — The ALTER TABLE migration handles existing DBs.

---

## Implementation order

1. **Create `i18n.js`** with all ~350 translation keys (he + en dictionaries, `t()`, `setLang()`)
2. **DB + server changes** — schema column, auth/me response, PUT language endpoint
3. **CSS logical properties** — convert `style.css` directional properties
4. **`index.html` + `main.js`** — dynamic nav text, login page, init flow with language load
5. **Page by page** — replace Hebrew strings with `t()` calls (one file at a time, largest first):
   - `employees.js` (105 strings)
   - `overview.js` (75 strings)
   - `settings.js` (36 strings + language toggle)
   - `matrix.js` (35 strings)
   - `clients.js` (34 strings)
   - `hebrew-calendar.js` (19 strings)
   - `weekly-schedule.js` (12 strings)
   - `auto-distribute.js` (9 strings)
   - `constants.js` (12 strings)
   - `utils.js` (6 strings)
6. **Inline style RTL fixes** in JS files
7. **Export bilingual headers** in settings.js

---

## Verification

1. Start app (`npm run server & npm run dev`)
2. Login → verify default Hebrew UI + RTL layout
3. Go to Settings → switch to English
4. Verify: all pages render in English with LTR layout
5. Verify: sticky columns in matrix and weekly schedule work in LTR
6. Verify: modals, popovers, toasts position correctly in LTR
7. Verify: Excel export uses English headers when language is English
8. Verify: refresh page → language preference persists
9. Switch back to Hebrew → verify RTL restores correctly
