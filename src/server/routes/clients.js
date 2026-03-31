
import { nanoid } from 'nanoid';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { buildHoursMap, serializeClient } from '../utils.js';
import { validate, ClientCreateSchema, ClientUpdateSchema, HoursSchema } from '../validate.js';

async function clientsRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  // GET /api/clients — returns clients with their monthly hours
  fastify.get('/api/clients', async () => {
    const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
    const mhMap = buildHoursMap(db.prepare('SELECT * FROM client_monthly_hours').all(), 'client_id');
    const bhMap = buildHoursMap(db.prepare('SELECT * FROM client_billed_hours').all(), 'client_id');
    return clients.map(c => serializeClient(c, mhMap, bhMap));
  });

  // POST /api/clients
  fastify.post('/api/clients', async (req, reply) => {
    const body = validate(ClientCreateSchema, req.body);
    const id = body.id || 'c' + nanoid(10);
    db.prepare(`INSERT INTO clients (id, name, type, active, hours_bank, weekly_day)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, body.name, body.type, body.active ? 1 : 0,
           body.hoursBank ?? null,
           body.weeklyDay != null ? JSON.stringify(body.weeklyDay) : null);
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  });

  // PUT /api/clients/:id
  fastify.put('/api/clients/:id', async (req, reply) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Client not found' });
    const body = validate(ClientUpdateSchema, req.body);
    db.prepare(`UPDATE clients SET name=?, type=?, active=?, hours_bank=?, weekly_day=? WHERE id=?`)
      .run(body.name, body.type, body.active ? 1 : 0,
           body.hoursBank ?? null,
           body.weeklyDay != null ? JSON.stringify(body.weeklyDay) : null, id);
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
  fastify.put('/api/clients/:id/hours/:month', async (req) => {
    const { id, month } = req.params;
    const { hours } = validate(HoursSchema, req.body);
    db.prepare(`INSERT INTO client_monthly_hours (client_id, month_key, hours) VALUES (?,?,?)
                ON CONFLICT(client_id, month_key) DO UPDATE SET hours=excluded.hours`)
      .run(id, month, hours);
    return { ok: true };
  });

  // PUT /api/clients/:id/billed/:month
  fastify.put('/api/clients/:id/billed/:month', async (req) => {
    const { id, month } = req.params;
    const { hours } = validate(HoursSchema, req.body);
    db.prepare(`INSERT INTO client_billed_hours (client_id, month_key, hours) VALUES (?,?,?)
                ON CONFLICT(client_id, month_key) DO UPDATE SET hours=excluded.hours`)
      .run(id, month, hours);
    return { ok: true };
  });
}

export default clientsRoutes;
