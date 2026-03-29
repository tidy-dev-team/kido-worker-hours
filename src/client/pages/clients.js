import { MONTHS } from '../constants.js';
import { state, saveState } from '../state.js';
import { api } from '../api.js';
import { getClientHours, getTotalBilled, getRemainingBankBefore } from '../working-days.js';
import { getClientAllocated } from '../aggregations.js';
import { clientTypeBadge, clientTypeLabel, closeModal } from '../utils.js';
import { _clientShowInactive, _empEditReturnId, setEmpEditReturnId, renderPage } from '../router.js';

// ===================== CLIENTS PAGE =====================
export function renderClients(){
  const m=state.currentMonth,ml=MONTHS.find(x=>x.key===m)?.label||m;
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
          <strong style="color:${rc}">${remain}h נותר</strong>
          <span style="color:var(--muted)">${billed}/${c.hoursBank}h</span>
        </div>
        <div class="pb-wrap"><div class="pb ${bc2}" style="width:${Math.min(pct,100)}%"></div></div>
      </div>`;
    }
    return `<tr${isInactive?' class="emp-hidden"':''}>
      <td>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" ${isInactive?'':'checked'} onchange="toggleClientActive('${c.id}')"
            style="width:15px;height:15px;cursor:pointer;accent-color:var(--primary)">
          <strong style="${isInactive?'color:var(--muted)':''}">${c.name}</strong>
          ${isInactive?'<span class="chip">לא פעיל</span>':''}
        </label>
      </td>
      <td>${clientTypeBadge(c.type)}</td>
      <td><input type="number" class="fi" style="width:90px;padding:4px 8px" value="${cont}" min="0" onchange="updateClientHours('${c.id}','${m}',this.value)"></td>
      <td>${bankCol}</td>
      <td>${alloc}</td>
      <td style="min-width:110px"><div class="flex items-c gap2"><div class="pb-wrap" style="flex:1"><div class="pb ${bc}" style="width:${Math.min(util,100)}%"></div></div><span class="text-sm text-m" style="min-width:35px">${util}%</span></div></td>
      <td style="min-width:90px">${(()=>{const wd=c.weeklyDay!=null?(Array.isArray(c.weeklyDay)?c.weeklyDay:[c.weeklyDay]):[];if(!wd.length)return'<span class="text-m text-sm">—</span>';const names={0:'א׳',1:'ב׳',2:'ג׳',3:'ד׳',4:'ה׳'};return'<div style="display:flex;gap:4px;flex-wrap:wrap">'+wd.map(d=>'<span style="background:var(--primary-light,#ede9fe);color:var(--primary);border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600">'+names[d]+'</span>').join('')+'</div>';})()}</td>
      <td><div class="actions">
        <button class="btn btn-s btn-sm" onclick="openClientModal('${c.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.41 1.41 0 0 1 2 2L3.5 10.5l-3 .5.5-3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> ערוך</button>
        <button class="btn btn-d btn-sm" onclick="deleteClient('${c.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="1,3 11,3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4 3V2h4v1M2 3l.7 7.3A1 1 0 0 0 3.7 11h4.6a1 1 0 0 0 1-.7L10 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');

  return `
  <div class="page-hd flex items-c just-b">
    <div><div class="page-title">לקוחות</div><div class="page-sub">${activeCount} פעילים מתוך ${state.clients.length} | ${retC} ריטיינר | ${projC} פרויקט${intC?` | ${intC} פנימי`:''} | ${totalH} שעות ב${ml}</div></div>
    <div class="flex gap2">
      <button class="btn btn-s btn-sm" onclick="setClientShowInactive(${!_clientShowInactive});renderPage()">${_clientShowInactive?'הסתר לא פעילים':'הצג לא פעילים'}</button>
      <button class="btn btn-p" onclick="openClientModal()">+ הוסף לקוח</button>
    </div>
  </div>
  <div class="card">
    <div class="card-hd"><div class="card-title">רשימת לקוחות</div><span class="text-sm text-m">☑ = פעיל במטריצה | עריכת שעות ישירה לחודש: ${ml}</span></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>☑ שם לקוח</th><th>סוג</th><th>שעות ${ml}</th><th>🏦 בנק שעות</th><th>מוקצות</th><th>ניצולת</th><th>ימי ויקלי</th><th>פעולות</th></tr></thead>
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
  if(!confirm('למחוק לקוח זה? כל ההקצאות שלו ימחקו.'))return;
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
      <div class="mcell-lbl">${mo.short}${isProj?'<br><span style="font-size:8px;color:#6366f1">מתוכנן</span>':''}</div>
      <input type="number" class="mcell-inp" min="0" value="${c?getClientHours(c,mo.key):0}" data-month="${mo.key}">
      <div class="billed-row" style="${isProj?'':'display:none'}">
        <input type="number" class="mcell-billed" min="0" value="${c?.billedHours?.[mo.key]||''}" data-billed="${mo.key}" placeholder="חויב">
      </div>
    </div>`).join('');
  const _existWd=c?.weeklyDay!=null?(Array.isArray(c.weeklyDay)?c.weeklyDay:[c.weeklyDay]):[];
  const _wdChecks='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">'+[[0,'ראשון'],[1,'שני'],[2,'שלישי'],[3,'רביעי'],[4,'חמישי']].map(function(p){var v=p[0],lbl=p[1];return'<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="checkbox" id="c-wd-'+v+'" value="'+v+'" '+(_existWd.includes(v)?'checked':'')+'><span>'+lbl+'</span></label>';}).join('')+'</div>';
  document.getElementById('modal-root').innerHTML=`
  <div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal" style="max-width:580px">
      <div class="modal-hd">
        <div class="modal-t">${c?'עריכת לקוח':'הוספת לקוח'}</div>
        <button class="btn btn-s" style="padding:5px 9px" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-bd">
        <div class="fg"><label class="fl">שם לקוח</label>
          <input type="text" class="fi" id="c-name" value="${c?.name||''}" placeholder="שם הלקוח"></div>
        <div class="fg"><label class="fl">סוג לקוח</label>
          <select class="fs" id="c-type" onchange="toggleClientTypeFields(this.value)">
            <option value="retainer" ${c?.type==='retainer'||!c?'selected':''}>ריטיינר</option>
            <option value="project" ${c?.type==='project'?'selected':''}>פרויקט</option>
            <option value="internal" ${c?.type==='internal'?'selected':''}>פנימי</option>
          </select></div>
        <div id="bank-section" ${isProj?'':'style="display:none"'}>
          <div class="fg">
            <label class="fl">🏦 בנק שעות (תקציב פרויקט)</label>
            <input type="number" class="fi" id="c-bank" value="${c?.hoursBank||''}" min="0" placeholder="סה״כ שעות בפרויקט">
            ${bankRemain!==null?`<div class="fhint" style="color:${bankRemain<20?'var(--danger)':'var(--success)'}">נותר: ${bankRemain}h — חויב ${totalBilled}h מתוך ${c.hoursBank}h</div>`:'<div class="fhint">הגדר תקציב כולל; שעות עתידיות יקוזזו אוטומטית לפי חיוב בפועל</div>'}
          </div>
        </div>
        <div id="hours-section" ${c?.type==='internal'?'style="display:none"':''}>
          <div class="fg">
            <label class="fl">שעות לפי חודש
              <span id="billed-lbl" class="text-sm text-m" ${isProj?'':'style="display:none"'}> | שורה צהובה = חויב בפועל</span>
            </label>
            <div class="apply-bar">
              <span style="font-size:13px;font-weight:500;color:var(--text);display:flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M7.5 1L2 7.5h5L4.5 12 11 5.5H6L7.5 1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> החל לכל החודשים:</span>
              <input type="number" id="apply-all-val" min="0" value="${firstVal}" placeholder="שעות">
              <button class="btn btn-p btn-sm" onclick="applyToAllMonths()">החל</button>
            </div>
            <div class="mgrid">${hf}</div>
          </div>
        </div>
        <div class="fg" id="weekly-day-section" ${c?.type==='internal'?'style="display:none"':''}>
          <label class="fl">ימי ויקלי <span class="text-m text-sm">(ימים קבועים לפגישה שבועית)</span></label>
          ${_wdChecks}
        </div>
        <div class="fg">
          <label class="fl">עובדים משויכים <span class="text-m text-sm">(עדיפות בפיזור אוטומטי)</span></label>
          <div class="pref-grid">
            ${state.employees.map(emp=>`
              <label class="pref-item">
                <input type="checkbox" data-cemp="${emp.id}" ${cid&&(emp.preferredClients||[]).includes(cid)?'checked':''}>
                <span style="flex:1">${emp.name}</span>
                ${emp.role?`<span style="font-size:10px;color:var(--muted)">${emp.role}</span>`:''}
              </label>`).join('')}
          </div>
          <div class="fhint">עובדים שיסומנו יקבלו עדיפות בהקצאת לקוח זה בפיזור אוטומטי.</div>
        </div>
      </div>
      <div class="modal-ft">
        <button class="btn btn-s" onclick="closeModal()">ביטול</button>
        <button class="btn btn-p" onclick="saveClient('${cid||''}')">שמור</button>
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
  if(!name){alert('יש להזין שם לקוח');return;}
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
