import { MONTHS, MONTH_NAMES_HE } from '../constants.js';
import { state, saveState } from '../state.js';
import { api } from '../api.js';
import { getWorkingDays, getEmpHours, calcAutoHours, calcMonthWorkDays, calcAutoHoursForEmp } from '../working-days.js';
import { getEmpAllocated, getEmpActiveClients } from '../aggregations.js';
import { clientTypeBadge, clientTypeLabel, closeModal, mkLabel, mkKey, initMonthSelect } from '../utils.js';
import { _empView, setEmpView, setEmpEditReturnId, renderPage, navigate } from '../router.js';
import { getHolidays } from '../hebrew-calendar.js';
import { openClientModal } from './clients.js';

// ===================== EMPLOYEES PAGE =====================
export function renderEmployees(){
  const m=state.currentMonth,ml=MONTHS.find(x=>x.key===m)?.label||m;
  const wd=getWorkingDays(m),ah=wd*7;
  const visCount=state.employees.filter(e=>e.visible!==false).length;

  const sorted=state.employees.slice().sort((a,b)=>a.name.localeCompare(b.name,'he'));

  let content='';
  if(_empView==='cards'){
    const cards=sorted.map(e=>{
      const avail=getEmpHours(e,m),alloc=getEmpAllocated(e.id,m);
      const util=avail>0?Math.round(alloc/avail*100):0;
      const bc=util>100?'pb-d':util>85?'pb-w':'pb-s';
      const isHidden=e.visible===false;
      const empMatrix=(state.matrix[m]||{})[e.id]||{};
      const clientEntries=Object.entries(empMatrix).filter(([,h])=>(parseFloat(h)||0)>0);
      const clientRows=clientEntries.map(([cid,h])=>{
        const cl=state.clients.find(c=>c.id===cid);if(!cl)return'';
        const isPref=(e.preferredClients||[]).includes(cid);
        return `<div class="emp-card-client-row">
          <span>${isPref?'<span style="color:var(--primary);font-size:10px">★</span> ':''}<span>${cl.name}</span></span>
          <span style="font-weight:700;color:var(--primary);font-size:12px">${h}h</span>
        </div>`;
      }).join('');
      const noAlloc=clientEntries.length===0;
      const utilColor=util>100?'var(--danger)':util>85?'var(--warning)':'var(--success)';
      return `<div class="emp-card${isHidden?' emp-card-hidden':''}" data-emp-id="${e.id}">
        <div class="emp-card-hd">
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;flex:1;min-width:0">
            <input type="checkbox" class="emp-visible-cb" ${isHidden?'':'checked'} onchange="toggleEmpVisibility('${e.id}')"
              style="width:14px;height:14px;flex-shrink:0;cursor:pointer;accent-color:var(--primary)">
            <strong style="font-size:14px;${isHidden?'color:var(--muted)':''};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.name}</strong>
            ${isHidden?'<span class="chip" style="font-size:10px;flex-shrink:0">מוסתר</span>':''}
          </label>
          ${e.role?`<span class="chip" style="font-size:10px;flex-shrink:0">${e.role}</span>`:''}
        </div>
        <div class="emp-card-stat">
          <span style="color:var(--muted)">שעות חודש</span>
          <span style="font-weight:600">${avail}h</span>
        </div>
        <div class="emp-card-stat" style="margin-bottom:6px">
          <span style="color:var(--muted)">מוקצה</span>
          <span style="font-weight:700;color:${utilColor}">${alloc}h (${util}%)</span>
        </div>
        <div class="pb-wrap" style="margin-bottom:10px"><div class="pb ${bc}" style="width:${Math.min(util,100)}%"></div></div>
        ${(e.preferredClients||[]).length>0?`<div style="font-size:10px;color:var(--primary);margin-bottom:6px">★ ${(e.preferredClients||[]).length} לקוחות קבועים</div>`:''}
        <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">הקצאות — ${ml}</div>
        <div class="emp-card-clients">
          ${noAlloc?`<div style="font-size:11px;color:var(--muted);text-align:center;padding:10px 0">אין הקצאות לחודש זה</div>`:clientRows}
        </div>
        <div class="emp-card-ft">
          <button class="btn btn-s btn-sm btn-edit-emp" onclick="openEmpModal('${e.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.41 1.41 0 0 1 2 2L3.5 10.5l-3 .5.5-3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> ערוך</button>
          <button class="btn btn-s btn-sm btn-send-alloc" title="שלח הקצאה" onclick="sendAllocation('${e.id}')">📤 שלח</button>
          <button class="btn btn-s btn-sm btn-reset-hours" title="איפוס לאוטומטי" onclick="resetEmpHours('${e.id}','${m}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10.5 6a4.5 4.5 0 1 1-1.1-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><polyline points="7.5,1 9.5,3 7.5,5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button class="btn btn-d btn-sm btn-delete-emp" onclick="deleteEmployee('${e.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="1,3 11,3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4 3V2h4v1M2 3l.7 7.3A1 1 0 0 0 3.7 11h4.6a1 1 0 0 0 1-.7L10 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>`;
    }).join('');
    content=`<div class="emp-cards-grid">${cards}</div>`;
  } else {
    const rows=sorted.map(e=>{
      const avail=getEmpHours(e,m),alloc=getEmpAllocated(e.id,m);
      const util=avail>0?Math.round(alloc/avail*100):0;
      const bc=util>100?'pb-d':util>85?'pb-w':'pb-s';
      const ac=getEmpActiveClients(e.id,m);
      const isAuto=e.monthlyHours?.[m]===undefined;
      const isHidden=e.visible===false;
      const scope=e.scope!=null?e.scope:100;
      return `<tr class="emp-row${isHidden?' emp-hidden':''}" data-emp-id="${e.id}">
        <td class="emp-name-cell">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" class="emp-visible-cb" ${isHidden?'':'checked'} onchange="toggleEmpVisibility('${e.id}')"
              style="width:15px;height:15px;cursor:pointer;accent-color:var(--primary)">
            <strong style="${isHidden?'color:var(--muted)':''}">${e.name}</strong>
            ${isHidden?'<span class="chip">מוסתר</span>':''}
            ${scope<100?`<span class="chip" style="background:var(--primary-light);color:var(--primary);border-color:rgba(218,119,86,.25)">${scope}%</span>`:''}
          </label>
        </td>
        <td class="emp-role-cell">
          <span class="text-m text-sm">${e.role||'—'}</span>
          ${(e.preferredClients||[]).length>0?`<div style="font-size:10px;color:var(--primary)">★ ${(e.preferredClients||[]).length} לקוחות קבועים</div>`:''}
        </td>
        <td class="emp-hours-cell">
          <div class="flex items-c gap2">
            <input type="number" class="fi emp-hours-inp" style="width:90px;padding:4px 8px" value="${avail}" min="0" onchange="updateEmpHours('${e.id}','${m}',this.value)">
            ${isAuto?'<span class="chip">אוטו</span>':''}
          </div>
        </td>
        <td class="emp-vac-cell">
          <input type="number" class="fi emp-vac-inp" style="width:70px;padding:4px 8px;text-align:center" value="${(state.vacations?.[m]?.[e.id])||0}" min="0" max="30"
            onchange="updateEmpVacDays('${e.id}','${m}',this.value)">
        </td>
        <td>${alloc}</td>
        <td style="min-width:110px"><div class="flex items-c gap2"><div class="pb-wrap" style="flex:1"><div class="pb ${bc}" style="width:${Math.min(util,100)}%"></div></div><span class="text-sm text-m" style="min-width:35px">${util}%</span></div></td>
        <td><span class="${ac>=6?'badge b-warn':''}">${ac} / 6</span></td>
        <td class="emp-actions-cell"><div class="actions">
          <button class="btn btn-s btn-sm btn-edit-emp" onclick="openEmpModal('${e.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.41 1.41 0 0 1 2 2L3.5 10.5l-3 .5.5-3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> ערוך</button>
          <button class="btn btn-s btn-sm btn-send-alloc" title="שלח הקצאה" onclick="sendAllocation('${e.id}')">📤 שלח</button>
          <button class="btn btn-s btn-sm btn-reset-hours" title="איפוס לאוטומטי" onclick="resetEmpHours('${e.id}','${m}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10.5 6a4.5 4.5 0 1 1-1.1-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><polyline points="7.5,1 9.5,3 7.5,5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button class="btn btn-d btn-sm btn-delete-emp" onclick="deleteEmployee('${e.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="1,3 11,3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4 3V2h4v1M2 3l.7 7.3A1 1 0 0 0 3.7 11h4.6a1 1 0 0 0 1-.7L10 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div></td>
      </tr>`;
    }).join('');
    content=`<div class="card" id="emp-list-card">
      <div class="card-hd">
        <div class="card-title">רשימת עובדים</div>
        <span class="flex items-c gap2 text-sm text-m">
          <span class="chip">☑ = מוצג במטריצה</span>
          <span class="chip">7h × ${wd} ימים = ${ah}h ברירת מחדל</span>
          <span class="chip"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M10.5 6a4.5 4.5 0 1 1-1.1-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><polyline points="7.5,1 9.5,3 7.5,5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg> = איפוס לאוטומטי</span>
        </span>
      </div>
      <div class="tbl-wrap"><table id="emp-tbl">
        <thead><tr><th>☑ שם</th><th>תפקיד</th><th>שעות ${ml}</th><th>ימי חופש</th><th>מוקצות</th><th>ניצולת</th><th>לקוחות</th><th>פעולות</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  return `
  <div id="employees-page" class="page-hd flex items-c just-b">
    <div><div class="page-title" id="emp-title">עובדים</div>
      <div class="page-sub" id="emp-sub">${state.employees.length} עובדים | ${visCount} מוצגים במטריצה | ימי עבודה ב${ml}: ${wd} | ברירת מחדל: ${ah}h</div>
    </div>
    <div class="flex gap2" id="emp-actions">
      <button class="btn btn-s btn-sm" id="btn-show-all-emps" onclick="toggleAllEmployees(true)">הצג הכל</button>
      <button class="btn btn-s btn-sm" id="btn-hide-all-emps" onclick="toggleAllEmployees(false)">הסתר הכל</button>
      <button class="btn btn-s btn-sm" onclick="setEmpView('${_empView==='cards'?'table':'cards'}');renderPage()">${_empView==='cards'?'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="0.5" y="0.5" width="12" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="0.5" y="5" width="12" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="0.5" y="9.5" width="12" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/></svg> טבלה':'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="0.5" y="0.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="7" y="0.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="0.5" y="7" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="7" y="7" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg> כרטיסיות'}</button>
      <button class="btn btn-s btn-sm" id="btn-send-all-alloc" onclick="sendAllAllocations()">📤 שלח לכל</button>
      <button class="btn btn-p" id="btn-add-emp" onclick="openEmpModal()">+ הוסף עובד</button>
    </div>
  </div>
  ${content}`;
}

export function toggleEmpVisibility(eid){
  const e=state.employees.find(x=>x.id===eid);
  if(e){
    e.visible=e.visible===false?true:false;
    e.hidden=!e.visible;
    api.put(`/api/employees/${eid}`,{name:e.name,role:e.role,email:e.email,slackWebhook:e.slackWebhook,scope:e.scope,visible:e.visible,preferredClients:e.preferredClients||[]});
    renderPage();
  }
}
export function toggleAllEmployees(show){
  state.employees.forEach(e=>{e.visible=show;e.hidden=!show;api.put(`/api/employees/${e.id}`,{name:e.name,role:e.role,email:e.email,slackWebhook:e.slackWebhook,scope:e.scope,visible:show,preferredClients:e.preferredClients||[]});});
  renderPage();
}
export function updateEmpHours(eid,mk,v){
  const e=state.employees.find(x=>x.id===eid);
  if(!e)return;
  if(!e.monthlyHours)e.monthlyHours={};
  e.monthlyHours[mk]=parseFloat(v)||0;
  api.put(`/api/employees/${eid}/hours/${mk}`,{hours:e.monthlyHours[mk]});
}
export function updateEmpVacDays(eid,mk,v){
  if(!state.vacations)state.vacations={};
  if(!state.vacations[mk])state.vacations[mk]={};
  const days=parseFloat(v)||0;
  if(days>0)state.vacations[mk][eid]=days;
  else delete state.vacations[mk][eid];
  api.put(`/api/vacations/${mk}/${eid}`,{days});
  renderPage();
}
export function resetEmpHours(eid,mk){
  const e=state.employees.find(x=>x.id===eid);
  if(e&&e.monthlyHours){
    delete e.monthlyHours[mk];
    api.put(`/api/employees/${eid}/hours/${mk}`,{hours:0});
    renderPage();
  }
}
export function deleteEmployee(id){
  if(!confirm('למחוק עובד זה?'))return;
  state.employees=state.employees.filter(e=>e.id!==id);
  Object.keys(state.matrix).forEach(mk=>{delete state.matrix[mk][id];});
  api.delete(`/api/employees/${id}`);
  renderPage();
}

export function buildAllocationMsg(e,m){
  const ml=MONTHS.find(x=>x.key===m)?.label||m;
  const ed=(state.matrix[m]||{})[e.id]||{};
  const alloc=getEmpAllocated(e.id,m),avail=getEmpHours(e,m);
  const lines=Object.entries(ed)
    .filter(([,h])=>(parseFloat(h)||0)>0)
    .map(([cid,h])=>{const c=state.clients.find(x=>x.id===cid);return `• ${c?c.name:cid}: ${h}h`;})
    .join('\n');
  return `היי ${e.name},\nהנה הקצאת השעות שלך לחודש ${ml}:\n\n${lines||'אין הקצאות'}\n\nסה״כ: ${alloc}/${avail}h`;
}

export function getEditedMsg(eid){
  const ta=document.getElementById('alloc-msg-'+eid);
  return ta?ta.value:buildAllocationMsg(state.employees.find(x=>x.id===eid),state.currentMonth);
}

export function sendAllocation(eid){
  const e=state.employees.find(x=>x.id===eid);
  if(!e)return;
  const m=state.currentMonth,ml=MONTHS.find(x=>x.key===m)?.label||m;
  const msg=buildAllocationMsg(e,m);
  const hasEmail=!!e.email,hasSlack=!!e.slackWebhook;
  document.getElementById('modal-root').innerHTML=`
  <div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal modal-send-alloc" id="modal-send-alloc" style="max-width:500px">
      <div class="modal-hd">
        <div class="modal-t">שליחת הקצאה — ${e.name}</div>
        <button class="btn btn-s btn-close-modal" style="padding:5px 9px" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-bd">
        <label class="fl" style="margin-bottom:6px">הודעה (ניתן לערוך)</label>
        <textarea id="alloc-msg-${eid}" rows="8" class="fi" style="font-size:13px;line-height:1.7;font-family:inherit;resize:vertical">${msg}</textarea>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
          <button class="btn btn-p" ${hasEmail?'':'disabled title="לא הוגדר אימייל לעובד"'}
            onclick="window.open('mailto:${e.email||''}?subject=הקצאת שעות ${ml}&body='+encodeURIComponent(getEditedMsg('${eid}')))">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><polyline points="1,3.5 7,8.5 13,3.5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
            שלח במייל${hasEmail?' → '+e.email:' (לא הוגדר אימייל)'}
          </button>
          <button class="btn btn-p" style="background:#4a154b" ${hasSlack?'':'disabled title="לא הוגדר Slack Webhook"'}
            onclick="sendSlackMsg('${eid}',getEditedMsg('${eid}'),this)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10l1.5-3.5L2 3h10l-1.5 3.5L12 10H7.5L5 12.5V10H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
            שלח ב-Slack${hasSlack?'':' (לא הוגדר Webhook)'}
          </button>
          <button class="btn btn-s" onclick="navigator.clipboard.writeText(getEditedMsg('${eid}')).then(()=>alert('הועתק ✓'))">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="2" width="8" height="10" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M4 4H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1" stroke="currentColor" stroke-width="1.3"/></svg>
            העתק הודעה
          </button>
        </div>
      </div>
      <div class="modal-ft"><button class="btn btn-s" onclick="closeModal()">סגור</button></div>
    </div>
  </div>`;
}

export async function sendSlackMsg(eid,msg,btn){
  const e=state.employees.find(x=>x.id===eid);
  if(!e?.slackWebhook)return;
  if(btn){btn.disabled=true;btn.textContent='שולח...';}
  try{
    const r=await fetch(e.slackWebhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:msg})});
    if(r.ok||r.type==='opaque'){
      if(btn){btn.textContent='✓ נשלח';btn.style.background='var(--success)';}
    }else{
      if(btn){btn.disabled=false;btn.innerHTML='<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10l1.5-3.5L2 3h10l-1.5 3.5L12 10H7.5L5 12.5V10H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> שלח ב-Slack';}
      alert('שגיאה בשליחה ל-Slack: '+r.status);
    }
  }catch(err){
    if(btn){btn.disabled=false;btn.innerHTML='<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10l1.5-3.5L2 3h10l-1.5 3.5L12 10H7.5L5 12.5V10H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> שלח ב-Slack';}
    navigator.clipboard.writeText(msg).then(()=>alert('לא ניתן לשלוח ישירות (CORS).\nההודעה הועתקת ללוח — הדבק ב-Slack ידנית.'));
  }
}

export function sendAllAllocations(){
  const m=state.currentMonth,ml=MONTHS.find(x=>x.key===m)?.label||m;
  const emps=state.employees.filter(e=>e.visible!==false);
  const rows=emps.map(e=>{
    const msg=buildAllocationMsg(e,m);
    const hasEmail=!!e.email,hasSlack=!!e.slackWebhook;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-weight:600;font-size:13px">${e.name}</span>
      <button id="sa-email-${e.id}" class="btn btn-s btn-sm" ${hasEmail?'':'disabled'} title="${hasEmail?e.email:'לא הוגדר אימייל'}"
        onclick="window.open('mailto:${e.email||''}?subject=הקצאת שעות ${ml}&body='+encodeURIComponent(buildAllocationMsg(state.employees.find(x=>x.id==='${e.id}'),state.currentMonth)));this.innerHTML='<svg width=&quot;12&quot; height=&quot;12&quot; viewBox=&quot;0 0 12 12&quot; fill=&quot;none&quot;><path d=&quot;M2 6l3 3 5-5&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.5&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;/></svg>';this.style.color='var(--success)'">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><polyline points="1,3.5 7,8.5 13,3.5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>${hasEmail?'':' —'}
      </button>
      <button id="sa-slack-${e.id}" class="btn btn-s btn-sm" style="${hasSlack?'background:#4a154b;color:#fff':''}" ${hasSlack?'':'disabled'} title="${hasSlack?'Slack Webhook':'לא הוגדר Webhook'}"
        onclick="sendSlackMsg('${e.id}',buildAllocationMsg(state.employees.find(x=>x.id==='${e.id}'),state.currentMonth),this)">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 10l1.5-3.5L2 3h10l-1.5 3.5L12 10H7.5L5 12.5V10H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>${hasSlack?'':' —'}
      </button>
    </div>`;
  }).join('');
  const slackCount=emps.filter(e=>e.slackWebhook).length;
  const emailCount=emps.filter(e=>e.email).length;
  document.getElementById('modal-root').innerHTML=`
  <div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal modal-send-all" id="modal-send-all" style="max-width:460px">
      <div class="modal-hd">
        <div class="modal-t">שליחה לכל העובדים — ${ml}</div>
        <button class="btn btn-s btn-close-modal" style="padding:5px 9px" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-bd">
        <div class="send-all-btns" style="display:flex;gap:8px;margin-bottom:14px">
          <button class="btn btn-p btn-send-all-email" id="btn-send-all-email" style="flex:1" ${emailCount?'':'disabled'}
            onclick="sendAllEmails()"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><polyline points="1,3.5 7,8.5 13,3.5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> שלח לכל במייל (${emailCount})</button>
          <button class="btn btn-p btn-send-all-slack" id="btn-send-all-slack" style="flex:1;background:#4a154b" ${slackCount?'':'disabled'}
            onclick="sendAllSlack()"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10l1.5-3.5L2 3h10l-1.5 3.5L12 10H7.5L5 12.5V10H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> שלח לכל ב-Slack (${slackCount})</button>
        </div>
        <div style="max-height:380px;overflow-y:auto">${rows}</div>
      </div>
      <div class="modal-ft"><button class="btn btn-s" onclick="closeModal()">סגור</button></div>
    </div>
  </div>`;
}

