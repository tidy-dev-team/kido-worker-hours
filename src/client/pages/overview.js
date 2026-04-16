import { MONTHS } from '../constants.js';
import { state } from '../state.js';
import { getHolidays } from '../hebrew-calendar.js';
import { calcMonthWorkDays, getEmpHours, getClientHours, getRemainingBankBefore, getTotalBilled } from '../working-days.js';
import { getTotalAllocated, getClientAllocated, getEmpAllocated } from '../aggregations.js';
import { mkLabel, clientTypeBadge, clientTypeLabel } from '../utils.js';
import { _chartInstances } from '../router.js';
import { t, getLang } from '../i18n.js';

// ===================== OVERVIEW (merged dashboard + insights) =====================
export function renderOverview(){
  const mk=state.currentMonth;
  const [yr,mo]=mk.split('-').map(Number);
  const ml=mkLabel(mk);
  const activeEmps=state.employees.filter(e=>!e.hidden);
  const visEmps=state.employees.filter(e=>e.visible!==false).length;
  const visClients=state.clients.filter(c=>c.active!==false&&c.type!=='internal');

  // ── Totals ──
  const totalC=state.clients.filter(c=>c.active!==false&&c.type!=='internal').reduce((s,c)=>s+(getClientHours(c,mk)||0),0);
  const totalCap=activeEmps.reduce((s,e)=>s+Math.round(getEmpHours(e,mk)),0);
  const totalAlloc=getTotalAllocated(mk);
  const utilPct=totalCap>0?Math.round(totalAlloc/totalCap*100):0;
  const gap=totalCap-totalC;
  const capColor=utilPct>100?'var(--danger)':utilPct>=80?'var(--success)':utilPct>=50?'var(--warning)':'var(--muted)';

  // ── Work days & holidays ──
  const wd=calcMonthWorkDays(mk);
  const holidays=getHolidays(yr);
  const monthHols=Object.entries(holidays).filter(([d])=>d.startsWith(mk)).sort(([a],[b])=>a.localeCompare(b));
  const hoursLost=Math.round(wd.off*7+wd.half*3.5);

  // ── Employee utilization ──
  const empUtils=activeEmps.map(e=>{
    const cap=getEmpHours(e,mk),alloc=getEmpAllocated(e.id,mk);
    const pct=cap>0?Math.round(alloc/cap*100):0;
    const vac=(state.vacations?.[mk]?.[e.id])||0;
    return{e,cap,alloc,pct,vac};
  }).sort((a,b)=>b.pct-a.pct);

  // ── Client coverage ──
  const clientCov=visClients.map(c=>{
    const planned=getClientHours(c,mk),alloc=getClientAllocated(c.id,mk);
    const pct=planned>0?Math.round(alloc/planned*100):null;
    return{c,planned,alloc,pct};
  }).filter(x=>x.planned>0).sort((a,b)=>(a.pct??0)-(b.pct??0));

  // ── Vacations ──
  const vacData=activeEmps.map(e=>({e,days:(state.vacations?.[mk]?.[e.id])||0})).filter(x=>x.days>0).sort((a,b)=>b.days-a.days);
  const totalVacDays=vacData.reduce((s,x)=>s+x.days,0);

  // ── Project bank ──
  const projAlerts=state.clients.filter(c=>c.active!==false&&c.type==='project'&&c.hoursBank).map(c=>{
    const totalBilled=getTotalBilled(c);
    const pct=c.hoursBank>0?Math.round(totalBilled/c.hoursBank*100):0;
    return{c,remaining:getRemainingBankBefore(c,mk),pct,totalBilled};
  }).sort((a,b)=>a.pct-b.pct);

  // ── Alerts ──
  const alerts=[];
  const over=empUtils.filter(x=>x.pct>100);
  const under=empUtils.filter(x=>x.pct<50&&x.cap>0);
  const noAlloc=empUtils.filter(x=>x.alloc===0&&x.cap>0);
  if(over.length)alerts.push({type:'danger',icon:'⚡',text:`${over.map(x=>x.e.name).join(', ')} — ${t('alert.overAllocated')} (${over.map(x=>x.pct+'%').join(', ')})`});
  if(noAlloc.length)alerts.push({type:'warn',icon:'○',text:`${noAlloc.map(x=>x.e.name).join(', ')} — ${t('alert.noAllocations')}`});
  if(under.length&&!noAlloc.find(x=>under.find(y=>y.e.id===x.e.id)))alerts.push({type:'info',icon:'↓',text:`${under.map(x=>x.e.name).join(', ')} — ${t('alert.lowUtil')}`});
  const uncoveredClients=clientCov.filter(x=>x.alloc===0);
  if(uncoveredClients.length)alerts.push({type:'warn',icon:'!',text:`${t('alert.uncoveredClients')} ${uncoveredClients.map(x=>x.c.name).join(', ')}`});
  const lowBank=projAlerts.filter(x=>x.remaining<20&&x.remaining>0);
  if(lowBank.length)alerts.push({type:'danger',icon:'⚠',text:`${t('alert.lowBank')} ${lowBank.map(x=>`${x.c.name} (${t('alert.remaining')} ${x.remaining}h)`).join(', ')}`});
  if(utilPct>=90&&utilPct<=100)alerts.push({type:'ok',icon:'✓',text:t('alert.excellentUtil').replace('{pct}',utilPct)});
  if(hoursLost>0)alerts.push({type:'info',icon:'📅',text:`${monthHols.filter(([,v])=>v.type==='holiday').length} ${t('alert.holidaysThisMonth').replace('{hours}',hoursLost)}`});
  if(totalVacDays>0)alerts.push({type:'info',icon:'🏖',text:t('alert.teamVacation').replace('{days}',totalVacDays)});
  if(!alerts.length)alerts.push({type:'ok',icon:'✓',text:t('alert.allGood')});

  // ── Helpers ──
  function utilBar(pct){
    const w=Math.min(pct,100);
    const col=pct>100?'var(--danger)':pct>=80?'var(--success)':pct>=50?'var(--warning)':'var(--muted-2)';
    return `<div class="ins-bar-wrap"><div class="ins-bar" style="width:${w}%;background:${col}"></div></div>`;
  }
  function utilBadge(pct){
    const col=pct>100?'b-danger':pct>=80?'b-ok':pct>=50?'b-warn':'b-none';
    return `<span class="badge ${col}">${pct}%</span>`;
  }

  // ── Client status table ──
  const clientRows=state.clients.map(c=>{
    const cont=getClientHours(c,mk),alloc=getClientAllocated(c.id,mk),diff=alloc-cont;
    let status=`<span class="badge b-none">${t('clientStatus.none')}</span>`;
    if(cont>0&&alloc>=cont)status=`<span class="badge b-ok">${t('clientStatus.covered')}</span>`;
    else if(cont>0&&alloc>0)status=`<span class="badge b-warn">${t('clientStatus.partial')}</span>`;
    else if(cont>0)status=`<span class="badge b-danger">${t('clientStatus.empty')}</span>`;
    const diffHtml=diff===0?'—':`<span style="color:${diff>0?'var(--danger)':'var(--warning)'}">${diff>0?'+':''}${diff}</span>`;
    return `<tr class="overview-client-row" data-client-id="${c.id}"><td><strong>${c.name}</strong></td><td>${clientTypeBadge(c.type)}</td><td>${cont}</td><td>${alloc}</td><td>${diffHtml}</td><td>${status}</td></tr>`;
  }).join('');

  // ── Trend comparison ──
  const prevIdx=(state.activeMonths||[]).indexOf(mk)-1;
  const prevMk=prevIdx>=0?(state.activeMonths||[])[prevIdx]:null;
  let trendSection='';
  if(prevMk){
    const prevAlloc=getTotalAllocated(prevMk);
    const prevCap=activeEmps.reduce((s,e)=>s+getEmpHours(e,prevMk),0);
    const prevUtil=prevCap>0?Math.round(prevAlloc/prevCap*100):0;
    const diff=utilPct-prevUtil;
    const diffStr=diff>0?`+${diff}%`:diff<0?`${diff}%`:t('ins.noChange');
    const diffCol=diff>0?'var(--success)':diff<0?'var(--danger)':'var(--muted)';
    trendSection=`<div class="ins-section" id="ins-trend">
      <div class="ins-section-hd">
        <div class="ins-section-icon" style="background:#eff6ff"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 10.5L5 6l3 2.5L12 2.5" stroke="#2563eb" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></div>
        <div><div class="ins-section-title">${t('ins.trendTitle')}</div><div class="ins-section-sub">${mkLabel(prevMk)}</div></div>
      </div>
      <div class="ins-section-bd">
        <div class="ins-stat-row"><span style="color:var(--muted)">${t('ins.currentUtil')}</span><span class="ins-stat-val">${utilPct}%</span></div>
        <div class="ins-stat-row"><span style="color:var(--muted)">${t('ins.prevUtil')}</span><span class="ins-stat-val">${prevUtil}%</span></div>
        <div class="ins-stat-row"><span style="color:var(--muted)">${t('ins.change')}</span><span class="ins-stat-val" style="color:${diffCol}">${diffStr}</span></div>
        <div class="ins-stat-row"><span style="color:var(--muted)">${t('ins.prevAlloc')}</span><span class="ins-stat-val">${prevAlloc}h</span></div>
      </div>
    </div>`;
  }

  return `
  <div id="overview-page" class="page-hd flex items-c just-b">
    <div><div class="page-title" id="overview-title">${t('overview.title')}</div><div class="page-sub" id="overview-sub">${t('overview.sub').replace('{month}',ml).replace('{empCount}',visEmps).replace('{clientCount}',clientCov.length)}</div></div>
  </div>

  <!-- Alerts bar -->
  <div id="overview-alerts" style="margin-bottom:20px">
    ${alerts.map((a,i)=>`<div class="ins-alert ${a.type}" id="overview-alert-${i}" style="margin-bottom:6px"><span class="ins-alert-icon">${a.icon}</span><span>${a.text}</span></div>`).join('')}
  </div>

  <!-- KPIs: 6 cards -->
  <div id="overview-kpis" class="kpi-grid" style="grid-template-columns:repeat(6,1fr);margin-bottom:24px">
    <div class="kpi p" id="kpi-client-hours"><div class="kpi-accent"></div><div class="kpi-lbl">${t('kpi.clientHours')}</div><div class="kpi-val">${totalC.toLocaleString()}</div><div class="kpi-sub">${t('kpi.clientHoursSub')}</div><div class="kpi-ico"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M3 21V7l7-4 7 4v14" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="13" width="3" height="8" rx="0.5" fill="currentColor"/></svg></div></div>
    <div class="kpi s" id="kpi-emp-capacity"><div class="kpi-accent"></div><div class="kpi-lbl">${t('kpi.empCapacity')}</div><div class="kpi-val">${totalCap.toLocaleString()}</div><div class="kpi-sub">${t('kpi.empCapacitySub')}</div><div class="kpi-ico"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div></div>
    <div class="kpi ${utilPct>100?'d':utilPct>80?'w':'s'}" id="kpi-utilization"><div class="kpi-accent"></div><div class="kpi-lbl">${t('kpi.utilization')}</div><div class="kpi-val" style="color:${capColor}">${utilPct}%</div><div class="kpi-sub">${totalAlloc}h ${t('kpi.allocated')}</div><div class="kpi-ico"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><polyline points="3,17 8,11 13,14 21,6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>
    <div class="kpi ${gap<0?'d':'w'}" id="kpi-capacity-gap"><div class="kpi-accent"></div><div class="kpi-lbl">${t('kpi.capacityGap')}</div><div class="kpi-val">${gap>0?'+':''}${gap}</div><div class="kpi-sub">${gap>=0?t('kpi.surplus'):t('kpi.shortage')}</div><div class="kpi-ico"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M13 3L21 12 13 21M3 12h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>
    <div class="kpi w" id="kpi-work-days"><div class="kpi-accent"></div><div class="kpi-lbl">${t('kpi.workDays')}</div><div class="kpi-val">${wd.effective}</div><div class="kpi-sub">${wd.off} ${t('kpi.holidays')} · ${wd.half} ${t('kpi.holidayEves')}</div><div class="kpi-ico"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M8 2v3M16 2v3M3 9h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div></div>
    <div class="kpi ${totalVacDays>0?'w':'s'}" id="kpi-vacation-days"><div class="kpi-accent"></div><div class="kpi-lbl">${t('kpi.vacationDays')}</div><div class="kpi-val">${totalVacDays}</div><div class="kpi-sub">${vacData.length} ${t('kpi.employees')}</div><div class="kpi-ico"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M17 8C17 11.3137 14.3137 14 11 14C7.68629 14 5 11.3137 5 8C5 4.68629 7.68629 2 11 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M19 2L19 8L13 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 22C3 19 6 17 11 17C16 17 19 19 19 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div></div>
  </div>

  <!-- 3 charts -->
  <div id="overview-charts" class="chart-grid" style="grid-template-columns:2fr 1fr 2fr;margin-bottom:24px">
    <div class="chart-card" id="chart-card-alloc"><div class="chart-title">${t('chart.allocVsPlanned')}</div><canvas id="ch-alloc" height="220"></canvas></div>
    <div class="chart-card" id="chart-card-type" style="display:flex;flex-direction:column;align-items:center">
      <div class="chart-title" style="align-self:flex-start">${t('chart.byType')}</div>
      <canvas id="ch-type" width="200" height="200" style="max-width:200px;margin:auto"></canvas>
    </div>
    <div class="chart-card" id="chart-card-trend"><div class="chart-title">${t('chart.trend')}</div><canvas id="ch-trend" height="220"></canvas></div>
  </div>

  <!-- Insight sections grid -->
  <div id="overview-insights" class="ins-grid" style="margin-bottom:24px">
    <!-- Employee utilization -->
    <div class="ins-section" id="ins-emp-util">
      <div class="ins-section-hd">
        <div class="ins-section-icon" style="background:#eff6ff"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="3.5" r="2.5" stroke="#2563eb" stroke-width="1.3"/><path d="M1 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="#2563eb" stroke-width="1.3" stroke-linecap="round"/><path d="M10.5 5.5v4M8.5 7.5h4" stroke="#2563eb" stroke-width="1.3" stroke-linecap="round"/></svg></div>
        <div><div class="ins-section-title">${t('ins.empUtil')}</div><div class="ins-section-sub">${t('ins.empUtilSub')}</div></div>
      </div>
      <div class="ins-section-bd" id="ins-emp-util-list">
        ${empUtils.map(({e,cap,alloc,pct,vac})=>`
          <div class="ins-row ins-emp-row" data-emp-id="${e.id}">
            <div class="ins-row-name">${e.name}${vac>0?`<span style="font-size:10px;color:var(--muted);margin-inline-end:4px">(${vac}d)</span>`:''}</div>
            ${utilBar(pct)}
            <div class="ins-row-val" style="min-width:60px;text-align:start">${utilBadge(pct)}</div>
            <div style="font-size:11px;color:var(--muted);min-width:60px;text-align:start">${alloc}/${cap}h</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Client coverage -->
    <div class="ins-section" id="ins-client-cov">
      <div class="ins-section-hd">
        <div class="ins-section-icon" style="background:#f0fdf4"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 12V5.5l5-3.5 5 3.5V12" stroke="#16a34a" stroke-width="1.3" fill="none" stroke-linejoin="round"/><rect x="5" y="7.5" width="2.5" height="4.5" rx="0.5" fill="#16a34a"/></svg></div>
        <div><div class="ins-section-title">${t('ins.clientCov')}</div><div class="ins-section-sub">${t('ins.clientCovSub')}</div></div>
      </div>
      <div class="ins-section-bd" id="ins-client-cov-list">
        ${clientCov.length===0?`<div class="ins-empty-msg" style="font-size:13px;color:var(--muted);padding:8px 0">${t('ins.noClientsPlanned')}</div>`:''}
        ${clientCov.map(({c,planned,alloc,pct})=>`
          <div class="ins-row ins-client-row" data-client-id="${c.id}">
            <div class="ins-row-name">${c.name}</div>
            ${utilBar(pct??0)}
            <div class="ins-row-val" style="min-width:60px;text-align:start">${utilBadge(pct??0)}</div>
            <div style="font-size:11px;color:var(--muted);min-width:60px;text-align:start">${alloc}/${planned}h</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Holidays -->
    <div class="ins-section" id="ins-holidays">
      <div class="ins-section-hd">
        <div class="ins-section-icon" style="background:#faf5ff"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="3" width="10" height="9" rx="1.5" stroke="#7c3aed" stroke-width="1.3"/><path d="M5 2v2M9 2v2M2 6.5h10" stroke="#7c3aed" stroke-width="1.3" stroke-linecap="round"/></svg></div>
        <div><div class="ins-section-title">${t('ins.holidaysTitle')}</div><div class="ins-section-sub">${hoursLost>0?t('ins.holidaysSub').replace('{hours}',hoursLost):t('ins.noHolidaysThisMonth')}</div></div>
      </div>
      <div class="ins-section-bd" id="ins-holidays-list">
        ${monthHols.length===0?`<div class="ins-empty-msg" style="font-size:13px;color:var(--muted);padding:8px 0">${t('ins.noHolidaysThisMonth')}</div>`:''}
        <div class="ins-holiday-list">
          ${monthHols.map(([d,h])=>`
            <div class="ins-holiday ${h.type}" data-date="${d}">
              <span>${h.name}</span>
              <span style="font-size:11px;font-weight:600">${t('ins.holidayDateFmt').replace('{day}',d.slice(8)).replace('{month}',t('month.'+mo))}</span>
            </div>`).join('')}
        </div>
        ${monthHols.length>0?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:16px">
          <span style="font-size:12px;color:var(--muted)"><span style="font-weight:600;color:var(--text)">${wd.off}</span> ${t('ins.fullHolidays')}</span>
          <span style="font-size:12px;color:var(--muted)"><span style="font-weight:600;color:var(--text)">${wd.half}</span> ${t('ins.holidayEvesSub')}</span>
        </div>`:''}
      </div>
    </div>

    <!-- Vacations -->
    <div class="ins-section" id="ins-vacations">
      <div class="ins-section-hd">
        <div class="ins-section-icon" style="background:#fff7ed"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5C4 1.5 2 4 2 6.5c0 3 2 5.5 5 6 3-.5 5-3 5-6 0-2.5-2-5-5-5z" stroke="#ea580c" stroke-width="1.3"/><path d="M7 4v3.5l2 1" stroke="#ea580c" stroke-width="1.3" stroke-linecap="round"/></svg></div>
        <div><div class="ins-section-title">${t('ins.vacationsTitle')}</div><div class="ins-section-sub">${t('ins.vacationsSub').replace('{days}',totalVacDays)}</div></div>
      </div>
      <div class="ins-section-bd" id="ins-vacations-list">
        ${vacData.length===0?`<div class="ins-empty-msg" style="font-size:13px;color:var(--muted);padding:8px 0">${t('ins.noVacations')}</div>`:''}
        ${vacData.map(({e,days})=>`
          <div class="ins-row ins-vac-row" data-emp-id="${e.id}">
            <div class="ins-row-name">${e.name}</div>
            <div style="flex:1;font-size:12px;color:var(--muted)">${days} ${t('ins.vacDays')}</div>
            <div class="ins-row-val" style="color:var(--warning)">−${Math.round(days*7*(e.scope??100)/100)}h</div>
          </div>`).join('')}
      </div>
    </div>

    ${projAlerts.length>0?`
    <!-- Project bank -->
    <div class="ins-section" id="ins-project-bank">
      <div class="ins-section-hd">
        <div class="ins-section-icon" style="background:#f0fdf4"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="4" width="11" height="8" rx="1.5" stroke="#16a34a" stroke-width="1.3"/><path d="M4.5 4V3a2.5 2.5 0 015 0v1" stroke="#16a34a" stroke-width="1.3" stroke-linecap="round"/><path d="M7 7.5v1.5" stroke="#16a34a" stroke-width="1.3" stroke-linecap="round"/></svg></div>
        <div><div class="ins-section-title">${t('ins.projectBank')}</div><div class="ins-section-sub">${t('ins.projectBankSub')}</div></div>
      </div>
      <div class="ins-section-bd" id="ins-project-bank-list">
        ${projAlerts.map(({c,remaining,pct})=>`
          <div class="ins-row ins-proj-row" data-client-id="${c.id}">
            <div class="ins-row-name">${c.name}</div>
            <div class="ins-bar-wrap" style="flex:1"><div class="ins-bar" style="width:${Math.min(pct,100)}%;background:${pct>80?'var(--danger)':pct>50?'var(--warning)':'var(--success)'}"></div></div>
            <div class="ins-row-val" style="min-width:60px;text-align:start;color:${remaining<20?'var(--danger)':'var(--muted)'}"> ${t('ins.remaining')} ${remaining}h</div>
          </div>`).join('')}
      </div>
    </div>`:''}

    ${trendSection}
  </div>

  <!-- Business insights -->
  ${generateBizInsights(mk)}

  <!-- Client status table -->
  <div class="card" id="overview-client-status">
    <div class="card-hd"><div class="card-title">${t('clientStatus.title')} — ${ml}</div></div>
    <div class="tbl-wrap"><table id="overview-client-tbl">
      <thead><tr><th>${t('clientStatus.client')}</th><th>${t('clientStatus.type')}</th><th>${t('clientStatus.contracted')}</th><th>${t('clientStatus.allocated')}</th><th>${t('clientStatus.gap')}</th><th>${t('clientStatus.status')}</th></tr></thead>
      <tbody>${clientRows}</tbody>
    </table></div>
  </div>`;
}

// ===================== BUSINESS INSIGHTS ENGINE =====================
export function generateBizInsights(mk){
  const allMonths=[...(state.activeMonths||[mk])].sort();
  const currentIdx=allMonths.indexOf(mk);
  if(currentIdx<0)return'';
  const histMonths=allMonths.slice(Math.max(0,currentIdx-5),currentIdx+1);
  const prevMonths=histMonths.slice(0,-1);

  const activeEmps=state.employees.filter(e=>!e.hidden);
  const visClients=state.clients.filter(c=>c.active!==false&&c.type!=='internal');

  const mStats=histMonths.map(m=>{
    const cap=activeEmps.reduce((s,e)=>s+getEmpHours(e,m),0);
    const alloc=getTotalAllocated(m);
    const contracted=state.clients.reduce((s,c)=>s+(getClientHours(c,m)||0),0);
    const util=cap>0?Math.round(alloc/cap*100):0;
    return{m,cap,alloc,contracted,util};
  });
  const curr=mStats[mStats.length-1];

  function card(sev,icon,title,body,meta=''){
    const border=sev==='danger'?'#f85149':sev==='warn'?'#d29922':sev==='ok'?'#3fb950':'#58a6ff';
    const iconCol=border;
    return `<div style="background:var(--surface);border:1px solid var(--border);border-inline-start:3px solid ${border};border-radius:var(--r);padding:14px 16px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="color:${iconCol};font-size:15px;line-height:1;font-weight:700">${icon}</span>
        <span style="font-weight:600;font-size:13px;color:var(--text);flex:1">${title}</span>
        ${meta?`<span style="font-size:10px;color:var(--muted);white-space:nowrap;background:var(--surface-2);padding:2px 6px;border-radius:10px">${meta}</span>`:''}
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.65">${body}</div>
    </div>`;
  }

  if(histMonths.length<2)return`<div style="margin-bottom:24px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 2a5.5 5.5 0 100 11A5.5 5.5 0 007.5 2z" stroke="var(--primary)" stroke-width="1.4"/><path d="M7.5 5.5v3M7.5 10v.5" stroke="var(--primary)" stroke-width="1.4" stroke-linecap="round"/></svg>
      <span style="font-weight:700;font-size:14px">${t('bizIns.title')}</span>
    </div>
    <div style="font-size:12px;color:var(--muted);padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r)">${t('bizIns.needMoreData')}</div>
  </div>`;

  const insights=[];
  const utils=mStats.map(s=>s.util);
  const avgUtil=Math.round(utils.reduce((s,x)=>s+x,0)/utils.length);
  const sparkline=mStats.map(s=>`<span style="color:${s.util>=80?'var(--success)':s.util>=50?'var(--warning)':'var(--danger)'}">${mkLabel(s.m).split(' ')[0]} ${s.util}%</span>`).join('<span style="color:var(--border);padding:0 4px">›</span>');

  // ── 1. Utilization trend ──
  const trendDelta=utils.length>=3?utils[utils.length-1]-utils[utils.length-3]:utils[utils.length-1]-utils[0];
  const avgMeta=t('bizIns.avgMeta').replace('{pct}',avgUtil);
  if(trendDelta>=10){
    insights.push(card('ok','↑',t('bizIns.risingUtil'),t('bizIns.risingBody').replace('{delta}',trendDelta).replace('{months}',histMonths.length)+'<br>'+sparkline,avgMeta));
  }else if(trendDelta<=-10){
    insights.push(card('danger','↓',t('bizIns.fallingUtil'),t('bizIns.fallingBody').replace('{delta}',Math.abs(trendDelta)).replace('{months}',histMonths.length)+'<br>'+sparkline,avgMeta));
  }else{
    insights.push(card('info','→',t('bizIns.stableUtil'),t('bizIns.stableBody').replace('{min}',Math.min(...utils)).replace('{max}',Math.max(...utils)).replace('{months}',histMonths.length)+'<br>'+sparkline,avgMeta));
  }

  // ── 2. Capacity pressure ──
  const highPressureN=mStats.filter(s=>s.util>=90).length;
  const lowUtilN=mStats.filter(s=>s.util<60).length;
  if(highPressureN>=2){
    insights.push(card('danger','🔥',t('bizIns.capacityPressure'),t('bizIns.pressureBody').replace('{n}',highPressureN).replace('{total}',histMonths.length),t('bizIns.nOfTotal').replace('{n}',highPressureN).replace('{total}',histMonths.length)));
  }else if(lowUtilN>=2){
    insights.push(card('warn','○',t('bizIns.excessCapacity'),t('bizIns.excessBody').replace('{n}',lowUtilN).replace('{total}',histMonths.length),t('bizIns.nOfTotal').replace('{n}',lowUtilN).replace('{total}',histMonths.length)));
  }

  // ── 3. Employee burnout risk ──
  const burnoutEmps=activeEmps.filter(e=>{
    return histMonths.filter(m=>{const cap=getEmpHours(e,m),alloc=getEmpAllocated(e.id,m);return cap>0&&alloc/cap>=0.9;}).length>=2;
  });
  if(burnoutEmps.length){
    insights.push(card('danger','⚡',t('bizIns.burnoutRisk'),burnoutEmps.map(e=>{
      const n=histMonths.filter(m=>{const cap=getEmpHours(e,m),alloc=getEmpAllocated(e.id,m);return cap>0&&alloc/cap>=0.9;}).length;
      const avgPct=Math.round(histMonths.reduce((s,m)=>{const cap=getEmpHours(e,m),alloc=getEmpAllocated(e.id,m);return s+(cap>0?alloc/cap*100:0);},0)/histMonths.length);
      return '<strong>'+e.name+'</strong> — '+t('bizIns.burnoutEmp').replace('{name}','').replace('{n}',n).replace('{total}',histMonths.length).replace('{pct}',avgPct).trim();
    }).join('<br>'),`${burnoutEmps.length}`));
  }

  // ── 4. Chronic under-utilization ──
  const underEmps=activeEmps.filter(e=>{
    return histMonths.filter(m=>{const cap=getEmpHours(e,m),alloc=getEmpAllocated(e.id,m);return cap>0&&alloc/cap<0.5;}).length>=2;
  });
  if(underEmps.length){
    insights.push(card('warn','↓',t('bizIns.chronicUnderUtil'),underEmps.map(e=>{
      const avgPct=Math.round(histMonths.reduce((s,m)=>{const cap=getEmpHours(e,m),alloc=getEmpAllocated(e.id,m);return s+(cap>0?alloc/cap*100:0);},0)/histMonths.length);
      return '<strong>'+e.name+'</strong> — '+t('bizIns.underEmp').replace('{name}','').replace('{pct}',avgPct).replace('{months}',histMonths.length).trim();
    }).join('<br>'),`${underEmps.length}`));
  }

  // ── 5. Client churn risk ──
  const churnClients=visClients.filter(c=>{
    const relevantMonths=histMonths.filter(m=>getClientHours(c,m)>0);
    if(relevantMonths.length<2)return false;
    const badN=relevantMonths.filter(m=>{const p=getClientHours(c,m);return p&&getClientAllocated(c.id,m)/p<0.5;}).length;
    return badN>=2&&getClientHours(c,mk)>0;
  });
  if(churnClients.length){
    insights.push(card('danger','!',t('bizIns.churnRisk'),churnClients.map(c=>{
      const rel=histMonths.filter(m=>getClientHours(c,m)>0);
      const avgPct=Math.round(rel.reduce((s,m)=>{const p=getClientHours(c,m);return s+(p?getClientAllocated(c.id,m)/p*100:0);},0)/rel.length);
      return '<strong>'+c.name+'</strong> — '+t('bizIns.churnClient').replace('{name}','').replace('{pct}',avgPct).replace('{months}',rel.length).trim();
    }).join('<br>'),`${churnClients.length}`));
  }

  // ── 6. Scope creep ──
  const scopeClients=visClients.filter(c=>{
    const rel=histMonths.filter(m=>getClientHours(c,m)>0);
    if(rel.length<2)return false;
    return rel.filter(m=>{const p=getClientHours(c,m);return p&&getClientAllocated(c.id,m)/p>1.3;}).length>=2;
  });
  if(scopeClients.length){
    insights.push(card('warn','↑',t('bizIns.scopeCreep'),scopeClients.map(c=>{
      const rel=histMonths.filter(m=>getClientHours(c,m)>0);
      const avgPct=Math.round(rel.reduce((s,m)=>{const p=getClientHours(c,m);return s+(p?getClientAllocated(c.id,m)/p*100:0);},0)/rel.length);
      return '<strong>'+c.name+'</strong> — '+t('bizIns.scopeClient').replace('{name}','').replace('{pct}',avgPct).replace('{excess}',avgPct-100).replace('{months}',rel.length).trim();
    }).join('<br>'),`${scopeClients.length}`));
  }

  // ── 7. Client concentration risk ──
  if(curr.contracted>0){
    const sorted=visClients.map(c=>({c,h:getClientHours(c,mk)||0})).filter(x=>x.h>0).sort((a,b)=>b.h-a.h);
    if(sorted.length){
      const top1=sorted[0];
      const top3H=sorted.slice(0,3).reduce((s,x)=>s+x.h,0);
      const top1Pct=Math.round(top1.h/curr.contracted*100);
      const top3Pct=Math.round(top3H/curr.contracted*100);
      if(top1Pct>=25||top3Pct>=60){
        insights.push(card('warn','⚠',t('bizIns.highConcentration'),t('bizIns.concentrationBody').replace('{name}',top1.c.name).replace('{top1pct}',top1Pct).replace('{top3pct}',top3Pct),t('bizIns.concentrationMeta').replace('{n}',sorted.length)));
      }
    }
  }

  // ── 8. Demand trend ──
  if(mStats.length>=2){
    const first=mStats[0],last=curr;
    if(first.contracted>0){
      const growth=Math.round((last.contracted-first.contracted)/first.contracted*100);
      if(Math.abs(growth)>=10){
        const sev=growth>0?'ok':'warn';
        const dir=growth>0?t('bizIns.demandRose'):t('bizIns.demandFell');
        const title=growth>0?t('bizIns.demandRisingTitle'):t('bizIns.demandFallingTitle');
        const body=t('bizIns.demandBody').replace('{direction}',dir).replace('{pct}',Math.abs(growth)).replace('{from}',mkLabel(first.m)).replace('{to}',mkLabel(last.m)).replace('{h1}',first.contracted).replace('{h2}',last.contracted);
        insights.push(card(sev,growth>0?'↑':'↓',title,body,t('bizIns.demandMeta').replace('{n}',mStats.length)));
      }
    }
  }

  // ── 9. Demand vs capacity structural gap ──
  const overCapN=mStats.filter(s=>s.contracted>s.cap*1.1).length;
  if(overCapN>=2){
    insights.push(card('danger','↑',t('bizIns.structGapTitle'),t('bizIns.structGapBody').replace('{n}',`<strong>${overCapN}</strong>`).replace('{total}',histMonths.length),mStats.map(s=>`${Math.round(s.contracted/Math.max(s.cap,1)*100)}%`).join(', ')));
  }

  // ── 10. Revenue mix ──
  const retH=state.clients.filter(c=>c.active!==false&&c.type==='retainer').reduce((s,c)=>s+(getClientHours(c,mk)||0),0);
  const projH=state.clients.filter(c=>c.active!==false&&c.type==='project').reduce((s,c)=>s+(getClientHours(c,mk)||0),0);
  const mixTotal=retH+projH;
  if(mixTotal>0){
    const retPct=Math.round(retH/mixTotal*100);
    if(retPct>=80){
      insights.push(card('ok','✓',t('bizIns.healthyMixTitle'),t('bizIns.healthyMixBody').replace('{pct}',`<strong>${retPct}</strong>`).replace('{rest}',100-retPct),'mix'));
    }else if(retPct<50){
      insights.push(card('warn','!',t('bizIns.riskMixTitle'),t('bizIns.riskMixBody').replace('{pct}',`<strong>${retPct}</strong>`).replace('{rest}',100-retPct),'mix'));
    }
  }

  if(!insights.length)return'';

  return`<div id="overview-biz-insights" style="margin-bottom:24px">
    <div class="biz-insights-hd" style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 2a5.5 5.5 0 100 11A5.5 5.5 0 007.5 2z" stroke="var(--primary)" stroke-width="1.4"/><path d="M7.5 5.5v3M7.5 10v.5" stroke="var(--primary)" stroke-width="1.4" stroke-linecap="round"/></svg>
      <span style="font-weight:700;font-size:14px">${t('bizIns.title')}</span>
      <span style="font-size:11px;color:var(--muted)">${t('bizIns.basedOn').replace('{n}',histMonths.length)} — ${histMonths.map(m=>mkLabel(m).split(' ')[0]).join(', ')}</span>
    </div>
    <div class="biz-insights-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:10px">
      ${insights.join('')}
    </div>
  </div>`
}

let _chartLib=null;
function loadChartLib(){
  if(!_chartLib)_chartLib=import('chart.js/auto').then(m=>m.default);
  return _chartLib;
}

export async function initCharts(){
  const Chart=await loadChartLib();
  // If the user navigated away while chart.js was loading, canvases are gone — bail out.
  if(!document.getElementById('ch-alloc')&&!document.getElementById('ch-type')&&!document.getElementById('ch-trend'))return;
  const m=state.currentMonth;
  const isRtl=getLang()==='he';
  Chart.defaults.font.family='-apple-system,"Segoe UI",Arial,sans-serif';
  const topC=state.clients.filter(c=>c.active!==false&&getClientHours(c,m)>0).sort((a,b)=>getClientHours(b,m)-getClientHours(a,m)).slice(0,12);
  const c1=document.getElementById('ch-alloc');
  if(c1)_chartInstances.alloc=new Chart(c1,{type:'bar',data:{
    labels:topC.map(c=>c.name.length>14?c.name.slice(0,14)+'…':c.name),
    datasets:[
      {label:t('chart.contracted'),data:topC.map(c=>getClientHours(c,m)),backgroundColor:'#6366f133',borderColor:'#6366f1',borderWidth:1.5,borderRadius:4},
      {label:t('chart.allocatedLabel'),data:topC.map(c=>getClientAllocated(c.id,m)),backgroundColor:'#10b98133',borderColor:'#10b981',borderWidth:1.5,borderRadius:4},
    ]},options:{responsive:true,plugins:{legend:{position:'top',rtl:isRtl}},scales:{y:{beginAtZero:true}}}});

  const retH=state.clients.filter(c=>c.active!==false&&c.type==='retainer').reduce((s,c)=>s+getClientHours(c,m),0);
  const projH=state.clients.filter(c=>c.active!==false&&c.type==='project').reduce((s,c)=>s+getClientHours(c,m),0);
  const intH=state.clients.filter(c=>c.active!==false&&c.type==='internal').reduce((s,c)=>s+getClientHours(c,m),0);
  const c2=document.getElementById('ch-type');
  if(c2)_chartInstances.type=new Chart(c2,{type:'doughnut',data:{labels:[t('clientType.retainer'),t('clientType.project'),t('clientType.internal')],datasets:[{data:[retH,projH,intH],backgroundColor:['#6366f1','#10b981','#7c3aed'],borderWidth:0}]},options:{responsive:false,plugins:{legend:{position:'bottom',rtl:isRtl}},cutout:'65%'}});

  const c4=document.getElementById('ch-trend');
  if(c4)_chartInstances.trend=new Chart(c4,{type:'line',data:{
    labels:Array.from({length:12},(_,i)=>t('monthShort.'+(i+1))),
    datasets:[
      {label:t('chart.clientHours'),data:MONTHS.map(mo=>state.clients.filter(c=>c.active!==false).reduce((s,c)=>s+getClientHours(c,mo.key),0)),borderColor:'#6366f1',backgroundColor:'#6366f112',fill:true,tension:.4,borderWidth:2,pointBackgroundColor:'#6366f1'},
      {label:t('chart.empCapacity'),data:MONTHS.map(mo=>state.employees.reduce((s,e)=>s+getEmpHours(e,mo.key),0)),borderColor:'#10b981',backgroundColor:'transparent',tension:.4,borderWidth:2,borderDash:[5,3],pointBackgroundColor:'#10b981'},
    ]},options:{responsive:true,plugins:{legend:{position:'top',rtl:isRtl}},scales:{y:{beginAtZero:true}}}});
}
