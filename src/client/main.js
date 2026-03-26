import 'chart.js/auto';
import './style.css';

import { loadState } from './state.js';
import { navigate, onMonthChange, setRenderers } from './router.js';
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
  // Router
  navigate,
  onMonthChange,
  // Utils
  closeModal,
  mkKey,
  // Clients
  updateClientHours,
  deleteClient,
  toggleClientActive,
  openClientModal,
  toggleClientTypeFields,
  applyToAllMonths,
  saveClient,
  // Employees
  toggleEmpVisibility,
  toggleAllEmployees,
  updateEmpHours,
  updateEmpVacDays,
  resetEmpHours,
  deleteEmployee,
  sendAllocation,
  sendSlackMsg,
  sendAllAllocations,
  sendAllEmails,
  sendAllSlack,
  openEmpModal,
  updateScopePreview,
  saveEmployee,
  openClientModalFromEmp,
  // Month setup modal
  openNewMonthModal,
  openMonthSetupModal,
  updateVacPreview,
  onMsDaysChange,
  addVacRow,
  activateVacRow,
  removeVacRow,
  addNewClientForm,
  removeClientForm,
  toggleNcFields,
  saveMonthSetup,
  // Matrix
  onMatrixInput,
  onMatrixChange,
  copyAllocations,
  resetMonth,
  autoDistribute,
  // Weekly schedule
  clearWeeklySchedule,
  autoWeeklyDistribute,
  wsShowPopover,
  wsToggleClient,
  // Settings
  deleteMonth,
  exportMonthsToExcel,
});

function init(){
  loadState();
  initMonthSelect();
  navigate('overview');
}

init();