export function sendAllEmails(){
  const m=state.currentMonth,ml=MONTHS.find(x=>x.key===m)?.label||m;
  const emps=state.employees.filter(e=>e.visible!==false&&e.email);
  emps.forEach((e,i)=>setTimeout(()=>{
    window.open(`mailto:${e.email}?subject=הקצאת שעות ${ml}&body=${encodeURIComponent(buildAllocationMsg(e,m))}`);
    const btn=document.getElementById('sa-email-'+e.id);
    if(btn){btn.textContent='✓';btn.style.color='var(--success)';}
  },i*300));
}

export async function sendAllSlack(){
  const m=state.currentMonth;
  const emps=state.employees.filter(e=>e.visible!==false&&e.slackWebhook);
  await Promise.all(emps.map(e=>sendSlackMsg(e.id,buildAllocationMsg(e,m),document.getElementById('sa-slack-'+e.id))));
}

export function openEmpModal(eid=null){
  const e=eid?state.employees.find(x=>x.id===eid):null;
  const currentScope=e?.scope!=null?e.scope:100;
  const hf=MONTHS.map(mo=>{
    const auto=Math.round(calcAutoHours(mo.key)*currentScope/100);
    return `<div class="mcell">
      <div class="mcell-lbl" id="mcell-lbl-${mo.key}">${mo.short}</div>
      <div class="mcell-inp" id="mcell-val-${mo.key}" style="cursor:default;color:var(--text);font-weight:600;text-align:center;padding:7px 5px">${auto}</div>
    </div>`;
  }).join('');
  document.getElementById('modal-root').innerHTML=`
  <div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal modal-employee" id="modal-employee">
      <div class="modal-hd">
        <div class="modal-t">${e?'עריכת עובד':'הוספת עובד'}</div>
        <button class="btn btn-s btn-close-modal" style="padding:5px 9px" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-bd">
        <div class="frow">
          <div class="fg"><label class="fl">שם עובד</label>
            <input type="text" class="fi" id="e-name" value="${e?.name||''}" placeholder="שם העובד"></div>
          <div class="fg"><label class="fl">תפקיד</label>
            <input type="text" class="fi" id="e-role" value="${e?.role||''}" placeholder="תפקיד (אופציונלי)"></div>
        </div>
        <div class="frow">
          <div class="fg"><label class="fl">אימייל</label>
            <input type="email" class="fi" id="e-email" value="${e?.email||''}" placeholder="email@example.com"></div>
          <div class="fg"><label class="fl">Slack Webhook URL</label>
            <input type="url" class="fi" id="e-slack" value="${e?.slackWebhook||''}" placeholder="https://hooks.slack.com/...">
            <div class="fhint">Incoming Webhook URL לשליחת הקצאה ישירות לסלאק</div></div>
        </div>
        <div class="fg">
          <label class="fl">אחוזי משרה</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="number" class="fi" id="e-scope" value="${currentScope}" min="1" max="100" style="width:90px;text-align:center"
              oninput="updateScopePreview(this.value)">
            <span class="text-m text-sm">%</span>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${[25,50,60,75,80,100].map(p=>`<button type="button" class="btn btn-s btn-sm scope-preset" data-preset="${p}" style="padding:4px 8px;${currentScope===p?'background:var(--primary);color:#fff;border-color:var(--primary)':''}" onclick="document.getElementById('e-scope').value=${p};updateScopePreview(${p})">${p}%</button>`).join('')}
            </div>
          </div>
          <div class="fhint">משפיע על חישוב השעות האוטומטי וניכוי ימי חופש. 100% = משרה מלאה.</div>
        </div>
        <div class="fg">
          <label class="fl">תצוגת שעות לפי חודש <span class="text-m text-sm">(7h × ימי עבודה × % משרה)</span></label>
          <div class="mgrid">${hf}</div>
          <div class="fhint">לשינוי שעות ידני — ערוך ישירות בטבלת העובדים.</div>
        </div>
        <div class="fg" id="emp-pref-clients">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <label class="fl" style="margin-bottom:0">★ לקוחות קבועים <span class="text-m text-sm">(עדיפות בפיזור אוטומטי)</span></label>
            <button type="button" class="btn btn-s btn-sm btn-add-client-from-emp" onclick="openClientModalFromEmp('${eid||''}')">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              לקוח חדש
            </button>
          </div>
          <div class="pref-grid" id="emp-client-pref-grid">
            ${state.clients.map(c=>`
              <label class="pref-item pref-item-client" data-client-id="${c.id}">
                <input type="checkbox" data-pref="${c.id}" ${(e?.preferredClients||[]).includes(c.id)?'checked':''}>
                <span style="flex:1">${c.name}</span>
                <span style="font-size:10px;color:var(--muted)">${clientTypeLabel(c.type)}</span>
              </label>`).join('')}
          </div>
          <div class="fhint">עובד עם לקוח קבוע יקבל עדיפות בהקצאת לקוח זה בפיזור אוטומטי.</div>
        </div>
      </div>
      <div class="modal-ft">
        <button class="btn btn-s btn-cancel" onclick="closeModal()">ביטול</button>
        <button class="btn btn-p btn-save-emp" id="btn-save-emp" onclick="saveEmployee('${eid||''}')">שמור</button>
      </div>
    </div>
  </div>`;
}

