import { MONTHS } from '../constants.js';
import { state, saveState } from '../state.js';
import { api } from '../api.js';
import { getClientHours, getTotalBilled, getRemainingBankBefore } from '../working-days.js';
import { getClientAllocated } from '../aggregations.js';
import { clientTypeBadge, clientTypeLabel, closeModal, mkLabel } from '../utils.js';
import { t, monthShort } from '../i18n.js';
import { _clientShowInactive, _empEditReturnId, setEmpEditReturnId, renderPage } from '../router.js';

// ===================== CLIENTS PAGE =====================
export function renderClients(){
  const m=state.currentMonth,ml=mkLabel(m);
  const totalH=state.clients.filter(c=>c.active!==false).reduce((s,c)=>s+getClientHours(c,m),0);
  const retC=state.clients.filter(c=>c.active!==false&&c.type==='retainer').length;
  const projC=state.clients.filter(c=>c.active!==false&&c.type==='project').length;
  const intC=state.clients.filter(c=>c.active!==false&&c.type==='internal').length;

  const activeCount=state.clients.filter(c=>c.active!==false).length;
  const rows=state.clients
    .slice().sort((a,b)=>a.name.localeCompare(b.name,'he'))
    .filter(c=>_clientShowInactive||c.active!==false)
    .map(c=>{
    const cont=getClientHours(c,m),alloc=getClientAllocated(c.id,m);
    const util=cont>0?Math.round(alloc/cont*100):0;
    const bc=util>100?'pb-d':util>80?'pb-w':'pb-i';
    const isInactive=c.active===false;
    // Bank column
    let bankCol='<span class="text-m text-sm">—</span>';
    if(c.type==='project'&&c.hoursBank){
      const billed=getTotalBilled(c);
      const remain=Math.max(0,c.hoursBank-billed);
      const pct=Math.round(billed/c.hoursBank*100);
      const bc2=remain<c.hoursBank*0.2?'pb-d':remain<c.hoursBank*0.5?'pb-w':'pb-s';
      const rc=remain<c.hoursBank*0.2?'var(--danger)':remain<c.hoursBank*0.5?'var(--warning)':'var(--success)';
      bankCol=`<div style="min-width:130px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
          <strong style="color:${rc}">${remain}h ${t('clients.remaining')}</strong>
          <span style="color:var(--muted)">${billed}/${c.hoursBank}h</span>
        </div>
        <div class="pb-wrap"><div class="pb ${bc2}" style="width:${Math.min(pct,100)}%"></div></div>
      </div>`;
    }
    return `<tr class="client-row${isInactive?' emp-hidden':''}" data-client-id="${c.id}">
      <td class="client-name-cell">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" class="client-active-cb" ${isInactive?'':'checked'} onchange="toggleClientActive('${c.id}')"
            style="width:15px;height:15px;cursor:pointer;accent-color:var(--primary)">
          <strong style="${isInactive?'color:var(--muted)':''}">${c.name}</strong>
          ${isInactive?`<span class="chip">${t('clients.inactive')}</span>`:''}
        </label>
      </td>
      <td class="client-type-cell">${clientTypeBadge(c.type)}</td>
      <td class="client-hours-cell"><input type="number" class="fi client-hours-inp" style="width:90px;padding:4px 8px" value="${cont}" min="0" onchange="updateClientHours('${c.id}','${m}',this.value)"></td>
      <td class="client-bank-cell">${bankCol}</td>
      <td class="client-alloc-cell">${alloc}</td>
      <td class="client-util-cell" style="min-width:110px"><div class="flex items-c gap2"><div class="pb-wrap" style="flex:1"><div class="pb ${bc}" style="width:${Math.min(util,100)}%"></div></div><span class="text-sm text-m" style="min-width:35px">${util}%</span></div></td>
      <td style="min-width:90px">${(()=>{const wd=c.weeklyDay!=null?(Array.isArray(c.weeklyDay)?c.weeklyDay:[c.weeklyDay]):[];if(!wd.length)return'<span class="text-m text-sm">—</span>';return'<div style="display:flex;gap:4px;flex-wrap:wrap">'+wd.map(d=>'<span style="background:var(--primary-light,#ede9fe);color:var(--primary);border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600">'+t('day.'+d)+'</span>').join('')+'</div>';})()}</td>
      <td class="client-actions-cell"><div class="actions">
        <button class="btn btn-s btn-sm btn-edit-client" onclick="openClientModal('${c.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.41 1.41 0 0 1 2 2L3.5 10.5l-3 .5.5-3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> ${t('btn.edit')}</button>
        <button class="btn btn-d btn-sm btn-delete-client" onclick="deleteClient('${c.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="1,3 11,3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4 3V2h4v1M2 3l.7 7.3A1 1 0 0 0 3.7 11h4.6a1 1 0 0 0 1-.7L10 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');

  return `
  <div id="clients-page" class="page-hd flex items-c just-b">
    <div><div class="page-title" id="clients-title">${t('clients.title')}</div><div class="page-sub" id="clients-sub">${activeCount} ${t('clients.active')} ${t('clients.outOf')} ${state.clients.length} | ${retC} ${t('clientType.retainer')} | ${projC} ${t('clientType.project')}${intC?` | ${intC} ${t('clientType.internal')}`:''} | ${totalH} ${t('clients.hours')} ${ml}</div></div>
    <div class="flex gap2" id="clients-actions">
      <button class="btn btn-s btn-sm" id="btn-toggle-inactive" onclick="setClientShowInactive(${!_clientShowInactive});renderPage()">${_clientShowInactive?t('clients.hideInactive'):t('clients.showInactive')}</button>
      <button class="btn btn-p" id="btn-add-client" onclick="openClientModal()">+ ${t('clients.addClient')}</button>
    </div>
  </div>
  <div class="card" id="clients-card">
    <div class="card-hd"><div class="card-title">${t('clients.listTitle')}</div><span class="text-sm text-m">${t('clients.tableHint')}: ${ml}</span></div>
    <div class="tbl-wrap"><table id="clients-tbl">
      <thead><tr><th>☑ ${t('clients.name')}</th><th>${t('clientStatus.type')}</th><th>${t('clients.hours')} ${ml}</th><th>🏦 ${t('clients.hoursBank')}</th><th>${t('emp.allocatedLabel')}</th><th>${t('clients.utilization')}</th><th>${t('clients.weeklyDays')}</th><th>${t('clients.actions')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

export function updateClientHours(cid,mk,v){
  const c=state.clients.find(x=>x.id===cid);
  if(!c)return;
  if(!c.monthlyHours)c.monthlyHours={};
  c.monthlyHours[mk]=parseFloat(v)||0;
  api.put(`/api/clients/${cid}/hours/${mk}`,{hours:c.monthlyHours[mk]});
}

export function deleteClient(id){
  if(!confirm(t('clients.deleteConfirm')))return;
  state.clients=state.clients.filter(c=>c.id!==id);
  Object.keys(state.matrix).forEach(mk=>Object.keys(state.matrix[mk]).forEach(eid=>{delete state.matrix[mk][eid][id];}));
  api.delete(`/api/clients/${id}`);
  renderPage();
}

export function toggleClientActive(cid){
  const c=state.clients.find(x=>x.id===cid);
  if(c){
    c.active=c.active===false?true:false;
    api.put(`/api/clients/${cid}`,{name:c.name,type:c.type,active:c.active,hoursBank:c.hoursBank,weeklyDay:c.weeklyDay});
    renderPage();
  }
}

export function openClientModal(cid=null){
  const c=cid?state.clients.find(x=>x.id===cid):null;
  const firstVal=c?Object.values(c.monthlyHours||{})[0]||0:0;
  const isProj=c?.type==='project';
  const totalBilled=c?getTotalBilled(c):0;
  const bankRemain=c?.hoursBank?c.hoursBank-totalBilled:null;
  const hf=MONTHS.map(mo=>`
    <div class="mcell">
      <div class="mcell-lbl">${monthShort(mo.key)}${isProj?`<br><span style="font-size:8px;color:#6366f1">${t('clients.planned')}</span>`:''}</div>
      <input type="number" class="mcell-inp" min="0" value="${c?getClientHours(c,mo.key):0}" data-month="${mo.key}">
      <div class="billed-row" style="${isProj?'':'display:none'}">
        <input type="number" class="mcell-billed" min="0" value="${c?.billedHours?.[mo.key]||''}" data-billed="${mo.key}" placeholder="${t('clients.billedPh')}">
      </div>
    </div>`).join('');
  const _existWd=c?.weeklyDay!=null?(Array.isArray(c.weeklyDay)?c.weeklyDay:[c.weeklyDay]):[];
  const _wdChecks='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">'+[0,1,2,3,4].map(function(v){var lbl=t('dayFull.'+v);return'<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" id="c-wd-'+v+'" value="'+v+'" '+(_existWd.includes(v)?'checked':'')+'><span>'+lbl+'</span></label>';}).join('')+'</div>';
  document.getElementById('modal-root').innerHTML=`
  <div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal modal-client" id="modal-client" style="max-width:580px">
      <div class="modal-hd">
        <div class="modal-t">${c?t('clients.editClient'):t('clients.addClientTitle')}</div>
        <button class="btn btn-s btn-close-modal" style="padding:5px 9px" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-bd">
        <div class="fg"><label class="fl">${t('clients.name')}</label>
          <input type="text" class="fi" id="c-name" value="${c?.name||''}" placeholder="${t('clients.namePh')}"></div>
        <div class="fg"><label class="fl">${t('clients.type')}</label>
          <select class="fs" id="c-type" onchange="toggleClientTypeFields(this.value)">
            <option value="retainer" ${c?.type==='retainer'||!c?'selected':''}>${t('clientType.retainer')}</option>
            <option value="project" ${c?.type==='project'?'selected':''}>${t('clientType.project')}</option>
            <option value="internal" ${c?.type==='internal'?'selected':''}>${t('clientType.internal')}</option>
          </select></div>
        <div id="bank-section" ${isProj?'':'style="display:none"'}>
          <div class="fg">
            <label class="fl">${t('clients.hoursBank')}</label>
            <input type="number" class="fi" id="c-bank" value="${c?.hoursBank||''}" min="0" placeholder="${t('clients.totalProjectHours')}">
            ${bankRemain!==null?`<div class="fhint" style="color:${bankRemain<20?'var(--danger)':'var(--success)'}">${t('clients.bankHint').replace('{remain}',bankRemain).replace('{billed}',totalBilled).replace('{total}',c.hoursBank)}</div>`:`<div class="fhint">${t('clients.totalProjectHours')}</div>`}
          </div>
        </div>
        <div id="hours-section" ${c?.type==='internal'?'style="display:none"':''}>
          <div class="fg">
            <label class="fl">${t('clients.hoursByMonth')}
              <span id="billed-lbl" class="text-sm text-m" ${isProj?'':'style="display:none"'}> | ${t('clients.billedYellowSub')}</span>
            </label>
            <div class="apply-bar">
              <span style="font-size:13px;font-weight:500;color:var(--text);display:flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M7.5 1L2 7.5h5L4.5 12 11 5.5H6L7.5 1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> ${t('clients.applyAll')}:</span>
              <input type="number" id="apply-all-val" min="0" value="${firstVal}" placeholder="${t('clients.hours')}">
              <button class="btn btn-p btn-sm" onclick="applyToAllMonths()">${t('clients.applyBtn')}</button>
            </div>
            <div class="mgrid">${hf}</div>
          </div>
        </div>
        <div class="fg" id="weekly-day-section" ${c?.type==='internal'?'style="display:none"':''}>
          <label class="fl">${t('clients.weeklyDays')}</label>
          ${_wdChecks}
        </div>
        <div class="fg" id="client-assigned-emps">
          <label class="fl">${t('clients.assignedEmps')} <span class="text-m text-sm">(${t('clients.assignedEmpsSub')})</span></label>
          <div class="pref-grid" id="client-emp-pref-grid">
            ${state.employees.map(emp=>`
              <label class="pref-item pref-item-emp" data-emp-id="${emp.id}">
                <input type="checkbox" data-cemp="${emp.id}" ${cid&&(emp.preferredClients||[]).includes(cid)?'checked':''}>
                <span style="flex:1">${emp.name}</span>
                ${emp.role?`<span style="font-size:10px;color:var(--muted)">${emp.role}</span>`:''}
              </label>`).join('')}
          </div>
          <div class="fhint">${t('clients.assignedEmpsHint')}</div>
        </div>
      </div>
      <div class="modal-ft">
        <button class="btn btn-s btn-cancel" onclick="closeModal()">${t('btn.cancel')}</button>
        <button class="btn btn-p btn-save-client" id="btn-save-client" onclick="saveClient('${cid||''}')">${t('btn.save')}</button>
      </div>
    </div>
  </div>`;
}

export function toggleClientTypeFields(type){
  const isProj=type==='project';
  const isInt=type==='internal';
  const bs=document.getElementById('bank-section');
  if(bs)bs.style.display=isProj?'':'none';
  const hs=document.getElementById('hours-section');
  if(hs)hs.style.display=isInt?'none':'';
  const bl=document.getElementById('billed-lbl');
  if(bl)bl.style.display=isProj?'':'none';
  document.querySelectorAll('.billed-row').forEach(el=>el.style.display=isProj?'':'none');
  const wds=document.getElementById('weekly-day-section');
  if(wds)wds.style.display=isInt?'none':'';
}

export function applyToAllMonths(){
  const val=document.getElementById('apply-all-val').value;
  document.querySelectorAll('[data-month]').forEach(i=>i.value=val||0);
}

export function saveClient(cid){
  const name=document.getElementById('c-name').value.trim();
  const type=document.getElementById('c-type').value;
  if(!name){alert(t('clients.nameRequired'));return;}
  const mh={};
  document.querySelectorAll('[data-month]').forEach(i=>{mh[i.dataset.month]=parseFloat(i.value)||0;});
  const billedH={};
  document.querySelectorAll('[data-billed]').forEach(i=>{const v=parseFloat(i.value);if(v>0)billedH[i.dataset.billed]=v;});
  const bankVal=parseFloat(document.getElementById('c-bank')?.value)||0;
  const assignedEmpIds=new Set([...document.querySelectorAll('[data-cemp]:checked')].map(i=>i.dataset.cemp));
  let clientId=cid;
  if(cid){
    const c=state.clients.find(x=>x.id===cid);
    if(c){
      c.name=name;c.type=type;c.monthlyHours=mh;
      if(type==='project'){if(bankVal)c.hoursBank=bankVal;else delete c.hoursBank;c.billedHours=billedH;}
      else{delete c.hoursBank;delete c.billedHours;}
      const wdArr=[0,1,2,3,4].filter(v=>document.getElementById(`c-wd-${v}`)?.checked);
      if(wdArr.length)c.weeklyDay=wdArr;else delete c.weeklyDay;
    }
  } else {
    const nc={id:'c'+Date.now(),name,type,monthlyHours:mh};
    if(type==='project'){if(bankVal)nc.hoursBank=bankVal;nc.billedHours=billedH;}
    const wdArr2=[0,1,2,3,4].filter(v=>document.getElementById(`c-wd-${v}`)?.checked);
    if(wdArr2.length)nc.weeklyDay=wdArr2;
    state.clients.push(nc);
    state.clients.sort((a,b)=>a.name.localeCompare(b.name,'he'));
    clientId=nc.id;
  }
  // Sync preferredClients on employees
  state.employees.forEach(e=>{
    const prefs=e.preferredClients||[];
    const before=prefs.includes(clientId);
    if(assignedEmpIds.has(e.id)&&!before){prefs.push(clientId);e.preferredClients=prefs;api.put(`/api/employees/${e.id}`,{name:e.name,role:e.role,email:e.email,slackWebhook:e.slackWebhook,scope:e.scope,visible:e.visible,preferredClients:prefs});}
    else if(!assignedEmpIds.has(e.id)&&before){e.preferredClients=prefs.filter(x=>x!==clientId);api.put(`/api/employees/${e.id}`,{name:e.name,role:e.role,email:e.email,slackWebhook:e.slackWebhook,scope:e.scope,visible:e.visible,preferredClients:e.preferredClients});}
  });

  // Persist client to server
  const c=state.clients.find(x=>x.id===clientId);
  if(c){
    const payload={name:c.name,type:c.type,active:c.active!==false,hoursBank:c.hoursBank??null,weeklyDay:c.weeklyDay??null};
    if(cid){
      api.put(`/api/clients/${clientId}`,payload);
    } else {
      api.post('/api/clients',{id:clientId,...payload});
    }
    // Persist monthly hours
    Object.entries(c.monthlyHours||{}).forEach(([mk,h])=>api.put(`/api/clients/${clientId}/hours/${mk}`,{hours:h}));
    if(c.type==='project')Object.entries(c.billedHours||{}).forEach(([mk,h])=>api.put(`/api/clients/${clientId}/billed/${mk}`,{hours:h}));
  }
  if(_empEditReturnId!==null){
    const returnId=_empEditReturnId;
    setEmpEditReturnId(null);
    renderPage();
    // Import openEmpModal dynamically to avoid circular dep
    import('./employees.js').then(mod=>mod.openEmpModal(returnId||undefined));
  } else {
    closeModal();renderPage();
  }
}
