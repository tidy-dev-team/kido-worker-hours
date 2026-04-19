import db from '../db.js';
import { requireAuth } from '../auth.js';

const WRIKE_TOKEN = () => process.env.WRIKE_TOKEN || '';
const WRIKE_HOST = () => process.env.WRIKE_HOST || 'www.wrike.com';
const WRIKE_BASE = () => `https://${WRIKE_HOST()}/api/v4`;

async function wrikeFetch(path, token) {
  const res = await fetch(`${WRIKE_BASE()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw { status: res.status, ...err };
  }
  return res.json();
}

async function wrikeFetchAll(path, token) {
  let allData = [];
  let nextToken = undefined;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const url = nextToken ? `${path}${sep}nextPageToken=${nextToken}` : path;
    const json = await wrikeFetch(url, token);
    if (json.data) allData = allData.concat(json.data);
    nextToken = json.nextPageToken || undefined;
  } while (nextToken);
  return allData;
}

function fuzzyMatch(wrikeName, localNames) {
  const wLower = wrikeName.toLowerCase().trim();
  for (const { id, name } of localNames) {
    const lLower = name.toLowerCase().trim();
    if (lLower === wLower) return { id, name };
    if (wLower.includes(lLower) || lLower.includes(wLower)) return { id, name };
    const wParts = wLower.split(/\s+/);
    const lParts = lLower.split(/\s+/);
    for (const wp of wParts) {
      for (const lp of lParts) {
        if (wp === lp && lp.length >= 2) return { id, name };
      }
    }
  }
  return null;
}

export default async function wrikeRoutes(fastify) {
  // Public: check if Wrike integration is configured
  fastify.get('/api/wrike/status', async () => {
    return { configured: !!WRIKE_TOKEN() };
  });

  // List Wrike contacts vs local employees for manual mapping
  fastify.get('/api/wrike/contacts', { preHandler: requireAuth }, async (req, reply) => {
    const token = WRIKE_TOKEN();
    if (!token) return reply.code(503).send({ error: 'not configured' });
    const contacts = await wrikeFetchAll('/contacts', token);
    const employees = db.prepare('SELECT id, name, wrike_contact_id FROM employees WHERE visible = 1').all();
    return {
      wrike: contacts.filter(c => c.type !== 'Group').map(c => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() })).sort((a,b) => a.name.localeCompare(b.name)),
      local: employees.map(e => ({ id: e.id, name: e.name, wrikeContactId: e.wrike_contact_id || null })).sort((a,b) => a.name.localeCompare(b.name)),
    };
  });

  // Save all Wrike contact → employee mappings at once
  // Body: { mappings: [{wrikeContactId, employeeId}] }
  fastify.put('/api/wrike/contacts/map', { preHandler: requireAuth }, async (req, reply) => {
    const { mappings } = req.body || {};
    if (!Array.isArray(mappings)) return reply.code(400).send({ error: 'mappings array required' });
    const save = db.transaction(() => {
      // Clear all existing wrike_contact_id assignments
      db.prepare('UPDATE employees SET wrike_contact_id = NULL').run();
      // Set new assignments
      const stmt = db.prepare('UPDATE employees SET wrike_contact_id = ? WHERE id = ?');
      for (const { wrikeContactId, employeeId } of mappings) {
        if (employeeId && wrikeContactId) stmt.run(wrikeContactId, employeeId);
      }
    });
    save();
    return { ok: true };
  });

  // Debug: raw Wrike data for a month — shows first timelog, its task, and task's folders
  fastify.get('/api/wrike/debug', { preHandler: requireAuth }, async (req, reply) => {
    const token = WRIKE_TOKEN();
    if (!token) return reply.code(503).send({ error: 'not configured' });
    const { month = new Date().toISOString().slice(0, 7) } = req.query;
    const [yr, mo] = month.split('-').map(Number);
    const lastDay = new Date(yr, mo, 0).getDate();
    const dateFilter = JSON.stringify({ start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2,'0')}` });
    const timelogs = await wrikeFetchAll(`/timelogs?trackedDate=${encodeURIComponent(dateFilter)}`, token);
    const sample = timelogs.slice(0, 3);
    const taskIds = [...new Set(sample.map(t => t.taskId).filter(Boolean))];
    const tasks = taskIds.length ? (await wrikeFetch(`/tasks/${taskIds.join(',')}`, token)).data || [] : [];
    const folderIds = [...new Set(tasks.flatMap(t => [...(t.parentIds || []), ...(t.superParentIds || [])]))];
    const folders = folderIds.length ? (await wrikeFetch(`/folders/${folderIds.slice(0,20).join(',')}`, token)).data || [] : [];
    return { totalTimelogs: timelogs.length, sampleTimelogs: sample, tasks, folders };
  });

  // Auth-protected routes

  fastify.get('/api/wrike/sync', { preHandler: requireAuth }, async (req, reply) => {
    const token = WRIKE_TOKEN();
    if (!token) return reply.code(503).send({ error: 'Wrike token not configured' });

    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return reply.code(400).send({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    const [yr, mo] = month.split('-').map(Number);
    const lastDay = new Date(yr, mo, 0).getDate();
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    try {
      const contacts = await wrikeFetchAll('/contacts', token);

      const dateFilter = JSON.stringify({ start: startDate, end: endDate });
      const timelogs = await wrikeFetchAll(`/timelogs?trackedDate=${encodeURIComponent(dateFilter)}`, token);

      const taskIds = [...new Set(timelogs.map(t => t.taskId).filter(Boolean))];
      const tasks = [];
      for (let i = 0; i < taskIds.length; i += 100) {
        const batch = taskIds.slice(i, i + 100).join(',');
        const batchTasks = await wrikeFetch(`/tasks/${batch}`, token);
        if (batchTasks.data) tasks.push(...batchTasks.data);
        if (batchTasks.nextPageToken) {
          const rest = await wrikeFetchAll(`/tasks/${batch}?nextPageToken=${batchTasks.nextPageToken}`, token);
          tasks.push(...rest);
        }
      }

      const allFolderIds = [...new Set(tasks.flatMap(t => [...(t.parentIds || []), ...(t.superParentIds || [])]))];
      const folders = [];
      for (let i = 0; i < allFolderIds.length; i += 100) {
        const batch = allFolderIds.slice(i, i + 100).join(',');
        const batchFolders = await wrikeFetch(`/folders/${batch}`, token);
        if (batchFolders.data) folders.push(...batchFolders.data);
      }

      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const folderMap = new Map(folders.map(f => [f.id, f]));

      const employees = db.prepare('SELECT id, name, wrike_contact_id FROM employees').all();
      const clients = db.prepare('SELECT id, name FROM clients').all();
      // Build Wrike contact ID → employee map for direct matching
      const wrikeIdToEmp = new Map(
        employees.filter(e => e.wrike_contact_id).map(e => [e.wrike_contact_id, e])
      );

      const matchedEmps = new Map();
      const matchedClients = new Map();
      const unmatchedContacts = [];
      const unmatchedFolders = new Map();

      const empHoursMap = new Map();

      for (const tl of timelogs) {
        const contact = contactMap.get(tl.userId);
        const wrikeName = contact ? `${contact.firstName} ${contact.lastName}`.trim() : tl.userId;
        const task = tasks.find(t => t.id === tl.taskId);
        const taskFolderIds = [...(task?.parentIds || []), ...(task?.superParentIds || [])];
        // Pick the first folder that matches a client, otherwise use first available
        const matchedFolder = taskFolderIds.map(id => folderMap.get(id)).find(f => f && fuzzyMatch(f.title, clients));
        const folder = matchedFolder || taskFolderIds.map(id => folderMap.get(id)).find(Boolean) || null;
        const folderId = folder?.id || taskFolderIds[0] || null;
        const folderName = folder?.title || folderId || 'Unknown';

        const empKey = contact?.id || tl.userId;
        if (!matchedEmps.has(empKey)) {
          // Try direct wrike_contact_id match first, then fuzzy name match as fallback
          const directMatch = wrikeIdToEmp.get(empKey) || null;
          const match = directMatch || (contact ? fuzzyMatch(`${contact.firstName} ${contact.lastName}`.trim(), employees) : null);
          matchedEmps.set(empKey, {
            wrikeId: empKey,
            wrikeName,
            matchedEmpId: match?.id || null,
            matchedEmpName: match?.name || null,
          });
        }

        const clientKey = folderId || 'unknown-' + (folderName);
        if (!matchedClients.has(clientKey)) {
          const match = folder ? fuzzyMatch(folder.title, clients) : null;
          matchedClients.set(clientKey, {
            wrikeFolderId: folderId,
            wrikeFolderName: folderName,
            matchedClientId: match?.id || null,
            matchedClientName: match?.name || null,
          });
          if (!match && !unmatchedFolders.has(clientKey)) {
            unmatchedFolders.set(clientKey, {
              wrikeFolderId: folderId,
              wrikeFolderName: folderName,
              hours: 0,
            });
          }
        }

        const hoursKey = `${empKey}::${clientKey}`;
        empHoursMap.set(hoursKey, Math.round(((empHoursMap.get(hoursKey) || 0) + tl.hours) * 10) / 10);

        if (!matchedClients.get(clientKey).matchedClientId && unmatchedFolders.has(clientKey)) {
          unmatchedFolders.get(clientKey).hours = Math.round((unmatchedFolders.get(clientKey).hours + tl.hours) * 10) / 10;
        }
      }

      const employeeResults = [];
      for (const [empKey, empInfo] of matchedEmps) {
        const clientHours = [];
        let totalHours = 0;
        for (const [clientKey, clientInfo] of matchedClients) {
          const h = empHoursMap.get(`${empKey}::${clientKey}`) || 0;
          if (h > 0) {
            clientHours.push({ ...clientInfo, hours: h });
            totalHours += h;
          }
        }
        employeeResults.push({
          ...empInfo,
          totalHours: Math.round(totalHours * 10) / 10,
          clients: clientHours,
        });
        if (!empInfo.matchedEmpId) {
          unmatchedContacts.push({
            wrikeId: empInfo.wrikeId,
            wrikeName: empInfo.wrikeName,
            hours: totalHours,
          });
        }
      }

      employeeResults.sort((a, b) => b.totalHours - a.totalHours);

      return {
        employees: employeeResults,
        unmatchedContacts: unmatchedContacts.filter(c => {
          const empEntry = employeeResults.find(e => e.wrikeId === c.wrikeId);
          return !empEntry?.matchedEmpId;
        }),
        unmatchedFolders: [...unmatchedFolders.values()],
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(502).send({ error: 'Failed to fetch Wrike data', details: err.message || String(err) });
    }
  });
}