
import db from '../db.js';
import { requireAuth } from '../auth.js';

async function weeklyRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  // GET /api/weekly/:month — returns { empId: { day: [clientId,...], ... }, ... }
  fastify.get('/api/weekly/:month', async (req) => {
    const rows = db.prepare('SELECT employee_id, day, client_ids FROM weekly_schedule WHERE month_key = ?')
      .all(req.params.month);
    const result = {};
    for (const row of rows) {
      if (!result[row.employee_id]) result[row.employee_id] = {};
      result[row.employee_id][row.day] = JSON.parse(row.client_ids);
    }
    return result;
  });

  // PUT /api/weekly/:month — bulk replace entire month schedule
  fastify.put('/api/weekly/:month', async (req, reply) => {
    const { month } = req.params;
    const schedule = req.body; // { empId: { day: [cids] } }
    if (!schedule || typeof schedule !== 'object') return reply.code(400).send({ error: 'schedule object required' });

    const insert = db.prepare(`INSERT INTO weekly_schedule (month_key, employee_id, day, client_ids) VALUES (?,?,?,?)
                               ON CONFLICT(month_key, employee_id, day) DO UPDATE SET client_ids=excluded.client_ids`);
    db.transaction(() => {
      db.prepare('DELETE FROM weekly_schedule WHERE month_key = ?').run(month);
      for (const [eid, days] of Object.entries(schedule)) {
        for (const [day, cids] of Object.entries(days)) {
          if (Array.isArray(cids) && cids.length > 0) insert.run(month, eid, day, JSON.stringify(cids));
        }
      }
    })();
    return { ok: true };
  });

  // PATCH /api/weekly/:month/:empId/:day — update single cell
  fastify.patch('/api/weekly/:month/:empId/:day', async (req, reply) => {
    const { month, empId, day } = req.params;
    const { clientIds } = req.body || {};
    if (!Array.isArray(clientIds)) return reply.code(400).send({ error: 'clientIds array required' });

    if (clientIds.length === 0) {
      db.prepare('DELETE FROM weekly_schedule WHERE month_key=? AND employee_id=? AND day=?').run(month, empId, day);
    } else {
      db.prepare(`INSERT INTO weekly_schedule (month_key, employee_id, day, client_ids) VALUES (?,?,?,?)
                  ON CONFLICT(month_key, employee_id, day) DO UPDATE SET client_ids=excluded.client_ids`)
        .run(month, empId, day, JSON.stringify(clientIds));
    }
    return { ok: true };
  });

  // DELETE /api/weekly/:month — clear entire month
  fastify.delete('/api/weekly/:month', async (req) => {
    db.prepare('DELETE FROM weekly_schedule WHERE month_key = ?').run(req.params.month);
    return { ok: true };
  });
}

export default weeklyRoutes;
