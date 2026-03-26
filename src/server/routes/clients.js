
import { nanoid } from 'nanoid';
import db from '../db.js';
import { requireAuth } from '../auth.js';

async function clientsRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  // GET /api/clients — returns clients with their monthly hours
  fastify.get('/api/clients', async () => {
    const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
    const monthlyHours = db.prepare('SELECT * FROM client_monthly_hours').all();
    const billedHours = db.prepare('SELECT * FROM client_billed_hours').all();

    return clients.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      active: c.active === 1,
      hoursBank: c.hours_bank,
      weeklyDay: c.weekly_day ? JSON.parse(c.weekly_day) : null,
      monthlyHours: Object.fromEntries(
        monthlyHours.filter(r => r.client_id === c.id).map(r => [r.month_key, r.hours])
      ),
      billedHours: Object.fromEntries(
        billedHours.filter(r => r.client_id === c.id).map(r => [r.month_key, r.hours])
      ),
    }));
  });

  // POST /api/clients
  fastify.post('/api/clients', async (req, reply) => {
    const { name, type, active = true, hoursBank, weeklyDay } = req.body || {};
    if (!name || !type) return reply.code(400).send({ error: 'name and type required' });

    const id = 'c' + nanoid(10);
    db.prepare(`INSERT INTO clients (id, name, type, active, hours_bank, weekly_day)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, name, type, active ? 1 : 0, hoursBank ?? null, weeklyDay ? JSON.stringify(weeklyDay) : null);

    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  });

  // PUT /api/clients/:id
  fastify.put('/api/clients/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, type, active, hoursBank, weeklyDay } = req.body || {};
    const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Client not found' });

    db.prepare(`UPDATE clients SET name=?, type=?, active=?, hours_bank=?, weekly_day=? WHERE id=?`)
      .run(name, type, active ? 1 : 0, hoursBank ?? null, weeklyDay ? JSON.stringify(weeklyDay) : null, id);

    return { ok: true };
  });

  // DELETE /api/clients/:id
  fastify.delete('/api/clients/:id', async (req, reply) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Client not found' });
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    return { ok: true };
  });

  // PUT /api/clients/:id/hours/:month
  fastify.put('/api/clients/:id/hours/:month', async (req, reply) => {
    const { id, month } = req.params;
    const { hours } = req.body || {};
    if (hours == null) return reply.code(400).send({ error: 'hours required' });
    db.prepare(`INSERT INTO client_monthly_hours (client_id, month_key, hours) VALUES (?,?,?)
                ON CONFLICT(client_id, month_key) DO UPDATE SET hours=excluded.hours`)
      .run(id, month, hours);
    return { ok: true };
  });

  // PUT /api/clients/:id/billed/:month
  fastify.put('/api/clients/:id/billed/:month', async (req, reply) => {
    const { id, month } = req.params;
    const { hours } = req.body || {};
    if (hours == null) return reply.code(400).send({ error: 'hours required' });
    db.prepare(`INSERT INTO client_billed_hours (client_id, month_key, hours) VALUES (?,?,?)
                ON CONFLICT(client_id, month_key) DO UPDATE SET hours=excluded.hours`)
      .run(id, month, hours);
    return { ok: true };
  });
}

export default clientsRoutes;
