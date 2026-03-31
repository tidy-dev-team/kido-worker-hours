
import db from '../db.js';
import { requireAdmin } from '../auth.js';
import { buildHoursMap, serializeClient, serializeEmployee } from '../utils.js';

async function exportRoutes(fastify) {
  fastify.addHook('preHandler', requireAdmin);

  // GET /api/export — full DB dump in migrate-localstorage.js compatible format
  fastify.get('/api/export', async () => {
    // Clients
    const clientRows = db.prepare('SELECT * FROM clients ORDER BY name').all();
    const mhMap = buildHoursMap(db.prepare('SELECT * FROM client_monthly_hours').all(), 'client_id');
    const bhMap = buildHoursMap(db.prepare('SELECT * FROM client_billed_hours').all(), 'client_id');
    const clients = clientRows.map(c => serializeClient(c, mhMap, bhMap));

    // Employees — export format uses `hidden` only (no `visible`), matches migrate-localstorage.js
    const empRows = db.prepare('SELECT * FROM employees ORDER BY name').all();
    const empMhMap = buildHoursMap(db.prepare('SELECT * FROM employee_monthly_hours').all(), 'employee_id');
    const employees = empRows.map(e => {
      const { visible, ...emp } = serializeEmployee(e, empMhMap);
      return emp;
    });

    // Months
    const monthRows = db.prepare('SELECT * FROM months ORDER BY month_key').all();
    const activeMonths = monthRows.map(r => r.month_key);
    const monthSetup = Object.fromEntries(
      monthRows.map(r => [r.month_key, {
        workDays: r.work_days,
        holidays: r.holidays ? JSON.parse(r.holidays) : [],
      }])
    );

    // Vacations
    const vacRows = db.prepare('SELECT * FROM vacations').all();
    const vacations = {};
    for (const row of vacRows) {
      if (!vacations[row.month_key]) vacations[row.month_key] = {};
      vacations[row.month_key][row.employee_id] = row.days;
    }

    // Matrix
    const allocRows = db.prepare('SELECT * FROM allocations').all();
    const matrix = {};
    for (const row of allocRows) {
      if (!matrix[row.month_key]) matrix[row.month_key] = {};
      if (!matrix[row.month_key][row.employee_id]) matrix[row.month_key][row.employee_id] = {};
      matrix[row.month_key][row.employee_id][row.client_id] = row.hours;
    }

    // Weekly schedule
    const weeklyRows = db.prepare('SELECT * FROM weekly_schedule').all();
    const weeklySchedule = {};
    for (const row of weeklyRows) {
      if (!weeklySchedule[row.month_key]) weeklySchedule[row.month_key] = {};
      if (!weeklySchedule[row.month_key][row.employee_id]) weeklySchedule[row.month_key][row.employee_id] = {};
      weeklySchedule[row.month_key][row.employee_id][row.day] = JSON.parse(row.client_ids);
    }

    return { clients, employees, activeMonths, monthSetup, vacations, matrix, weeklySchedule };
  });
}

export default exportRoutes;
