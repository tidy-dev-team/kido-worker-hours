import 'chart.js/auto';
import './style.css';

import { api } from './api.js';
import { loadState } from './state.js';
import { navigate, onMonthChange, setRenderers, renderPage, setMatrixView, setMatrixFocusEmp, setWeeklyWeekIdx, setClientShowInactive, setEmpView } from './router.js';
import { initMonthSelect, closeModal, mkKey } from './utils.js';

import { renderOverview, initCharts } from './pages/overview.js';
import { renderClients, updateClientHours, deleteClient, toggleClientActive, openClientModal, toggleClientTypeFields, applyToAllMonths, saveClient } from './pages/clients.js';
import { renderEmployees, toggleEmpVisibility, toggleAllEmployees, updateEmpHours, updateEmpVacDays, resetEmpHours, deleteEmployee, sendAllocation, sendSlackMsg, sendAllAllocations, sendAllEmails, sendAllSlack, openEmpModal, updateScopePreview, saveEmployee, openClientModalFromEmp, openNewMonthModal, openMonthSetupModal, updateVacPreview, onMsDaysChange, addVacRow, activateVacRow, removeVacRow, addNewClientForm, removeClientForm, toggleNcFields, saveMonthSetup } from './pages/employees.js';
import { renderMatrix, onMatrixInput, onMatrixChange, copyAllocations, resetMonth } from './pages/matrix.js';
import { autoDistribute } from './pages/auto-distribute.js';
import { renderWeeklySchedule, clearWeeklySchedule, autoWeeklyDistribute, wsShowPopover, wsToggleClient } from './pages/weekly-schedule.js';
import { renderSettings, deleteMonth, exportMonthsToExcel } from './pages/settings.js';

// Register renderers (breaks circular dep: router can't import pages)
setRenderers({ renderOverview, initCharts, renderClients, renderEmployees, renderMatrix, renderWeeklySchedule, renderSettings });

// Expose all handler functions called from inline onclick/oninput/onchange in rendered HTML
Object.assign(window, {
  navigate, onMonthChange,
  closeModal, mkKey,
  updateClientHours, deleteClient, toggleClientActive, openClientModal,
  toggleClientTypeFields, applyToAllMonths, saveClient,
  toggleEmpVisibility, toggleAllEmployees, updateEmpHours, updateEmpVacDays,
  resetEmpHours, deleteEmployee, sendAllocation, sendSlackMsg, sendAllAllocations,
  sendAllEmails, sendAllSlack, openEmpModal, updateScopePreview, saveEmployee,
  openClientModalFromEmp,
  openNewMonthModal, openMonthSetupModal, updateVacPreview, onMsDaysChange,
  addVacRow, activateVacRow, removeVacRow, addNewClientForm, removeClientForm,
  toggleNcFields, saveMonthSetup,
  onMatrixInput, onMatrixChange, copyAllocations, resetMonth, autoDistribute,
  clearWeeklySchedule, autoWeeklyDistribute, wsShowPopover, wsToggleClient,
  deleteMonth, exportMonthsToExcel,
  renderPage, setMatrixView, setMatrixFocusEmp, setWeeklyWeekIdx, setClientShowInactive, setEmpView,
  logout,
});

// ─── Login page ───────────────────────────────────────────────────────────────

const _appHTML = document.getElementById('app').innerHTML;

function showLogin(errorMsg) {
  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--surface)">
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r);padding:40px 36px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,.15)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px">
          <div style="background:var(--primary);border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#fff" stroke-width="1.5"/><path d="M8 4.5V8l2.5 2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>
          </div>
          <div>
            <div style="font-weight:700;font-size:16px">WorkHours</div>
            <div style="font-size:12px;color:var(--muted)">ניהול שעות עבודה</div>
          </div>
        </div>
        <form id="login-form" style="display:flex;flex-direction:column;gap:14px">
          <div class="fg">
            <label class="fl">אימייל</label>
            <input id="login-email" type="email" class="fi" placeholder="your@email.com" autocomplete="email" required>
          </div>
          <div class="fg">
            <label class="fl">סיסמה</label>
            <input id="login-password" type="password" class="fi" placeholder="••••••••" autocomplete="current-password" required>
          </div>
          ${errorMsg ? `<div style="color:var(--danger);font-size:13px;text-align:center">${errorMsg}</div>` : ''}
          <button type="submit" class="btn btn-p" style="width:100%;justify-content:center;margin-top:4px">כניסה</button>
        </form>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await api.post('/api/auth/login', {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value,
      });
      document.getElementById('app').innerHTML = _appHTML;
      await init();
    } catch {
      showLogin('אימייל או סיסמה שגויים');
    }
  });

  document.getElementById('login-email')?.focus();
}

// Called from logout button in settings page
async function logout() {
  await api.post('/api/auth/logout');
  location.reload();
}

// Make showLogin accessible from api.js (used on 401)
window.__showLogin = showLogin;

// ─── App init ─────────────────────────────────────────────────────────────────

async function init() {
  try {
    await loadState();
    initMonthSelect();
    navigate('overview');
  } catch (e) {
    if (e.message === '401') {
      showLogin();
    }
  }
}

init();
