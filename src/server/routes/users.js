
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import db from '../db.js';
import { requireAdmin } from '../auth.js';
import { validate, InviteSchema, AcceptInviteSchema } from '../validate.js';

async function usersRoutes(fastify) {
  // GET /api/users — admin only
  fastify.get('/api/users', { preHandler: requireAdmin }, async () => {
    return db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at').all();
  });

  // POST /api/users/invite — admin only, create invite token
  fastify.post('/api/users/invite', { preHandler: requireAdmin }, async (req, reply) => {
    const { email, name, role } = validate(InviteSchema, req.body);

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return reply.code(409).send({ error: 'User already exists' });

    const token = nanoid(32);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO users (email, password_hash, name, role, invite_token, invite_expires_at)
                VALUES (?,?,?,?,?,?)`)
      .run(email.toLowerCase(), '', name, role, token, expires);

    return { token, expires };
  });

  // POST /api/users/accept-invite — public, sets password from invite token
  fastify.post('/api/users/accept-invite', async (req, reply) => {
    const { token, password } = validate(AcceptInviteSchema, req.body);

    const user = db.prepare('SELECT * FROM users WHERE invite_token = ?').get(token);
    if (!user) return reply.code(400).send({ error: 'Invalid or expired invite' });
    if (new Date(user.invite_expires_at) < new Date()) return reply.code(400).send({ error: 'Invite expired' });

    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash=?, invite_token=NULL, invite_expires_at=NULL WHERE id=?')
      .run(hash, user.id);

    req.session.userId = user.id;
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });
}

export default usersRoutes;