export function updateScopePreview(val){
  const scope=Math.max(1,Math.min(100,Math.round(parseFloat(val)||100)));
  const inp=document.getElementById('e-scope');
  if(inp)inp.value=scope;
  document.querySelectorAll('.scope-preset').forEach(btn=>{
    const p=parseInt(btn.dataset.preset);
    const active=p===scope;
    btn.style.background=active?'var(--primary)':'';
    btn.style.color=active?'#fff':'';
    btn.style.borderColor=active?'var(--primary)':'';
  });
  // Update the read-only value cells in the monthly hours grid
  MONTHS.forEach(mo=>{
    const cell=document.getElementById('mcell-val-'+mo.key);
    if(!cell)return;
    cell.textContent=Math.round(calcAutoHours(mo.key)*scope/100);
  });
}
export function saveEmployee(eid){
  const name=document.getElementById('e-name').value.trim();
  const role=document.getElementById('e-role').value.trim();
  if(!name){alert('יש להזין שם עובד');return;}
  const scope=Math.max(1,Math.min(100,parseFloat(document.getElementById('e-scope')?.value)||100));
  const prefClients=[...document.querySelectorAll('[data-pref]:checked')].map(i=>i.dataset.pref);
  const email=document.getElementById('e-email').value.trim();
  const slackWebhook=document.getElementById('e-slack').value.trim();
  if(eid){
    const e=state.employees.find(x=>x.id===eid);
    if(e){e.name=name;e.role=role;e.scope=scope;e.preferredClients=prefClients;e.email=email;e.slackWebhook=slackWebhook;}
    api.put(`/api/employees/${eid}`,{name,role,email,slackWebhook,scope,visible:true,preferredClients:prefClients});
  } else {
    const newId='e'+Date.now();
    state.employees.push({id:newId,name,role,scope,visible:true,hidden:false,monthlyHours:{},preferredClients:prefClients,email,slackWebhook});
    state.employees.sort((a,b)=>a.name.localeCompare(b.name,'he'));
    api.post('/api/employees',{id:newId,name,role,email,slackWebhook,scope,visible:true,preferredClients:prefClients});
  }
  closeModal();renderPage();
}

