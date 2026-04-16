import { state } from '../state.js';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { mkLabel } from '../utils.js';

let _wrikeData = null;
let _wrikeLoading = false;

export async function syncWrikeData(mk) {
  _wrikeLoading = true;
  renderPage();
  try {
    _wrikeData = await api.get(`/api/wrike/sync?month=${mk}`);
  } catch (e) {
    _wrikeData = { error: e.message || 'Failed to fetch Wrike data' };
  }
  _wrikeLoading = false;
  renderPage();
}

export function renderActuals() {
  const mk = state.currentMonth;
  const ml = mkLabel(mk);

  const configured = _wrikeData !== null || (!_wrikeData && !_wrikeLoading);
  const isConfigured = true;

  let bodyHtml = '';

  if (_wrikeLoading) {
    bodyHtml = `<div style="text-align:center;padding:60px"><div style="font-size:14px;color:var(--muted)">${t('reports.loading')}</div></div>`;
  } else if (!_wrikeData) {
    bodyHtml = `
      <div style="text-align:center;padding:60px">
        <div style="font-size:48px;margin-bottom:16px;opacity:0.15">⏱</div>
        <div style="font-size:15px;color:var(--muted);margin-bottom:20px">${t('reports.emptyState')}</div>
        <button class="btn btn-p" onclick="syncWrikeData('${mk}')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7a6 6 0 0112 0 6 6 0 01-12 0" stroke="currentColor" stroke-width="1.4"/><path d="M7 1v3M7 10v3M1 7h3M10 7h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          ${t('reports.syncNow')}
        </button>
      </div>`;
  } else if (_wrikeData.error) {
    bodyHtml = `<div class="ins-alert danger" style="margin-top:16px"><span class="ins-alert-icon">⚠</span><span>${t('reports.error')}: ${_wrikeData.error}</span></div>`;
  } else {
    const data = _wrikeData;
    const employees = data.employees || [];
    const unmatchedContacts = data.unmatchedContacts || [];
    const unmatchedFolders = data.unmatchedFolders || [];

    const allFolderKeys = new Set();
    employees.forEach(e => (e.clients || []).forEach(c => allFolderKeys.add(c.wrikeFolderName)));
    unmatchedFolders.forEach(f => allFolderKeys.add(f.wrikeFolderName));
    const folderCols = [...allFolderKeys];

    const matchedEmps = employees.filter(e => e.matchedEmpId);
    const unmatchedEmps = employees.filter(e => !e.matchedEmpId);

    const totalRow = folderCols.map(col => {
      const sum = employees.reduce((s, e) => s + (e.clients || []).filter(c => c.wrikeFolderName === col).reduce((a, c) => a + c.hours, 0), 0);
      return `<td style="background:var(--surface-2);padding:8px 10px;font-size:12px;font-weight:700;border:1px solid var(--border);text-align:center">${sum || '—'}</td>`;
    }).join('');
    const totalEmpHours = employees.reduce((s, e) => s + e.totalHours, 0);

    bodyHtml = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-p btn-sm" onclick="syncWrikeData('${mk}')">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1a5 5 0 015 5 5 5 0 01-5 5 5 5 0 010-10" stroke="currentColor" stroke-width="1.2"/><path d="M6 2v3l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          ${t('reports.resync')}
        </button>
        <span class="chip">${employees.length} ${t('reports.wrikeUsers')}</span>
        <span class="chip">${matchedEmps.length}/${state.employees.filter(e => e.visible !== false).length} ${t('reports.matched')}</span>
      </div>

      ${unmatchedContacts.length || unmatchedFolders.length ? `
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap">
          ${unmatchedContacts.length ? `<div class="ins-alert warn" style="margin:0"><span class="ins-alert-icon">👤</span><span>${t('reports.unmatchedContacts')}: ${unmatchedContacts.map(c => `<strong>${c.wrikeName}</strong>`).join(', ')}</span></div>` : ''}
          ${unmatchedFolders.length ? `<div class="ins-alert warn" style="margin:0"><span class="ins-alert-icon">📁</span><span>${t('reports.unmatchedFolders')}: ${unmatchedFolders.map(f => `<strong>${f.wrikeFolderName}</strong>`).join(', ')}</span></div>` : ''}
        </div>
      ` : ''}

      <div class="tbl-wrap" style="margin-bottom:20px">
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr>
              <th style="padding:10px 14px;text-align:start;background:var(--surface-2);border:1px solid var(--border);font-size:12px;font-weight:600;color:var(--muted);white-space:nowrap;position:sticky;inset-inline-start:0;z-index:2;border-inline-end:2px solid var(--border)">${t('reports.employee')}</th>
              ${folderCols.map(col => `<th style="padding:8px 10px;text-align:center;background:var(--surface-2);border:1px solid var(--border);font-size:11px;font-weight:600;color:var(--muted);min-width:90px">${col.length > 14 ? col.slice(0, 14) + '…' : col}</th>`).join('')}
              <th style="padding:8px 10px;text-align:center;background:var(--primary-light);border:1px solid var(--border);font-size:11px;font-weight:600;color:var(--primary);min-width:80px">${t('reports.total')}</th>
            </tr>
          </thead>
          <tbody>
            ${matchedEmps.map(e => `<tr>
              <td style="padding:8px 14px;border:1px solid var(--border);font-size:13px;font-weight:600;background:var(--surface-2);position:sticky;inset-inline-start:0;z-index:1;border-inline-end:2px solid var(--border)">
                ${e.matchedEmpName || e.wrikeName}
                ${e.matchedEmpId ? `<span style="font-size:10px;color:var(--muted);margin-inline-start:6px">${t('reports.synced')}</span>` : ''}
                </td>
              ${folderCols.map(col => {
                const c = (e.clients || []).find(cl => cl.wrikeFolderName === col);
                const h = c ? c.hours : 0;
                const col_h = c && c.matchedClientId ? 'var(--text)' : 'var(--warning)';
                return `<td style="padding:8px 10px;border:1px solid var(--border);text-align:center;font-size:13px;font-weight:${h > 0 ? '600' : '400'};color:${h > 0 ? col_h : 'var(--muted-2)'}">${h || '—'}</td>`;
              }).join('')}
              <td style="padding:8px 10px;border:1px solid var(--border);text-align:center;font-size:13px;font-weight:700;background:var(--primary-light)">${e.totalHours}h</td>
            </tr>`).join('')}
            ${unmatchedEmps.length ? `<tr><td colspan="${folderCols.length + 2}" style="padding:10px 14px;font-size:11px;color:var(--warning);border:1px solid var(--border);background:var(--warning-bg)">${t('reports.unmatchedWrikeUsers')}</td></tr>` : ''}
            ${unmatchedEmps.map(e => `<tr style="opacity:0.6">
              <td style="padding:8px 14px;border:1px solid var(--border);font-size:13px;color:var(--warning);background:var(--surface-2);position:sticky;inset-inline-start:0;z-index:1;border-inline-end:2px solid var(--border)">${e.wrikeName || e.wrikeId} <span style="font-size:10px">(${t('reports.noMatch')})</span></td>
              ${folderCols.map(col => {
                const c = (e.clients || []).find(cl => cl.wrikeFolderName === col);
                return `<td style="padding:8px 10px;border:1px solid var(--border);text-align:center;font-size:13px;color:var(--muted)">${c ? c.hours : '—'}</td>`;
              }).join('')}
              <td style="padding:8px 10px;border:1px solid var(--border);text-align:center;font-size:13px;font-weight:600;color:var(--warning)">${e.totalHours}h</td>
            </tr>`).join('')}
            <tr>
              <td style="padding:8px 14px;font-size:12px;font-weight:700;border:1px solid var(--border);background:var(--surface-2)">${t('reports.total')}</td>
              ${totalRow}
              <td style="background:var(--primary-light);padding:8px 10px;font-size:12px;font-weight:700;border:1px solid var(--border);text-align:center;color:var(--primary)">${totalEmpHours}h</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  return `
    <div id="actuals-page" class="page-hd flex items-c just-b">
      <div>
        <div class="page-title">${t('reports.title')}</div>
        <div class="page-sub">${t('reports.sub').replace('{month}', ml)}</div>
      </div>
    </div>
    ${bodyHtml}
  `;
}