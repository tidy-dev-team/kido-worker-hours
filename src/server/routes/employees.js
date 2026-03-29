
import { nanoid } from 'nanoid';
import db from '../db.js';
import { requireAuth } from '../auth.js';

async function employeesRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  // GET /api/employees
  fastify.get('/api/employees', async () => {
    const employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
    const monthlyHours = db.prepare('SELECT * FROM employee_monthly_hours').all();

    return employees.map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      email: e.email,
      slackWebhook: e.slack_webhook,
      scope: e.scope,
      visible: e.visible === 1,
      hidden: e.visible === 0,
      preferredClients: e.preferred_clients ? JSON.parse(e.preferred_clients) : [],
      monthlyHours: Object.fromEntries(
        monthlyHours.filter(r => r.employee_id === e.id).map(r => [r.month_key, r.hours])
      ),
    }));
  });

  // POST /api/employees
  fastify.post('/api/employees', async (req, reply) => {
    const { id: empId, name, role = '', email = '', slackWebhook = '', scope = 100, visible = true, preferredClients = [] } = req.body || {};
    if (!name) return reply.code(400).send({ error: 'name required' });

    const id = empId || 'e' + nanoid(10);
    db.prepare(`INSERT INTO employees (id, name, role, email, slack_webhook, scope, visible, preferred_clients)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, name, role, email, slackWebhook, scope, visible ? 1 : 0, JSON.stringify(preferredClients));

    return { id, name, role, email, slackWebhook, scope, visible, preferredClients, monthlyHours: {} };
  });

  // PUT /api/employees/:id
  fastify.put('/api/employees/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, role, email, slackWebhook, scope, visible, preferredClients } = req.body || {};
    const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Employee not found' });

    db.prepare(`UPDATE employees SET name=?, role=?, email=?, slack_webhook=?, scope=?, visible=?, preferred_clients=? WHERE id=?`)
      .run(name, role ?? '', email ?? '', slackWebhook ?? '', scope ?? 100, visible ? 1 : 0,
          JSON.stringify(preferredClients ?? []), id);

    return { ok: true };
  });

  // DELETE /api/employees/:id
  fastify.delete('/api/employees/:id', async (req, reply) => {
    const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Employee not found' });
    db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  // PUT /api/employees/:id/hours/:month
  fastify.put('/api/employees/:id/hours/:month', async (req, reply) => {
    const { id, month } = req.params;
    const { hours } = req.body || {};
    if (hours == null) return reply.code(400).send({ error: 'hours required' });
    db.prepare(`INSERT INTO employee_monthly_hours (employee_id, month_key, hours) VALUES (?,?,?)
                ON CONFLICT(employee_id, month_key) DO UPDATE SET hours=excluded.hours`)
      .run(id, month, hours);
    return { ok: true };
  });
}

export default employeesRoutes;