export function openClientModalFromEmp(eid){
  setEmpEditReturnId(eid||null);
  openClientModal();
}

// ===================== MONTH SETUP MODAL =====================
export function openNewMonthModal(){
  const active=state.activeMonths||[];
  const now=new Date();
  const defaultY=now.getFullYear()<2026?2026:now.getFullYear();
  let defaultMk=null;
  for(let m=1;m<=12;m++){const k=mkKey(defaultY,m);if(!active.includes(k)){defaultMk=k;break;}}
  if(!defaultMk)defaultMk=mkKey(defaultY+1,1);
  openMonthSetupModal(defaultMk);
}

let _vacIdx=0;
let _ncIdx=0;

export function openMonthSetupModal(mk){
  mk=mk||state.currentMonth;
  _ncIdx=0;_vacIdx=0;
  const ml=MONTHS.find(x=>x.key===mk)?.label||mk;
  const[y,m]=mk.split('-').map(Number);
  const last=new Date(y,m,0).getDate();
  if(!state.monthSetup)state.monthSetup={};
  if(!state.vacations)state.vacations={};

  const DAY_NAMES=['א','ב','ג','ד','ה','ו','ש'];
  const firstDow=new Date(y,m-1,1).getDay();
  let cells=[];
  for(let i=0;i<firstDow;i++)cells.push('<td></td>');
  for(let d=1;d<=last;d++){
    const dow=new Date(y,m-1,d).getDay();
    const key=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const h=getHolidays(y)[key];
    const isWeekend=dow===5||dow===6;
    let bg='',title='',label='';
    if(isWeekend){bg='background:#f1f5f9;color:#94a3b8';}
    else if(h&&h.type==='holiday'){bg='background:#fee2e2;color:#b91c1c';title=h.name;label='<div style="font-size:8px;line-height:1;margin-top:1px">'+(h.name.length>6?h.name.slice(0,6)+'…':h.name)+'</div>';}
    else if(h&&h.type==='eve'){bg='background:#fef9c3;color:#92400e';title=h.name;label='<div style="font-size:8px;line-height:1;margin-top:1px">½</div>';}
    else{bg='background:#f0fdf4;color:#166534';}
    cells.push('<td style="text-align:center;padding:4px 2px;border-radius:4px;'+bg+'" title="'+title+'"><div style="font-weight:600;font-size:13px">'+d+'</div>'+label+'</td>');
    if(dow===6&&d<last){cells.push('</tr><tr>');}
  }
  const calRows=cells.join('');

  const {full,half,off,effective}=calcMonthWorkDays(mk);
  const customDays=state.monthSetup[mk]?.workDays;
  const suggestedDays=customDays!==undefined?customDays:effective;

  const vacRows=state.employees.filter(e=>(state.vacations[mk]?.[e.id]||0)>0).map(e=>{
    const vac=(state.vacations[mk]?.[e.id])||0;
    const scope=(e.scope!=null?e.scope:100)/100;
    const base=e.monthlyHours?.[mk]!==undefined?e.monthlyHours[mk]:Math.round(suggestedDays*7*scope);
    const afterVac=Math.max(0,base-Math.round(vac*7*scope));
    const previewTxt='<span style="color:var(--muted-2);font-size:11px">'+base+'h</span> <span style="font-size:11px;color:var(--muted-2)">→</span> <span style="font-weight:600;font-size:12px;color:var(--primary)">'+afterVac+'h</span>';
    const uid='vr_'+e.id;
    return '<div data-vac-row="'+uid+'" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">'
      +'<span style="flex:1;font-size:13px">'+e.name+'</span>'
      +'<span id="vac-preview-'+e.id+'" style="min-width:80px;text-align:left">'+previewTxt+'</span>'
      +'<input type="number" min="0" max="30" class="fi" style="width:70px;padding:4px 8px;text-align:center"'
      +' value="'+vac+'" data-vaceid="'+e.id+'" oninput="updateVacPreview(this,\''+mk+'\')">'
      +'<span style="font-size:11px;color:var(--muted)">ימים</span>'
      +'<button class="btn btn-s btn-sm" onclick="removeVacRow(\''+uid+'\')" style="padding:2px 7px">✕</button>'
      +'</div>';
  }).join('');

  document.getElementById('modal-root').innerHTML=`
  <div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal modal-month-setup" id="modal-month-setup" style="max-width:560px">
      <div class="modal-hd">
        <div class="modal-t" style="display:flex;align-items:center;gap:8px"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="11.5" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 1.5v3M11 1.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M1.5 7h13" stroke="currentColor" stroke-width="1.4"/></svg> הוספת חודש חדש</div>
        <button class="btn btn-s btn-close-modal" style="padding:5px 9px" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-bd" style="display:flex;flex-direction:column;gap:18px">

        <div id="ms-month-picker">
          <label class="fl">בחר חודש</label>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <button class="btn btn-s btn-sm" onclick="openMonthSetupModal(mkKey(${y}-1,${m}))">‹ שנה קודמת</button>
              <span style="font-weight:700;font-size:15px;color:var(--text)">${y}</span>
              <button class="btn btn-s btn-sm" onclick="openMonthSetupModal(mkKey(${y}+1,${m}))">שנה הבאה ›</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
              ${MONTH_NAMES_HE.map((name,i)=>{
                const thisMk=mkKey(y,i+1);
                const isActive=(state.activeMonths||[]).includes(thisMk);
                const isSel=thisMk===mk;
                return `<button class="btn btn-sm" style="padding:7px 4px;font-size:12px;justify-content:center;${isSel?'background:var(--primary);color:#fff;':isActive?'background:#e2e8f0;color:var(--muted);':'background:var(--surface);border:1px solid var(--border);color:var(--text);'}${isActive&&!isSel?'cursor:default;':''}"
                  ${isActive&&!isSel?'disabled title="חודש קיים"':''}
                  onclick="openMonthSetupModal('${thisMk}')">${name}${isActive&&!isSel?'<span style=\'font-size:9px\'>✓</span>':''}</button>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div id="ms-calendar">
          <div class="fl" style="margin-bottom:8px">לוח שנה</div>
          <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:separate;border-spacing:2px">
            <thead><tr>${DAY_NAMES.map(d=>'<th style="text-align:center;font-size:11px;color:var(--muted);padding:3px">'+d+'</th>').join('')}</tr></thead>
            <tbody><tr>${calRows}</tr></tbody>
          </table></div>
          <div style="display:flex;gap:12px;margin-top:8px;font-size:12px;flex-wrap:wrap">
            <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#f0fdf4;border-radius:2px;display:inline-block"></span> יום עבודה מלא (${full})</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#fef9c3;border-radius:2px;display:inline-block"></span> ערב חג – חצי יום (${half})</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:#fee2e2;border-radius:2px;display:inline-block"></span> חג (${off})</span>
          </div>
        </div>

        <div id="ms-workdays">
          <label class="fl">ימי עבודה אפקטיביים בחודש</label>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">חישוב אוטו: ${full} מלאים + ${half}×½ ערבי חג = <b>${effective}</b> ימים = <b>${Math.round(effective*7)}h</b></div>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="number" id="ms-days" class="fi" style="width:90px" min="0" max="31" step="0.5" value="${suggestedDays}" oninput="onMsDaysChange(this.value,'${mk}')">
            <span style="font-size:13px;color:var(--muted)">ימים = <b id="ms-hours-preview">${Math.round(suggestedDays*7)}h</b> לעובד</span>
            <button class="btn btn-s btn-sm" onclick="document.getElementById('ms-days').value=${effective};onMsDaysChange(${effective},'${mk}')">אפס לאוטו</button>
          </div>
        </div>

        <div id="ms-vacations">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <label class="fl" style="margin:0">ימי חופש לעובדים (${ml})</label>
            <button class="btn btn-p btn-sm btn-add-vac" id="btn-add-vac" onclick="addVacRow('${mk}')">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              הוסף חופשת עובד
            </button>
          </div>
          <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r);padding:${vacRows?'6px 10px':'0'}" id="vac-list">${vacRows}</div>
        </div>

        <div id="ms-new-clients" style="border-top:1px solid var(--border);padding-top:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <label class="fl" style="margin:0">לקוחות חדשים לחודש זה</label>
            <button class="btn btn-p btn-sm btn-add-nc" id="btn-add-nc" onclick="addNewClientForm('${mk}','${ml}')">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              הוסף לקוח
            </button>
          </div>
          <div id="nc-list" style="display:flex;flex-direction:column;gap:10px"></div>
        </div>

      </div>
      <div class="modal-ft">
        <button class="btn btn-s btn-cancel" onclick="closeModal()">ביטול</button>
        <button class="btn btn-p btn-save-month" id="btn-save-month" onclick="saveMonthSetup('${mk}')">שמור</button>
      </div>
    </div>
  </div>`;
}

export function updateVacPreview(inp,mk,overrideWorkDays){
  const eid=inp.dataset.vaceid;
  const e=state.employees.find(x=>x.id===eid);
  if(!e)return;
  const scope=(e.scope!=null?e.scope:100)/100;
  let base;
  if(overrideWorkDays!==undefined){
    base=Math.round(overrideWorkDays*7*scope);
  } else {
    base=e.monthlyHours?.[mk]!==undefined?e.monthlyHours[mk]:calcAutoHoursForEmp(e,mk);
  }
  const vac=parseFloat(inp.value)||0;
  const preview=document.getElementById('vac-preview-'+eid);
  if(!preview)return;
  if(vac>0){
    const afterVac=Math.max(0,base-Math.round(vac*7*scope));
    preview.innerHTML='<span style="color:var(--muted-2);font-size:11px">'+base+'h</span> <span style="font-size:11px;color:var(--muted-2)">→</span> <span style="font-weight:600;font-size:12px;color:var(--primary)">'+afterVac+'h</span>';
  } else {
    preview.innerHTML='<span style="font-weight:600;font-size:12px">'+base+'h</span>';
  }
}

export function onMsDaysChange(val,mk){
  const days=parseFloat(val)||0;
  document.getElementById('ms-hours-preview').textContent=Math.round(days*7)+'h';
  document.querySelectorAll('[data-vaceid]').forEach(inp=>updateVacPreview(inp,mk,days));
}

export function addVacRow(mk){
  const list=document.getElementById('vac-list');
  if(!list)return;
  const existingEids=new Set([...document.querySelectorAll('[data-vaceid]')].map(el=>el.dataset.vaceid).filter(Boolean));
  const available=state.employees.filter(e=>!existingEids.has(e.id));
  if(!available.length){alert('כל העובדים כבר נוספו');return;}
  const uid='vr'+(_vacIdx++);
  const opts=available.map(e=>'<option value="'+e.id+'">'+e.name+'</option>').join('');
  const row=document.createElement('div');
  row.dataset.vacRow=uid;
  row.style.cssText='display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)';
  row.innerHTML='<select class="fi" style="flex:1;padding:4px 8px" onchange="activateVacRow(this,\''+mk+'\',\''+uid+'\')">'
    +'<option value="">בחר עובד</option>'+opts+'</select>'
    +'<span id="vac-preview-'+uid+'" style="min-width:80px;text-align:left"></span>'
    +'<input type="number" min="0" max="30" class="fi" style="width:70px;padding:4px 8px;text-align:center" value="" data-vaceid="" oninput="updateVacPreview(this,\''+mk+'\')" disabled>'
    +'<span style="font-size:11px;color:var(--muted)">ימים</span>'
    +'<button class="btn btn-s btn-sm" onclick="removeVacRow(\''+uid+'\')" style="padding:2px 7px">✕</button>';
  list.style.padding='6px 10px';
  list.appendChild(row);
}

export function activateVacRow(sel,mk,uid){
  const eid=sel.value;
  if(!eid)return;
  const row=document.querySelector('[data-vac-row="'+uid+'"]');
  if(!row)return;
  const inp=row.querySelector('input[type="number"]');
  inp.dataset.vaceid=eid;
  inp.disabled=false;
  inp.value=(state.vacations[mk]?.[eid])||'';
  const preview=document.getElementById('vac-preview-'+uid);
  if(preview)preview.id='vac-preview-'+eid;
  const e=state.employees.find(x=>x.id===eid);
  const nameSpan=document.createElement('span');
  nameSpan.style.cssText='flex:1;font-size:13px';
  nameSpan.textContent=e?e.name:'';
  sel.replaceWith(nameSpan);
  const msDaysEl=document.getElementById('ms-days');
  const wdLive=msDaysEl?parseFloat(msDaysEl.value):NaN;
  updateVacPreview(inp,mk,!isNaN(wdLive)?wdLive:undefined);
}

export function removeVacRow(uid){
  const row=document.querySelector('[data-vac-row="'+uid+'"]');
  if(!row)return;
  row.remove();
  const list=document.getElementById('vac-list');
  if(list&&!list.querySelector('[data-vac-row]'))list.style.padding='0';
}

export function addNewClientForm(mk,ml){
  const list=document.getElementById('nc-list');
  if(!list)return;
  const idx=_ncIdx++;
  const empRows=state.employees.map(e=>`
    <label class="pref-item">
      <input type="checkbox" data-nc-emp-${idx}="${e.id}">
      <span style="flex:1">${e.name}</span>
      ${e.role?`<span style="font-size:10px;color:var(--muted)">${e.role}</span>`:''}
    </label>`).join('');
  const card=document.createElement('div');
  card.dataset.ncCard=idx;
  card.innerHTML=`
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r);padding:14px;display:flex;flex-direction:column;gap:12px;position:relative">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;font-weight:600;color:var(--muted)">לקוח חדש</span>
        <button class="btn btn-s btn-sm" style="padding:2px 7px" onclick="removeClientForm(${idx})">✕</button>
      </div>
      <div class="fg" style="margin:0">
        <label class="fl">שם לקוח <span style="color:var(--danger)">*</span></label>
        <input type="text" class="fi" id="nc-name-${idx}" placeholder="שם הלקוח החדש">
      </div>
      <div class="fg" style="margin:0">
        <label class="fl">סוג לקוח</label>
        <select class="fs" id="nc-type-${idx}" onchange="toggleNcFields(${idx},this.value)">
          <option value="retainer">ריטיינר</option>
          <option value="project">פרויקט</option>
          <option value="internal">פנימי</option>
        </select>
      </div>
      <div id="nc-bank-${idx}" style="display:none">
        <div class="fg" style="margin:0">
          <label class="fl">בנק שעות (תקציב פרויקט)</label>
          <input type="number" class="fi" id="nc-bankval-${idx}" min="0" placeholder="סה״כ שעות">
        </div>
      </div>
      <div id="nc-hrs-${idx}">
        <div class="fg" style="margin:0">
          <label class="fl">שעות ב${ml}</label>
          <input type="number" class="fi" id="nc-hours-${idx}" min="0" placeholder="0" style="width:120px">
        </div>
      </div>
      <div class="fg" style="margin:0">
        <label class="fl">עובדים משויכים</label>
        <div class="pref-grid" style="max-height:130px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:6px">
          ${empRows}
        </div>
      </div>
    </div>`;
  list.appendChild(card);
  document.getElementById(`nc-name-${idx}`)?.focus();
}

export function removeClientForm(idx){
  const card=document.querySelector(`[data-nc-card="${idx}"]`);
  if(card)card.remove();
}

export function toggleNcFields(idx,type){
  const bank=document.getElementById(`nc-bank-${idx}`);
  const hrs=document.getElementById(`nc-hrs-${idx}`);
  if(bank)bank.style.display=type==='project'?'':'none';
  if(hrs)hrs.style.display=type==='internal'?'none':'';
}

export async function saveMonthSetup(mk){
  if(!state.monthSetup)state.monthSetup={};
  if(!state.vacations)state.vacations={};
  const days=parseFloat(document.getElementById('ms-days').value);
  if(!isNaN(days))state.monthSetup[mk]={workDays:days};
  if(!state.vacations[mk])state.vacations[mk]={};

  const vacOps=[];
  document.querySelectorAll('[data-vaceid]').forEach(inp=>{
    const eid=inp.dataset.vaceid;
    if(!eid)return;
    const v=parseFloat(inp.value)||0;
    if(v>0)state.vacations[mk][eid]=v;
    else delete state.vacations[mk][eid];
    vacOps.push(api.put(`/api/vacations/${mk}/${eid}`,{days:v}));
  });

  const newClientOps=[];
  document.querySelectorAll('[data-nc-card]').forEach(card=>{
    const idx=card.dataset.ncCard;
    const nameEl=document.getElementById(`nc-name-${idx}`);
    if(!nameEl)return;
    const name=nameEl.value.trim();
    if(!name)return;
    const type=document.getElementById(`nc-type-${idx}`)?.value||'retainer';
    const hours=parseFloat(document.getElementById(`nc-hours-${idx}`)?.value)||0;
    const bank=parseFloat(document.getElementById(`nc-bankval-${idx}`)?.value)||0;
    const mh={};
    if(hours>0)mh[mk]=hours;
    const nc={id:'c'+Date.now()+'_'+idx,name,type,monthlyHours:mh};
    if(type==='project'&&bank)nc.hoursBank=bank;
    state.clients.push(nc);
    const clientId=nc.id;
    const updatedEmps=[];
    state.employees.forEach(e=>{
      const cb=card.querySelector(`[data-nc-emp-${idx}="${e.id}"]`);
      if(cb?.checked){
        if(!e.preferredClients)e.preferredClients=[];
        if(!e.preferredClients.includes(clientId))e.preferredClients.push(clientId);
        updatedEmps.push(e);
      }
    });
    newClientOps.push(
      api.post('/api/clients',{id:clientId,name,type,active:true,hoursBank:nc.hoursBank??null,weeklyDay:null}),
      hours>0?api.put(`/api/clients/${clientId}/hours/${mk}`,{hours}):null,
      ...updatedEmps.map(e=>api.put(`/api/employees/${e.id}`,{name:e.name,role:e.role,email:e.email,slackWebhook:e.slackWebhook,scope:e.scope,visible:e.visible,preferredClients:e.preferredClients})),
    );
  });
  state.clients.sort((a,b)=>a.name.localeCompare(b.name,'he'));

  if(!state.activeMonths)state.activeMonths=[];
  const isNew=!state.activeMonths.includes(mk);
  if(isNew){
    state.activeMonths.push(mk);
    state.activeMonths.sort();
    state.matrix[mk]={};
    state.vacations[mk]=state.vacations[mk]||{};
    state.weeklySchedule[mk]={};
  }
  state.currentMonth=mk;

  await Promise.all([
    api.put(`/api/months/${mk}`,{workDays:isNaN(days)?null:days,holidays:[]}),
    ...vacOps,
    ...newClientOps.filter(Boolean),
  ]);

  initMonthSelect();closeModal();renderPage();
}
