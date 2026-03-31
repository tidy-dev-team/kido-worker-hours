// Shared serialization helpers — used by route handlers and export

// Build { entityId: { monthKey: hours } } from flat DB rows
export function buildHoursMap(rows, idField) {
  const map = {};
  for (const r of rows) {
    if (!map[r[idField]]) map[r[idField]] = {};
    map[r[idField]][r.month_key] = r.hours;
  }
  return map;
}

export function serializeClient(c, mhMap, bhMap) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    active: c.active === 1,
    hoursBank: c.hours_bank,
    weeklyDay: c.weekly_day ? JSON.parse(c.weekly_day) : null,
    monthlyHours: mhMap[c.id] || {},
    billedHours: bhMap[c.id] || {},
  };
}

export function serializeEmployee(e, mhMap) {
  return {
    id: e.id,
    name: e.name,
    role: e.role,
    email: e.email,
    slackWebhook: e.slack_webhook,
    scope: e.scope,
    visible: e.visible === 1,
    hidden: e.visible === 0,
    preferredClients: e.preferred_clients ? JSON.parse(e.preferred_clients) : [],
    monthlyHours: mhMap[e.id] || {},
  };
}
