import { state } from './state.js';
import { t, monthLabel } from './i18n.js';

export function clientTypeBadge(type){
  if(type==='retainer')return`<span class="badge b-ret">${t('clientType.retainer')}</span>`;
  if(type==='project')return`<span class="badge b-proj">${t('clientType.project')}</span>`;
  return`<span class="badge b-int">${t('clientType.internal')}</span>`;
}
export function clientTypeLabel(type){
  if(type==='retainer')return t('clientType.retainer');
  if(type==='project')return t('clientType.project');
  return t('clientType.internal');
}

export function mkLabel(mk){
  return monthLabel(mk);
}
export function mkKey(y,m){return `${y}-${String(m).padStart(2,'0')}`;}

export function closeModal(){document.getElementById('modal-root').innerHTML='';}

export function showToast(msg, type = 'error') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-show'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export async function withLoading(btn, asyncFn) {
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    return await asyncFn();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

export function initMonthSelect(){
  const sel=document.getElementById('month-select');
  sel.innerHTML='';
  (state.activeMonths||[state.currentMonth]).slice().sort().forEach(mk=>{
    const o=document.createElement('option');
    o.value=mk;o.textContent=mkLabel(mk);
    if(mk===state.currentMonth)o.selected=true;
    sel.appendChild(o);
  });
}
