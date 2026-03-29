
import db from '../db.js';
import { requireAuth } from '../auth.js';

async function matrixRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  // GET /api/matrix/:month — returns { empId: { clientId: hours, ... }, ... }
  fastify.get('/api/matrix/:month', async (req) => {
    const rows = db.prepare('SELECT employee_id, client_id, hours FROM allocations WHERE month_key = ?')
      .all(req.params.month);
    const result = {};
    for (const row of rows) {
      if (!result[row.employee_id]) result[row.employee_id] = {};
      result[row.employee_id][row.client_id] = row.hours;
    }
    return result;
  });

  // PUT /api/matrix/:month — bulk replace entire month matrix
  fastify.put('/api/matrix/:month', async (req, reply) => {
    const { month } = req.params;
    const matrix = req.body; // { empId: { clientId: hours } }
    if (!matrix || typeof matrix !== 'object') return reply.code(400).send({ error: 'matrix object required' });

    const insert = db.prepare(`INSERT INTO allocations (month_key, employee_id, client_id, hours) VALUES (?,?,?,?)
                               ON CONFLICT(month_key, employee_id, client_id) DO UPDATE SET hours=excluded.hours`);
    db.transaction(() => {
      db.prepare('DELETE FROM allocations WHERE month_key = ?').run(month);
      for (const [eid, clients] of Object.entries(matrix)) {
        for (const [cid, hours] of Object.entries(clients)) {
          if (parseFloat(hours) > 0) insert.run(month, eid, cid, hours);
        }
      }
    })();
    return { ok: true };
  });

  // PATCH /api/matrix/:month/:empId/:clientId — update single cell
  fastify.patch('/api/matrix/:month/:empId/:clientId', async (req, reply) => {
    const { month, empId, clientId } = req.params;
    const { hours } = req.body || {};
    if (hours == null) return reply.code(400).send({ error: 'hours required' });

    if (parseFloat(hours) <= 0) {
      db.prepare('DELETE FROM allocations WHERE month_key=? AND employee_id=? AND client_id=?')
        .run(month, empId, clientId);
    } else {
      db.prepare(`INSERT INTO allocations (month_key, employee_id, client_id, hours) VALUES (?,?,?,?)
                  ON CONFLICT(month_key, employee_id, client_id) DO UPDATE SET hours=excluded.hours`)
        .run(month, empId, clientId, hours);
    }
    return { ok: true };
  });
}

export default matrixRoutes;
