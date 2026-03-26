
import db from '../db.js';
import { requireAuth } from '../auth.js';

async function monthsRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  // GET /api/months — returns list of active months with their config
  fastify.get('/api/months', async () => {
    return db.prepare('SELECT * FROM months ORDER BY month_key').all().map(m => ({
      monthKey: m.month_key,
      workDays: m.work_days,
      holidays: m.holidays ? JSON.parse(m.holidays) : [],
    }));
  });

  // POST /api/months
  fastify.post('/api/months', async (req, reply) => {
    const { monthKey, workDays, holidays = [] } = req.body || {};
    if (!monthKey) return reply.code(400).send({ error: 'monthKey required' });

    db.prepare(`INSERT INTO months (month_key, work_days, holidays) VALUES (?,?,?)
                ON CONFLICT(month_key) DO UPDATE SET work_days=excluded.work_days, holidays=excluded.holidays`)
      .run(monthKey, workDays ?? null, JSON.stringify(holidays));

    return { ok: true };
  });

  // PUT /api/months/:month
  fastify.put('/api/months/:month', async (req, reply) => {
    const { month } = req.params;
    const { workDays, holidays } = req.body || {};

    db.prepare(`INSERT INTO months (month_key, work_days, holidays) VALUES (?,?,?)
                ON CONFLICT(month_key) DO UPDATE SET work_days=excluded.work_days, holidays=excluded.holidays`)
      .run(month, workDays ?? null, JSON.stringify(holidays ?? []));

    return { ok: true };
  });

  // DELETE /api/months/:month — cascades via app logic (not FK, since allocations reference month_key as plain text)
  fastify.delete('/api/months/:month', async (req, reply) => {
    const { month } = req.params;
    const existing = db.prepare('SELECT month_key FROM months WHERE month_key = ?').get(month);
    if (!existing) return reply.code(404).send({ error: 'Month not found' });

    db.transaction(() => {
      db.prepare('DELETE FROM allocations WHERE month_key = ?').run(month);
      db.prepare('DELETE FROM weekly_schedule WHERE month_key = ?').run(month);
      db.prepare('DELETE FROM vacations WHERE month_key = ?').run(month);
      db.prepare('DELETE FROM client_monthly_hours WHERE month_key = ?').run(month);
      db.prepare('DELETE FROM client_billed_hours WHERE month_key = ?').run(month);
      db.prepare('DELETE FROM employee_monthly_hours WHERE month_key = ?').run(month);
      db.prepare('DELETE FROM months WHERE month_key = ?').run(month);
    })();

    return { ok: true };
  });
}

export default monthsRoutes;
