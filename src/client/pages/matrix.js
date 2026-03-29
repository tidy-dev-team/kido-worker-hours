import { MONTHS } from '../constants.js';
import { state, saveState } from '../state.js';
import { api } from '../api.js';
import { getClientHours, getEmpHours } from '../working-days.js';
import { getTotalAllocated, getClientAllocated, getEmpAllocated, getEmpActiveClients } from '../aggregations.js';
import { mkLabel, clientTypeBadge, clientTypeLabel } from '../utils.js';
import { _showAll, _matrixView, _matrixFocusEmp, setMatrixFocusEmp, setMatrixView, renderPage } from '../router.js';

// ===================== MATRIX PAGE =====================
export function renderMatrix(){
  const m=state.currentMonth,ml=MONTHS.find(x=>x.key===m)?.label||m;
  if(!state.matrix[m])state.matrix[m]={};

  // Only visible employees in matrix
  const visEmps=state.employees.filter(e=>e.visible!==false);
  const visClients=state.clients.filter(c=>
    c.active!==false&&(
      _showAll||
      getClientHours(c,m)>0||
      Object.values(state.matrix[m]).some(ed=>(parseFloat(ed[c.id])||0)>0)
    ));

  const focusedCids=_matrixFocusEmp
    ?new Set(Object.entries(state.matrix[m][_matrixFocusEmp]||{}).filter(([,h])=>(parseFloat(h)||0)>0).map(([cid])=>cid))
    :null;
  const visCols=focusedCids?visClients.filter(c=>focusedCids.has(c.id)):visClients;

  const cHeaders=visCols.map(c=>{
    const cont=getClientHours(c,m),alloc=getClientAllocated(c.id,m),diff=alloc-cont;
    const col=cont===0?'var(--muted)':diff>0?'var(--danger)':diff<0?'var(--warning)':'var(--success)';
    return `<th class="mx-th-c">
      <div title="${c.name}" style="max-width:90px;overflow:hidden;text-overflow:ellipsis">${c.name.length>11?c.name.slice(0,11)+'…':c.name}</div>
      <div id="ch-${c.id}" style="font-size:10px;color:${col};margin-top:3px">${alloc}/${cont}h</div>
      <div style="font-size:9px;color:var(--muted)">${clientTypeLabel(c.type)}</div>
    </th>`;
  }).join('');

  const empRows=visEmps.map(e=>{
    const ed=(state.matrix[m][e.id]||{});
    const avail=getEmpHours(e,m),alloc=getEmpAllocated(e.id,m);
    const ac=getEmpActiveClients(e.id,m),isOver=alloc>avail;
    const isFocused=_matrixFocusEmp===e.id;
    const dimRow=_matrixFocusEmp&&!isFocused;
    const cells=visCols.map(c=>{
      const val=parseFloat(ed[c.id])||0,hasAlloc=val>0,canAdd=ac<6||hasAlloc;
      return `<td style="padding:0">
        <input type="number" class="mx-inp" min="0" value="${val||''}" placeholder="—"
          data-eid="${e.id}" data-cid="${c.id}"
          style="${hasAlloc?'background:#eef2ff':''}" ${canAdd?'':'disabled title="עד 6 לקוחות"'}
          onchange="onMatrixChange(this,'${m}')" onfocus="this.select()" oninput="onMatrixInput(this,'${m}')">
      </td>`;
    }).join('');
    return `<tr style="${dimRow?'opacity:0.25;transition:opacity .15s':'transition:opacity .15s'}${isFocused?';background:#f0f4ff':''}">
      <td class="mx-td-emp" style="cursor:pointer${isFocused?';background:#e8eeff':''}" onclick="setMatrixFocusEmp(${isFocused?'null':`'${e.id}'`});renderPage()" title="${isFocused?'לחץ לביטול הסינון':'לחץ להדגשת עובד'}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span>${isFocused?'<span style="color:var(--primary);margin-left:3px">◉</span>':''}<span>${e.name}</span>${(e.preferredClients||[]).length>0?'<span style="font-size:9px;color:var(--primary);margin-right:3px">★</span>':''}</span>
          <span id="et-${e.id}" class="mx-emp-tot${isOver?' over':''}">${alloc}/${avail}h${isOver?' ⚠':''}</span>
        </div>
        <div class="emp-sub"><span id="ac-${e.id}-${m}">${ac}</span>/6 לקוחות</div>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  const cTots=visCols.map(c=>{
    const cont=getClientHours(c,m),alloc=getClientAllocated(c.id,m);
    const col=cont===0?'var(--muted)':alloc>cont?'var(--danger)':alloc===cont?'var(--success)':'var(--warning)';
    return `<td id="ct-${c.id}" style="background:#f8fafc;padding:8px 10px;text-align:center;font-size:12px;font-weight:700;color:${col}">${alloc}/${cont}</td>`;
  }).join('');


  return `
  <div class="page-hd flex items-c just-b">
    <div><div class="page-title">מטריצת הקצאות</div>
      <div class="page-sub">${ml} | ${visEmps.length} עובדים מוצגים | עד 6 לקוחות לעובד</div>
    </div>
    <span class="chip">${visClients.length} לקוחות</span>
  </div>
  <div class="flex gap2 mb4" style="flex-wrap:wrap;align-items:center">
    <div class="legend-item"><span class="legend-dot" style="background:#eef2ff;border:1px solid #6366f1"></span> מוקצה</div>
    <div class="legend-item"><span class="legend-dot" style="background:#fff0f0;border:1px solid var(--danger)"></span> חריגה</div>
    <div class="legend-item"><span class="legend-dot" style="background:#f0fdf4;border:1px solid var(--success)"></span> תוך גבול</div>
    <div style="flex:1"></div>
    <span class="text-sm text-m">שורה: מוקצה / זמין | עמודה: מוקצה / מוזמן</span>
  </div>

  <!-- פעולות -->
  ${(()=>{
    const prevMks=(state.activeMonths||[]).filter(x=>x<m);
    const copyBlock=prevMks.length?`
      <div style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">העתק מחודש</span>
        <div style="display:flex;align-items:center;gap:8px">
          <select id="mx-copy-sel" class="fi" style="padding:4px 8px;font-size:12px;width:auto">
            ${prevMks.slice().reverse().map(x=>`<option value="${x}">${mkLabel(x)}</option>`).join('')}
          </select>
          <button class="btn btn-s btn-sm" onclick="if(confirm('פעולה זו תחליף את כל ההקצאות הקיימות בחודש ${mkLabel(m)} — להמשיך?'))copyAllocations(document.getElementById('mx-copy-sel').value,'${m}')">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="3" width="7" height="8" rx="1.2" stroke="currentColor" stroke-width="1.2"/><path d="M4 3V2a1 1 0 011-1h5a1 1 0 011 1v7a1 1 0 01-1 1H9" stroke="currentColor" stroke-width="1.2"/></svg>
            העתק
          </button>
        </div>
      </div>
      <div style="width:1px;background:var(--border);align-self:stretch"></div>`:'';
    const totalCont=state.clients.filter(c=>c.active!==false&&c.type!=='internal').reduce((s,c)=>s+(getClientHours(c,m)||0),0);
    const totalAlloc=getTotalAllocated(m);
    const totalCap=visEmps.reduce((s,e)=>s+Math.round(getEmpHours(e,m)),0);
    const utilPct=totalCap>0?Math.round(totalAlloc/totalCap*100):0;
    const gap=totalCap-totalCont;
    const utilCol=utilPct>=90?'var(--danger)':utilPct>=70?'var(--success)':'var(--warning)';
    const gapCol=gap<0?'var(--danger)':gap===0?'var(--success)':'var(--muted)';
    const clientCol=totalAlloc>=totalCont&&totalCont>0?'var(--success)':totalCont===0?'var(--muted)':'var(--warning)';
    const kpiCard=(label,val,sub,col)=>`<div style="flex:1;min-width:130px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px 16px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${label}</div>
      <div style="font-size:22px;font-weight:700;color:${col};font-family:var(--font-mono,monospace)">${val}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${sub}</div>
    </div>`;
    const kpiBar=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      ${kpiCard('שעות לקוחות',totalCont+'h','מוזמן החודש',clientCol)}
      ${kpiCard('קיבולת עובדים',totalCap+'h',visEmps.length+' עובדים פעילים','var(--primary)')}
      ${kpiCard('ניצולת',utilPct+'%',totalAlloc+'h מוקצה',utilCol)}
      ${kpiCard('פער קיבולת',(gap>=0?'+':'')+gap+'h',gap>=0?'קיבולת עודפת':'חסר קיבולת',gapCol)}
    </div>`;
    return kpiBar+`<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:16px">
      <span style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap">פעולות</span>
      <div style="width:1px;background:var(--border);align-self:stretch;min-height:32px"></div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">ניהול חודש</span>
        <div style="display:flex;gap:6px">
          <button class="btn btn-success btn-sm" onclick="autoDistribute('${m}')"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2M2.8 2.8l1.4 1.4M8.8 8.8l1.4 1.4M2.8 10.2l1.4-1.4M8.8 4.2l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="6.5" cy="6.5" r="2" stroke="currentColor" stroke-width="1.3"/></svg> פיזור אוטומטי</button>
          <button class="btn btn-sm" style="background:var(--surface-2);border:1px solid var(--border);color:var(--danger);font-size:12px;display:flex;align-items:center;gap:5px" onclick="if(confirm('מחיקת כל ההקצאות של ${mkLabel(m)} — פעולה זו אינה הפיכה. להמשיך?'))resetMonth('${m}')">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M5 5v4M7 5v4M3 3l.5 7h5l.5-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            נקה מטריצה
          </button>
        </div>
      </div>
      <div style="width:1px;background:var(--border);align-self:stretch;min-height:32px"></div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">תצוגה</span>
        <button class="btn btn-s btn-sm" onclick="setMatrixView('${_matrixView==='table'?'cards':'table'}');renderPage()">${_matrixView!=='table'?'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="0.5" y="0.5" width="12" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="0.5" y="5" width="12" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="0.5" y="9.5" width="12" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/></svg> טבלה':'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="0.5" y="0.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="7" y="0.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="0.5" y="7" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="7" y="7" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg> כרטיסיות'}</button>
      </div>
    </div>`;
  })()}
  ${_matrixView!=='table'?`<div style="display:flex;gap:6px;margin-bottom:14px">
    <button class="btn btn-sm" style="min-width:110px;${_matrixView==='cards'?'background:var(--primary);color:#fff':'background:var(--surface);color:var(--text);border:1px solid var(--border)'}" onclick="setMatrixView('cards');renderPage()">👤 לפי עובד</button>
    <button class="btn btn-sm" style="min-width:110px;${_matrixView==='client-cards'?'background:var(--primary);color:#fff':'background:var(--surface);color:var(--text);border:1px solid var(--border)'}" onclick="setMatrixView('client-cards');renderPage()"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 12V6l5-3.5 5 3.5v6" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="4.5" y="7.5" width="2" height="4.5" rx="0.4" fill="currentColor"/></svg> לפי לקוח</button>
  </div>`:''}
  <div class="mx-layout">
    <div class="mx-wrap">
      ${_matrixView==='client-cards'?(()=>{
        const cards=visClients.map(c=>{
          const cont=getClientHours(c,m),alloc=getClientAllocated(c.id,m);
          const diff=alloc-cont;
          const pct=cont>0?Math.min(100,Math.round(alloc/cont*100)):0;
          const barCol=diff>0?'var(--danger)':diff===0&&cont>0?'var(--success)':'var(--warning)';
          const statusCol=cont===0?'var(--muted)':diff>0?'var(--danger)':diff<0?'var(--warning)':'var(--success)';
          const empRows=visEmps.map(e=>{
            const h=parseFloat((state.matrix[m][e.id]||{})[c.id])||0;
            if(!h)return '';
            const isPref=(e.preferredClients||[]).includes(c.id);
            return `<div class="emp-card-client-row">
              <span>${isPref?'★ ':''}<b>${e.name}</b></span>
              <span>${h}h</span>
            </div>`;
          }).filter(Boolean).join('');
          return `<div class="emp-card">
            <div class="emp-card-hd">
              <strong>${c.name}</strong>
              ${clientTypeBadge(c.type)}
            </div>
            <div class="emp-card-stat"><span>מוקצה / מוזמן</span><span style="color:${statusCol};font-weight:600">${alloc}/${cont}h</span></div>
            <div class="progress" style="margin-bottom:8px"><div class="progress-bar" style="width:${pct}%;background:${barCol}"></div></div>
            <div class="emp-card-clients">${empRows||'<span style="color:var(--muted);font-size:12px">אין עובדים מוקצים</span>'}</div>
          </div>`;
        }).join('');
        return `<div class="emp-cards-grid" style="padding:4px 0">${cards}</div>`;
      })():_matrixView==='cards'?(()=>{
        const cards=visEmps.map(e=>{
          const ed=(state.matrix[m][e.id]||{});
          const avail=getEmpHours(e,m),alloc=getEmpAllocated(e.id,m);
          const isOver=alloc>avail;
          const pct=avail>0?Math.min(100,Math.round(alloc/avail*100)):0;
          const barCol=isOver?'var(--danger)':pct>=80?'var(--success)':pct>=50?'var(--warning)':'var(--danger)';
          const clientEntries=Object.entries(ed).filter(([,h])=>(parseFloat(h)||0)>0);
          const clientRows=clientEntries.map(([cid,h])=>{
            const cl=state.clients.find(c=>c.id===cid);
            const isPref=(e.preferredClients||[]).includes(cid);
            return `<div class="emp-card-client-row">
              <span>${isPref?'★ ':''}<b>${cl?cl.name:cid}</b></span>
              <span>${h}h</span>
            </div>`;
          }).join('');
          return `<div class="emp-card">
            <div class="emp-card-hd">
              <strong>${e.name}${(e.preferredClients||[]).length>0?'<span style="font-size:9px;color:var(--primary);margin-right:3px">★</span>':''}</strong>
              <span class="chip${isOver?' chip-danger':''}" style="${isOver?'background:#fee2e2;color:var(--danger)':''}">${alloc}/${avail}h${isOver?' ⚠':''}</span>
            </div>
            <div class="emp-card-stat"><span>מוקצה</span><span>${pct}%</span></div>
            <div class="progress" style="margin-bottom:8px"><div class="progress-bar" style="width:${pct}%;background:${barCol}"></div></div>
            <div class="emp-card-clients">${clientRows||'<span style="color:var(--muted);font-size:12px">אין הקצאות</span>'}</div>
          </div>`;
        }).join('');
        return `<div class="emp-cards-grid" style="padding:4px 0">${cards}</div>`;
      })():`<table class="mx-tbl">
        <thead><tr>
          <th class="mx-th-emp">עובד</th>
          ${cHeaders}
        </tr></thead>
        <tbody>
          ${empRows}
          <tr class="mx-c-tot">
            <td class="mx-td-emp" style="font-size:12px;color:var(--muted)">סה״כ לקוח</td>
            ${cTots}
          </tr>
        </tbody>
      </table>`}
    </div>
  </div>`;
}

// ===================== MATRIX INPUTS =====================
export function onMatrixInput(inp,mk){
  const eid=inp.dataset.eid,cid=inp.dataset.cid;
  const val=parseFloat(inp.value)||0;
  if(!state.matrix[mk])state.matrix[mk]={};
  if(!state.matrix[mk][eid])state.matrix[mk][eid]={};
  if(val===0)delete state.matrix[mk][eid][cid];
  else state.matrix[mk][eid][cid]=val;
  inp.style.background=val>0?'#eef2ff':'';
  // Update row total live
  const alloc=getEmpAllocated(eid,mk);
  const avail=getEmpHours(state.employees.find(e=>e.id===eid),mk);
  const et=document.getElementById('et-'+eid);
  if(et){
    const isOver=alloc>avail;
    et.className=`mx-emp-tot${isOver?' over':''}`;
    et.textContent=`${alloc}/${avail}h${isOver?' ⚠':''}`;
  }
  const acEl=document.getElementById(`ac-${eid}-${mk}`);
  if(acEl)acEl.textContent=getEmpActiveClients(eid,mk);
  // Update column total + header for this client live
  const c2=state.clients.find(x=>x.id===cid);
  if(c2){
    const cont2=getClientHours(c2,mk);
    const alloc2=getClientAllocated(cid,mk);
    const col2=cont2===0?'var(--muted)':alloc2>cont2?'var(--danger)':alloc2===cont2?'var(--success)':'var(--warning)';
    const ctEl=document.getElementById(`ct-${cid}`);
    if(ctEl){ctEl.style.color=col2;ctEl.textContent=`${alloc2}/${cont2}`;}
    const chEl=document.getElementById(`ch-${cid}`);
    if(chEl){chEl.style.color=col2;chEl.textContent=`${alloc2}/${cont2}h`;}
  }
}

export function onMatrixChange(inp,mk){
  const eid=inp.dataset.eid,cid=inp.dataset.cid,val=parseFloat(inp.value)||0;
  if(!state.matrix[mk])state.matrix[mk]={};
  if(!state.matrix[mk][eid])state.matrix[mk][eid]={};
  const ed=state.matrix[mk][eid];
  const ac=Object.keys(ed).filter(k=>k!==cid&&(parseFloat(ed[k])||0)>0).length;
  if(val>0&&ac>=6){
    alert('לעובד '+state.employees.find(e=>e.id===eid)?.name+' כבר יש 6 לקוחות פעילים!');
    inp.value='';delete ed[cid];inp.style.background='';return;
  }
  if(val===0)delete ed[cid];else ed[cid]=val;
  api.patch(`/api/matrix/${mk}/${eid}/${cid}`,{hours:val});
  // Update column footer
  document.querySelectorAll('.mx-c-tot td:not(.mx-td-emp)').forEach((td,i)=>{
    const vc=state.clients.filter(c=>c.active!==false&&(_showAll||getClientHours(c,mk)>0||Object.values(state.matrix[mk]||{}).some(ed=>(parseFloat(ed[c.id])||0)>0)));
    const c=vc[i];if(!c)return;
    const cont=getClientHours(c,mk),alloc=getClientAllocated(c.id,mk);
    td.style.color=cont===0?'var(--muted)':alloc>cont?'var(--danger)':alloc===cont?'var(--success)':'var(--warning)';
    td.textContent=`${alloc}/${cont}`;
  });
}

export function copyAllocations(fromMk,toMk){
  if(!state.matrix[fromMk]){alert('אין נתונים בחודש הנבחר');return;}
  state.matrix[toMk]=JSON.parse(JSON.stringify(state.matrix[fromMk]));
  api.put(`/api/matrix/${toMk}`,state.matrix[toMk]);
  renderPage();
}

export function resetMonth(mk){
  state.matrix[mk]={};
  api.put(`/api/matrix/${mk}`,{});
  renderPage();
}
