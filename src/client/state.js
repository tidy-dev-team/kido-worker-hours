import { api } from './api.js';

// ===================== STATE =====================
// Mutable singleton — all modules import this same object reference.
export const state = {
  clients: [],
  employees: [],
  matrix: {},
  currentMonth: '',
  activeMonths: [],
  monthSetup: {},
  vacations: {},
  weeklySchedule: {},
};

export async function loadState() {
  const [clients, employees, months] = await Promise.all([
    api.get('/api/clients'),
    api.get('/api/employees'),
    api.get('/api/months'),
  ]);

  state.clients = clients;
  // Ensure both visible and hidden fields are set (different page modules use each)
  state.employees = employees.map(e => ({ ...e, hidden: !e.visible }));
  state.activeMonths = months.map(m => m.monthKey).sort();
  state.monthSetup = Object.fromEntries(
    months.map(m => [m.monthKey, { workDays: m.workDays, holidays: m.holidays || [] }])
  );

  if (!state.currentMonth || !state.activeMonths.includes(state.currentMonth)) {
    state.currentMonth = state.activeMonths[state.activeMonths.length - 1] || '';
  }

  // Fetch per-month data for all active months in parallel
  state.matrix = {};
  state.vacations = {};
  state.weeklySchedule = {};

  if (state.activeMonths.length > 0) {
    await Promise.all(state.activeMonths.map(async mk => {
      const [matrix, vacations, weekly] = await Promise.all([
        api.get(`/api/matrix/${mk}`),
        api.get(`/api/vacations/${mk}`),
        api.get(`/api/weekly/${mk}`),
      ]);
      state.matrix[mk] = matrix;
      state.vacations[mk] = vacations;
      state.weeklySchedule[mk] = weekly;
    }));
  }
}

// No-op — data is persisted via specific API calls in page modules
export function saveState() {}

export function mkClientHours(v) {
  return {};
}
