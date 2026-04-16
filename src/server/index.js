import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import db from './db.js';

// Route plugins
import authPlugin from './auth.js';
import clientsRoutes from './routes/clients.js';
import employeesRoutes from './routes/employees.js';
import monthsRoutes from './routes/months.js';
import vacationsRoutes from './routes/vacations.js';
import matrixRoutes from './routes/matrix.js';
import weeklyRoutes from './routes/weekly.js';
import usersRoutes from './routes/users.js';
import exportRoutes from './routes/export.js';
import notifyRoutes from './routes/notify.js';
import wrikeRoutes from './routes/wrike.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '4000');
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production-min-32-chars!!';

// SQLite-backed session store (callback-based for @fastify/session)
class SQLiteStore {
  get(sid, cb) {
    const row = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?').get(sid);
    if (!row) return cb(null, null);
    if (new Date(row.expires_at) < new Date()) {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      return cb(null, null);
    }
    try { cb(null, JSON.parse(row.data)); } catch { cb(null, null); }
  }
  set(sid, session, cb) {
    const expires = session.cookie?.expires
      ? new Date(session.cookie.expires).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO sessions (sid, data, expires_at) VALUES (?,?,?)
                ON CONFLICT(sid) DO UPDATE SET data=excluded.data, expires_at=excluded.expires_at`)
      .run(sid, JSON.stringify(session), expires);
    cb(null);
  }
  destroy(sid, cb) {
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    cb(null);
  }
}

const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true,
});

await fastify.register(fastifyCookie);
await fastify.register(fastifySession, {
  secret: SESSION_SECRET,
  store: new SQLiteStore(),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
  saveUninitialized: false,
});

// Serve built frontend in production
const distDir = join(__dirname, '..', '..', 'dist');
if (existsSync(distDir)) {
  await fastify.register(fastifyStatic, { root: distDir });
}

// Global error handler — catches validation errors (400) and unexpected crashes (500)
fastify.setErrorHandler((error, req, reply) => {
  const code = error.statusCode || error.status || 500;
  if (code >= 500) fastify.log.error(error);
  reply.code(code).send({ error: error.message || 'Internal server error' });
});

// Expired session cleanup — runs on startup and every 24h
function cleanupSessions() {
  try {
    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  } catch (e) {
    fastify.log.warn('Session cleanup failed: ' + e.message);
  }
}
cleanupSessions();
setInterval(cleanupSessions, 24 * 60 * 60 * 1000);

// API plugins
await fastify.register(authPlugin);
await fastify.register(clientsRoutes);
await fastify.register(employeesRoutes);
await fastify.register(monthsRoutes);
await fastify.register(vacationsRoutes);
await fastify.register(matrixRoutes);
await fastify.register(weeklyRoutes);
await fastify.register(usersRoutes);
await fastify.register(exportRoutes);
await fastify.register(notifyRoutes);
await fastify.register(wrikeRoutes);

// SPA fallback — serve index.html for non-API routes (production only)
if (existsSync(distDir)) {
  fastify.setNotFoundHandler((req, reply) => {
    if (!req.url.startsWith('/api/')) {
      reply.sendFile('index.html');
    } else {
      reply.code(404).send({ error: 'Not found' });
    }
  });
}

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
