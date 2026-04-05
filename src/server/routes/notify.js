import db from '../db.js';
import { requireAuth } from '../auth.js';

const SLACK_API = 'https://slack.com/api/chat.postMessage';

async function notifyRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  // POST /api/notify/slack/:empId
  fastify.post('/api/notify/slack/:empId', async (req, reply) => {
    const { empId } = req.params;
    const { message } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return reply.code(400).send({ error: 'message is required' });
    }

    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return reply.code(500).send({ error: 'SLACK_BOT_TOKEN not configured on server' });

    const emp = db.prepare('SELECT slack_webhook FROM employees WHERE id = ?').get(empId);
    if (!emp) return reply.code(404).send({ error: 'Employee not found' });
    if (!emp.slack_webhook) return reply.code(400).send({ error: 'No Slack User ID configured for this employee' });

    const r = await fetch(SLACK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: emp.slack_webhook, text: message }),
    });

    const data = await r.json();
    if (!data.ok) return reply.code(502).send({ error: `Slack error: ${data.error}` });

    return { ok: true };
  });
}

export default notifyRoutes;
