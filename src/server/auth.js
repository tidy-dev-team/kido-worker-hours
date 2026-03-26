import bcrypt from 'bcrypt';

import db from './db.js';

async function authPlugin(fastify) {
  // POST /api/auth/login
  fastify.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body || {};
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' });

    req.session.userId = user.id;
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });

  // POST /api/auth/logout
  fastify.post('/api/auth/logout', async (req, reply) => {
    req.session.destroy();
    return { ok: true };
  });

  // GET /api/auth/me
  fastify.get('/api/auth/me', async (req, reply) => {
    const user = getSessionUser(req);
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });
}

export default authPlugin;

// Reusable preHandler — attach to any route that requires auth
export function requireAuth(req, reply, done) {
  const user = getSessionUser(req);
  if (!user) return reply.code(401).send({ error: 'Not authenticated' });
  req.user = user;
  done();
}

// Reusable preHandler — admin only
export function requireAdmin(req, reply, done) {
  const user = getSessionUser(req);
  if (!user) return reply.code(401).send({ error: 'Not authenticated' });
  if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin only' });
  req.user = user;
  done();
}

function getSessionUser(req) {
  const userId = req.session?.userId;
  if (!userId) return null;
  return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(userId) || null;
}
