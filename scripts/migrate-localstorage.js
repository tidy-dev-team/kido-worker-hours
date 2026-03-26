#!/usr/bin/env node
/**
 * Migrate data from a localStorage JSON export into SQLite.
 *
 * How to export from the browser:
 *   1. Open the old index.html in a browser
 *   2. Open DevTools → Console
 *   3. Run: copy(localStorage.getItem('wh-state-v3'))
 *   4. Paste into a file, e.g.: data-export.json
 *
 * Then run:
 *   node scripts/migrate-localstorage.js data-export.json
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import db from '../src/server/db.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/migrate-localstorage.js <path-to-json>');
  process.exit(1);
}

let state;
try {
  state = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error('Failed to parse JSON:', e.message);
  process.exit(1);
}

const migrate = db.transaction(() => {
  let counts = { clients: 0, employees: 0, months: 0, allocations: 0, weekly: 0, vacations: 0 };

  // ── Clients ──
  for (const c of (state.clients || [])) {
    db.prepare(`INSERT OR IGNORE INTO clients (id, name, type, active, hours_bank, weekly_day)
                VALUES (?,?,?,?,?,?)`)
      .run(c.id, c.name, c.type || 'retainer', c.active === false ? 0 : 1,
          c.hoursBank ?? null, c.weeklyDay != null ? JSON.stringify(c.weeklyDay) : null);
    counts.clients++;

    for (const [mk, hours] of Object.entries(c.monthlyHours || {})) {
      if (hours > 0)
        db.prepare(`INSERT OR REPLACE INTO client_monthly_hours (client_id, month_key, hours) VALUES (?,?,?)`)
          .run(c.id, mk, hours);
    }
    for (const [mk, hours] of Object.entries(c.billedHours || {})) {
      if (hours > 0)
        db.prepare(`INSERT OR REPLACE INTO client_billed_hours (client_id, month_key, hours) VALUES (?,?,?)`)
          .run(c.id, mk, hours);
    }
  }

  // ── Employees ──
  for (const e of (state.employees || [])) {
    db.prepare(`INSERT OR IGNORE INTO employees (id, name, role, email, slack_webhook, scope, visible, preferred_clients)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(e.id, e.name, e.role || '', e.email || '', e.slackWebhook || '',
          e.scope ?? 100, e.hidden ? 0 : 1, JSON.stringify(e.preferredClients || []));
    counts.employees++;

    for (const [mk, hours] of Object.entries(e.monthlyHours || {})) {
      if (hours > 0)
        db.prepare(`INSERT OR REPLACE INTO employee_monthly_hours (employee_id, month_key, hours) VALUES (?,?,?)`)
          .run(e.id, mk, hours);
    }
  }

  // ── Months / monthSetup ──
  for (const mk of (state.activeMonths || [])) {
    const setup = state.monthSetup?.[mk];
    db.prepare(`INSERT OR IGNORE INTO months (month_key, work_days, holidays) VALUES (?,?,?)`)
      .run(mk, setup?.workDays ?? null, JSON.stringify([]));
    counts.months++;
  }

  // ── Vacations ──
  for (const [mk, empMap] of Object.entries(state.vacations || {})) {
    for (const [eid, days] of Object.entries(empMap || {})) {
      if (days > 0)
        db.prepare(`INSERT OR REPLACE INTO vacations (employee_id, month_key, days) VALUES (?,?,?)`)
          .run(eid, mk, days);
      counts.vacations++;
    }
  }

  // ── Allocation matrix ──
  for (const [mk, empMap] of Object.entries(state.matrix || {})) {
    for (const [eid, clientMap] of Object.entries(empMap || {})) {
      for (const [cid, hours] of Object.entries(clientMap || {})) {
        const h = parseFloat(hours) || 0;
        if (h > 0) {
          db.prepare(`INSERT OR REPLACE INTO allocations (month_key, employee_id, client_id, hours) VALUES (?,?,?,?)`)
            .run(mk, eid, cid, h);
          counts.allocations++;
        }
      }
    }
  }

  // ── Weekly schedule ──
  for (const [mk, empMap] of Object.entries(state.weeklySchedule || {})) {
    for (const [eid, dayMap] of Object.entries(empMap || {})) {
      for (const [day, cids] of Object.entries(dayMap || {})) {
        const arr = Array.isArray(cids) ? cids : Object.values(cids || {});
        if (arr.length > 0) {
          db.prepare(`INSERT OR REPLACE INTO weekly_schedule (month_key, employee_id, day, client_ids) VALUES (?,?,?,?)`)
            .run(mk, eid, day, JSON.stringify(arr));
          counts.weekly++;
        }
      }
    }
  }

  return counts;
});

const counts = migrate();
console.log('✓ Migration complete:');
console.log(`  Clients:     ${counts.clients}`);
console.log(`  Employees:   ${counts.employees}`);
console.log(`  Months:      ${counts.months}`);
console.log(`  Vacations:   ${counts.vacations}`);
console.log(`  Allocations: ${counts.allocations}`);
console.log(`  Weekly rows: ${counts.weekly}`);
