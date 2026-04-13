import { MONTHS } from '../constants.js';
import { state, saveState } from '../state.js';
import { api } from '../api.js';
import { getClientHours, getEmpHours } from '../working-days.js';
import { getTotalAllocated, getClientAllocated, getEmpAllocated, getEmpActiveClients } from '../aggregations.js';
import { mkLabel, clientTypeBadge, clientTypeLabel } from '../utils.js';
import { t } from '../i18n.js';
import { _showAll, _matrixView, _matrixFocusEmp, setMatrixFocusEmp, setMatrixView, renderPage } from '../router.js';

// ===================== MATRIX PAGE =====================
export function renderMatrix(){
  const m=state.currentMonth,ml=mkLabel(m);
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
          style="${hasAlloc?'background:#eef2ff':''}" ${canAdd?'':'disabled title="'+t('matrix.maxClients')+'"'}
          onchange="onMatrixChange(this,'${m}')" onfocus="this.select()" oninput="onMatrixInput(this,'${m}')">
      </td>`;
    }).join('');
    return `<tr style="${dimRow?'opacity:0.25;transition:opacity .15s':'transition:opacity .15s'}${isFocused?';background:#f0f4ff':''}">
      <td class="mx-td-emp" style="cursor:pointer${isFocused?';background:#e8eeff':''}" onclick="setMatrixFocusEmp(${isFocused?'null':`'${e.id}'`});renderPage()" title="${isFocused?t('matrix.unfocusTip'):t('matrix.focusTip')}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span>${isFocused?'<span style="color:var(--primary);margin-inline-end:3px">◉</span>':''}<span>${e.name}</span>${(e.preferredClients||[]).length>0?'<span style="font-size:9px;color:var(--primary);margin-inline-start:3px;flex-shrink:0">★</span>':''}</span>
          <span id="et-${e.id}" class="mx-emp-tot${isOver?' over':''}">${alloc}/${avail}h${isOver?' ⚠':''}</span>
        </div>
        <div class="emp-sub"><span id="ac-${e.id}-${m}">${ac}</span>/6 ${t('matrix.clients')}</div>
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
  <div id="matrix-page" class="page-hd flex items-c just-b">
    <div><div class="page-title" id="matrix-title">${t('matrix.title')}</div>
      <div class="page-sub" id="matrix-sub">${t('matrix.sub').replace('{month}',ml).replace('{empCount}',visEmps.length)}</div>
    </div>
    <span class="chip" id="matrix-client-count">${visClients.length} ${t('matrix.clients')}</span>
  </div>
  <div id="matrix-legend" class="flex gap2 mb4" style="flex-wrap:wrap;align-items:center">
    <div class="legend-item"><span class="legend-dot" style="background:#eef2ff;border:1px solid #6366f1"></span> ${t('matrix.legend.allocated')}</div>
    <div class="legend-item"><span class="legend-dot" style="background:#fff0f0;border:1px solid var(--danger)"></span> ${t('matrix.legend.over')}</div>
    <div class="legend-item"><span class="legend-dot" style="background:#f0fdf4;border:1px solid var(--success)"></span> ${t('matrix.legend.ok')}</div>
    <div style="flex:1"></div>
    <span class="text-sm text-m">${t('matrix.legend.hint')}</span>
  </div>

  <!-- פעולות -->
  ${(()=>{
    const prevMks=(state.activeMonths||[]).filter(x=>x<m);
    const copyBlock=prevMks.length?`
      <div style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${t('matrix.copyFrom')}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <select id="mx-copy-sel" class="fi" style="padding:4px 8px;font-size:12px;width:auto">
            ${prevMks.slice().reverse().map(x=>`<option value="${x}">${mkLabel(x)}</option>`).join('')}
          </select>
          <button class="btn btn-s btn-sm" onclick="if(confirm(${JSON.stringify(t('matrix.copyConfirm').replace('{month}',mkLabel(m)))}))copyAllocations(document.getElementById('mx-copy-sel').value,'${m}')">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="3" width="7" height="8" rx="1.2" stroke="currentColor" stroke-width="1.2"/><path d="M4 3V2a1 1 0 011-1h5a1 1 0 011 1v7a1 1 0 01-1 1H9" stroke="currentColor" stroke-width="1.2"/></svg>
            ${t('btn.copy')}
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
    const kpiBar=`<div id="matrix-kpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      ${kpiCard(t('kpi.clientHours'),totalCont+'h',t('kpi.contractedThisMonth'),clientCol)}
      ${kpiCard(t('kpi.empCapacity'),totalCap+'h',visEmps.length+' '+t('kpi.activeEmployees'),'var(--primary)')}
      ${kpiCard(t('kpi.utilization'),utilPct+'%',totalAlloc+'h '+t('kpi.allocated'),utilCol)}
      ${kpiCard(t('kpi.capacityGap'),(gap>=0?'+':'')+gap+'h',gap>=0?t('kpi.surplus'):t('kpi.shortage'),gapCol)}
    </div>`;
    return kpiBar+`<div id="matrix-toolbar" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:16px">
      <span style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap">${t('matrix.actions')}</span>
      <div style="width:1px;background:var(--border);align-self:stretch;min-height:32px"></div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${t('matrix.monthMgmt')}</span>
        <div style="display:flex;gap:6px">
          <button class="btn btn-success btn-sm" id="btn-auto-distribute" onclick="autoDistribute('${m}')"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2M2.8 2.8l1.4 1.4M8.8 8.8l1.4 1.4M2.8 10.2l1.4-1.4M8.8 4.2l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="6.5" cy="6.5" r="2" stroke="currentColor" stroke-width="1.3"/></svg> ${t('matrix.autoDistribute')}</button>
          <button class="btn btn-sm" style="background:var(--surface-2);border:1px solid var(--border);color:var(--danger);font-size:12px;display:flex;align-items:center;gap:5px" onclick="if(confirm(${JSON.stringify(t('matrix.clearConfirm').replace('{month}',mkLabel(m)))}))resetMonth('${m}')">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M5 5v4M7 5v4M3 3l.5 7h5l.5-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${t('matrix.clearMatrix')}
          </button>
        </div>
      </div>
      <div style="width:1px;background:var(--border);align-self:stretch;min-height:32px"></div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${t('matrix.view')}</span>
        <button class="btn btn-s btn-sm" onclick="setMatrixView('${_matrixView==='table'?'cards':'table'}');renderPage()">${_matrixView!=='table'?'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="0.5" y="0.5" width="12" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="0.5" y="5" width="12" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="0.5" y="9.5" width="12" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/></svg> '+t('emp.table'):'<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="0.5" y="0.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="7" y="0.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="0.5" y="7" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="7" y="7" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg> '+t('emp.cards')}</button>
      </div>
    </div>`;
  })()}
  ${_matrixView!=='table'?`<div style="display:flex;gap:6px;margin-bottom:14px">
    <button class="btn btn-sm" style="min-width:110px;${_matrixView==='cards'?'background:var(--primary);color:#fff':'background:var(--surface);color:var(--text);border:1px solid var(--border)'}" onclick="setMatrixView('cards');renderPage()">${t('matrix.byEmp')}</button>
    <button class="btn btn-sm" style="min-width:110px;${_matrixView==='client-cards'?'background:var(--primary);color:#fff':'background:var(--surface);color:var(--text);border:1px solid var(--border)'}" onclick="setMatrixView('client-cards');renderPage()"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 12V6l5-3.5 5 3.5v6" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="4.5" y="7.5" width="2" height="4.5" rx="0.4" fill="currentColor"/></svg> ${t('matrix.byClient')}</button>
  </div>`:''}
  <div class="mx-layout" id="matrix-layout">
    <div class="mx-wrap" id="matrix-wrap">
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
            <div class="emp-card-stat"><span>${t('matrix.allocVsPlanned')}</span><span style="color:${statusCol};font-weight:600">${alloc}/${cont}h</span></div>
            <div class="progress" style="margin-bottom:8px"><div class="progress-bar" style="width:${pct}%;background:${barCol}"></div></div>
            <div class="emp-card-clients">${empRows||`<span style="color:var(--muted);font-size:12px">${t('matrix.noEmpsAllocated')}</span>`}</div>
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
              <strong>${e.name}${(e.preferredClients||[]).length>0?'<span style="font-size:9px;color:var(--primary);margin-inline-start:3px">★</span>':''}</strong>
              <span class="chip${isOver?' chip-danger':''}" style="${isOver?'background:#fee2e2;color:var(--danger)':''}">${alloc}/${avail}h${isOver?' ⚠':''}</span>
            </div>
            <div class="emp-card-stat"><span>${t('emp.allocatedLabel')}</span><span>${pct}%</span></div>
            <div class="progress" style="margin-bottom:8px"><div class="progress-bar" style="width:${pct}%;background:${barCol}"></div></div>
            <div class="emp-card-clients">${clientRows||`<span style="color:var(--muted);font-size:12px">${t('matrix.noAllocLabel')}</span>`}</div>
          </div>`;
        }).join('');
        return `<div class="emp-cards-grid" style="padding:4px 0">${cards}</div>`;
      })():`<table class="mx-tbl" id="matrix-tbl">
        <thead><tr>
          <th class="mx-th-emp">${t('weekly.employee')}</th>
          ${cHeaders}
        </tr></thead>
        <tbody id="matrix-tbody">
          ${empRows}
          <tr class="mx-c-tot" id="matrix-col-totals">
            <td class="mx-td-emp" style="font-size:12px;color:var(--muted)">${t('matrix.clientTotal')}</td>
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
    alert(t('matrix.maxClientsAlert').replace('{name}',state.employees.find(e=>e.id===eid)?.name));
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
  if(!state.matrix[fromMk]){alert(t('matrix.noData'));return;}
  state.matrix[toMk]=JSON.parse(JSON.stringify(state.matrix[fromMk]));
  api.put(`/api/matrix/${toMk}`,state.matrix[toMk]);
  renderPage();
}

export function resetMonth(mk){
  state.matrix[mk]={};
  api.put(`/api/matrix/${mk}`,{});
  renderPage();
}
