
import { nanoid } from 'nanoid';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { buildHoursMap, serializeEmployee } from '../utils.js';
import { validate, EmployeeCreateSchema, EmployeeUpdateSchema, HoursSchema } from '../validate.js';

async function employeesRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  // GET /api/employees
  fastify.get('/api/employees', async () => {
    const employees = db.prepare('SELECT * FROM employees ORDER BY name').all();
    const mhMap = buildHoursMap(db.prepare('SELECT * FROM employee_monthly_hours').all(), 'employee_id');
    return employees.map(e => serializeEmployee(e, mhMap));
  });

  // POST /api/employees
  fastify.post('/api/employees', async (req) => {
    const body = validate(EmployeeCreateSchema, req.body);
    const id = body.id || 'e' + nanoid(10);
    db.prepare(`INSERT INTO employees (id, name, role, email, slack_webhook, scope, visible, preferred_clients)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, body.name, body.role, body.email, body.slackWebhook, body.scope,
           body.visible ? 1 : 0, JSON.stringify(body.preferredClients));
    return { id, name: body.name, role: body.role, email: body.email,
             slackWebhook: body.slackWebhook, scope: body.scope,
             visible: body.visible, hidden: !body.visible,
             preferredClients: body.preferredClients, monthlyHours: {} };
  });

  // PUT /api/employees/:id
  fastify.put('/api/employees/:id', async (req, reply) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Employee not found' });
    const body = validate(EmployeeUpdateSchema, req.body);
    db.prepare(`UPDATE employees SET name=?, role=?, email=?, slack_webhook=?, scope=?, visible=?, preferred_clients=? WHERE id=?`)
      .run(body.name, body.role, body.email, body.slackWebhook, body.scope,
           body.visible ? 1 : 0, JSON.stringify(body.preferredClients), id);
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
  fastify.put('/api/employees/:id/hours/:month', async (req) => {
    const { id, month } = req.params;
    const { hours } = validate(HoursSchema, req.body);
    db.prepare(`INSERT INTO employee_monthly_hours (employee_id, month_key, hours) VALUES (?,?,?)
                ON CONFLICT(employee_id, month_key) DO UPDATE SET hours=excluded.hours`)
      .run(id, month, hours);
    return { ok: true };
  });
}

export default employeesRoutes;
