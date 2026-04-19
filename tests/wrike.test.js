import { describe, it, expect, afterAll } from 'vitest';
import Fastify from 'fastify';
import bcrypt from 'bcrypt';
import db from '../src/server/db.js';
import authPlugin from '../src/server/auth.js';
import wrikeRoutes from '../src/server/routes/wrike.js';

const mockContacts = [
  { id: 'WU1', firstName: 'דימה', lastName: 'דמיטרייב', profiles: [{ email: 'dima@example.com' }] },
  { id: 'WU2', firstName: 'עמית', lastName: 'ישראלי', profiles: [{ email: 'amit@example.com' }] },
  { id: 'WU3', firstName: 'Unmatched', lastName: 'User', profiles: [{ email: 'unmatched@example.com' }] },
];

const mockTimelogs = [
  { id: 'TL1', taskId: 'WT1', userId: 'WU1', hours: 5, trackedDate: '2026-04-01' },
  { id: 'TL2', taskId: 'WT1', userId: 'WU1', hours: 3, trackedDate: '2026-04-02' },
  { id: 'TL3', taskId: 'WT2', userId: 'WU2', hours: 7, trackedDate: '2026-04-03' },
  { id: 'TL4', taskId: 'WT1', userId: 'WU2', hours: 2, trackedDate: '2026-04-04' },
  { id: 'TL5', taskId: 'WT3', userId: 'WU3', hours: 4, trackedDate: '2026-04-05' },
];

const mockTasks = [
  { id: 'WT1', title: 'Task in Honeydew project', folderIds: ['WF1'] },
  { id: 'WT2', title: 'Task in Maccabi project', folderIds: ['WF2'] },
  { id: 'WT3', title: 'Task in Internal', folderIds: ['WF3'] },
];

const mockFolders = [
  { id: 'WF1', title: 'Honeydew', project: { status: 'Active' } },
  { id: 'WF2', title: 'Maccabi', project: { status: 'Active' } },
  { id: 'WF3', title: 'Internal Meetings' },
];

const TEST_EMAIL = 'test-wrike@wriketest.com';
const TEST_PASS = 'testpass123';

async function buildApp(mockFetch) {
  const originalFetch = global.fetch;
  if (mockFetch) global.fetch = mockFetch;

  const app = Fastify();
  await app.register(require('@fastify/cookie'));
  await app.register(require('@fastify/session'), {
    secret: 'test-session-secret-min-32-chars!!',
    cookie: { secure: false, httpOnly: true, maxAge: 86400000 },
    saveUninitialized: true,
  });
  await app.register(authPlugin);
  await app.register(wrikeRoutes);
  await app.ready();

  app._restoreFetch = () => { global.fetch = originalFetch; };
  return app;
}

async function login(app) {
  const hash = await bcrypt.hash(TEST_PASS, 1);
  db.prepare('INSERT OR IGNORE INTO users (email, name, password_hash, role) VALUES (?,?,?,?)')
    .run(TEST_EMAIL, 'Test Admin', hash, 'admin');

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: TEST_EMAIL, password: TEST_PASS },
  });
  return res.headers['set-cookie'];
}

afterAll(() => {
  db.prepare('DELETE FROM users WHERE email = ?').run(TEST_EMAIL);
  db.prepare("DELETE FROM clients WHERE id LIKE 'c_wt_%'").run();
  db.prepare("DELETE FROM employees WHERE id LIKE 'e_wt_%'").run();
});

