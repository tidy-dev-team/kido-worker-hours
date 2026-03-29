
import db from '../db.js';
import { requireAuth } from '../auth.js';

async function vacationsRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  // GET /api/vacations/:month — returns { empId: days, ... }
  fastify.get('/api/vacations/:month', async (req) => {
    const rows = db.prepare('SELECT employee_id, days FROM vacations WHERE month_key = ?').all(req.params.month);
    return Object.fromEntries(rows.map(r => [r.employee_id, r.days]));
  });

  // PUT /api/vacations/:month/:empId
  fastify.put('/api/vacations/:month/:empId', async (req, reply) => {
    const { month, empId } = req.params;
    const { days } = req.body || {};
    if (days == null) return reply.code(400).send({ error: 'days required' });

    if (days <= 0) {
      db.prepare('DELETE FROM vacations WHERE month_key = ? AND employee_id = ?').run(month, empId);
    } else {
      db.prepare(`INSERT INTO vacations (employee_id, month_key, days) VALUES (?,?,?)
                  ON CONFLICT(employee_id, month_key) DO UPDATE SET days=excluded.days`)
        .run(empId, month, days);
    }
    return { ok: true };
  });
}

export default vacationsRoutes;