describe('Wrike Routes', () => {
  it('returns configured=false when WRIKE_TOKEN is not set', async () => {
    delete process.env.WRIKE_TOKEN;
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/wrike/status' });
    expect(res.json().configured).toBe(false);
    app._restoreFetch();
    await app.close();
  });

  it('returns configured=true when WRIKE_TOKEN is set', async () => {
    process.env.WRIKE_TOKEN = 'test-token';
    process.env.WRIKE_HOST = 'www.wrike.com';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/wrike/status' });
    expect(res.json().configured).toBe(true);
    delete process.env.WRIKE_TOKEN;
    app._restoreFetch();
    await app.close();
  });

  it('returns 401 without auth for sync endpoint', async () => {
    process.env.WRIKE_TOKEN = 'test-token';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/wrike/sync?month=2026-04' });
    expect(res.statusCode).toBe(401);
    delete process.env.WRIKE_TOKEN;
    app._restoreFetch();
    await app.close();
  });

  it('returns 400 for invalid month format', async () => {
    process.env.WRIKE_TOKEN = 'test-token';
    const app = await buildApp();
    const cookie = await login(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/wrike/sync?month=invalid',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    delete process.env.WRIKE_TOKEN;
    app._restoreFetch();
    await app.close();
  });

  it('sync aggregates timelogs by user x folder and auto-matches names', async () => {
    process.env.WRIKE_TOKEN = 'test-token';
    process.env.WRIKE_HOST = 'www.wrike.com';

    db.prepare('INSERT OR IGNORE INTO clients (id, name, type, active) VALUES (?,?,?,?)').run('c_wt_1', 'Honeydew', 'retainer', 1);
    db.prepare('INSERT OR IGNORE INTO clients (id, name, type, active) VALUES (?,?,?,?)').run('c_wt_3', 'Maccabi', 'retainer', 1);
    db.prepare('INSERT OR IGNORE INTO employees (id, name, role, visible) VALUES (?,?,?,?)').run('e_wt_12', 'דימה', '', 1);
    db.prepare('INSERT OR IGNORE INTO employees (id, name, role, visible) VALUES (?,?,?,?)').run('e_wt_2', 'עמית', '', 1);

    const mockFetchFn = async (url) => {
      const u = new URL(url);
      if (u.pathname === '/api/v4/contacts') {
        return { ok: true, json: async () => ({ kind: 'contacts', data: mockContacts }) };
      }
      if (u.pathname.startsWith('/api/v4/timelogs')) {
        return { ok: true, json: async () => ({ kind: 'timelogs', data: mockTimelogs }) };
      }
      if (u.pathname.startsWith('/api/v4/tasks')) {
        const ids = u.pathname.replace('/api/v4/tasks/', '').split(',');
        const tasks = mockTasks.filter(t => ids.includes(t.id));
        return { ok: true, json: async () => ({ kind: 'tasks', data: tasks }) };
      }
      if (u.pathname.startsWith('/api/v4/folders')) {
        const ids = u.pathname.replace('/api/v4/folders/', '').split(',');
        const folders = mockFolders.filter(f => ids.includes(f.id));
        return { ok: true, json: async () => ({ kind: 'folders', data: folders }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
    };

    const app = await buildApp(mockFetchFn);
    const cookie = await login(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/wrike/sync?month=2026-04',
      headers: { cookie },
    });

    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body).toHaveProperty('employees');
    expect(body).toHaveProperty('unmatchedContacts');
    expect(body).toHaveProperty('unmatchedFolders');

    // דימה should match an employee named דימה (could be e12 or e_wt_12 depending on DB state)
    const dima = body.employees.find(e => e.matchedEmpName === 'דימה');
    expect(dima).toBeDefined();
    expect(dima.wrikeName).toContain('דימה');
    const honeydewEntry = dima.clients.find(c => c.wrikeFolderName === 'Honeydew');
    expect(honeydewEntry).toBeDefined();
    expect(honeydewEntry.hours).toBe(8);

    const amit = body.employees.find(e => e.matchedEmpName === 'עמית');
    expect(amit).toBeDefined();
    const maccabiEntry = amit.clients.find(c => c.wrikeFolderName === 'Maccabi');
    expect(maccabiEntry).toBeDefined();
    expect(maccabiEntry.hours).toBe(7);

    expect(body.unmatchedFolders.find(f => f.wrikeFolderName === 'Internal Meetings')).toBeDefined();

    delete process.env.WRIKE_TOKEN;
    app._restoreFetch();
    await app.close();
  });

  it('handles Wrike API errors gracefully', async () => {
    process.env.WRIKE_TOKEN = 'test-token';
    process.env.WRIKE_HOST = 'www.wrike.com';

    const mockFetchFn = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    const app = await buildApp(mockFetchFn);
    const cookie = await login(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/wrike/sync?month=2026-04',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(502);
    delete process.env.WRIKE_TOKEN;
    app._restoreFetch();
    await app.close();
  });

  it('follows Wrike pagination with nextPageToken', async () => {
    process.env.WRIKE_TOKEN = 'test-token';
    process.env.WRIKE_HOST = 'www.wrike.com';

    let timelogCallCount = 0;
    const mockFetchFn = async (url) => {
      const u = new URL(url);
      if (u.pathname === '/api/v4/contacts') {
        return { ok: true, json: async () => ({ kind: 'contacts', data: mockContacts }) };
      }
      if (u.pathname.startsWith('/api/v4/timelogs')) {
        timelogCallCount++;
        if (timelogCallCount === 1) {
          return { ok: true, json: async () => ({ kind: 'timelogs', data: [mockTimelogs[0]], nextPageToken: 'PAGE2' }) };
        }
        return { ok: true, json: async () => ({ kind: 'timelogs', data: [mockTimelogs[1]] }) };
      }
      if (u.pathname.startsWith('/api/v4/tasks')) {
        return { ok: true, json: async () => ({ kind: 'tasks', data: [mockTasks[0]] }) };
      }
      if (u.pathname.startsWith('/api/v4/folders')) {
        return { ok: true, json: async () => ({ kind: 'folders', data: [mockFolders[0]] }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    };

    const app = await buildApp(mockFetchFn);
    const cookie = await login(app);

    await app.inject({
      method: 'GET',
      url: '/api/wrike/sync?month=2026-04',
      headers: { cookie },
    });

    expect(timelogCallCount).toBe(2);

    delete process.env.WRIKE_TOKEN;
    app._restoreFetch();
    await app.close();
  });
});