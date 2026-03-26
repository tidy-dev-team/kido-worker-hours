import { state, saveState } from '../state.js';
import { mkLabel, initMonthSelect } from '../utils.js';
import { calcMonthWorkDays, getEmpHours } from '../working-days.js';
import { getTotalAllocated, getEmpAllocated, getEmpActiveClients } from '../aggregations.js';
import { navigate } from '../router.js';
import * as XLSX from 'xlsx';

// ===================== SETTINGS PAGE =====================
export function renderSettings(){
  const months=[...(state.activeMonths||[])].sort();

  const monthRows=months.map(mk=>{
    const ml=mkLabel(mk);
    const empCount=state.employees.filter(e=>!e.hidden).length;
    const activeClients=state.clients.filter(c=>c.active!==false&&c.type!=='internal');
    const contracted=activeClients.reduce((s,c)=>s+(c.monthlyHours?.[mk]||0),0);
    const allocated=getTotalAllocated(mk);
    const util=contracted>0?Math.round(allocated/contracted*100):0;
    const utilColor=util>=85?'#3fb950':util>=60?'#d29922':'#f85149';
    const isCurrent=mk===state.currentMonth;
    const canDelete=months.length>1||!isCurrent;
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:10px 14px;text-align:center">
        <input type="checkbox" class="export-month-cb" value="${mk}" style="accent-color:var(--primary);width:15px;height:15px;cursor:pointer">
      </td>
      <td style="padding:10px 14px">
        <span style="font-weight:600;font-size:13px">${ml}</span>
        ${isCurrent?'<span style="font-size:10px;background:var(--primary);color:#fff;padding:2px 7px;border-radius:10px;margin-right:7px;vertical-align:middle">נוכחי</span>':''}
      </td>
      <td style="padding:10px 14px;text-align:center;color:var(--muted);font-size:13px">${activeClients.length}</td>
      <td style="padding:10px 14px;text-align:center;color:var(--muted);font-size:13px">${empCount}</td>
      <td style="padding:10px 14px;text-align:center;font-size:13px">${contracted?contracted+'h':'—'}</td>
      <td style="padding:10px 14px;text-align:center;font-size:13px">${allocated?allocated+'h':'—'}</td>
      <td style="padding:10px 14px;text-align:center">
        ${contracted>0
          ?`<span style="font-weight:700;font-size:13px;color:${utilColor}">${util}%</span>`
          :'<span style="color:var(--muted);font-size:12px">—</span>'}
      </td>
      <td style="padding:10px 14px;text-align:center">
        <div style="display:flex;align-items:center;justify-content:center;gap:6px">
          <button class="btn btn-s btn-sm" title="ייצוא חודש זה לאקסל" style="gap:5px" onclick="exportMonthsToExcel('${mk}')">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M6 3v5M3.5 5.5 6 8l2.5-2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            XLS
          </button>
          <button class="btn btn-s btn-sm" style="color:#f85149;border-color:rgba(248,81,73,.3);gap:5px"
            onclick="deleteMonth('${mk}')" ${canDelete?'':'disabled title="לא ניתן למחוק חודש יחיד"'}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1.5 3h9M4.5 3V1.5h3V3M10 3l-.6 7A1 1 0 0 1 8.4 11H3.6A1 1 0 0 1 2.6 10L2 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            מחק
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="page-hd">
    <div class="page-title" style="display:flex;align-items:center;gap:9px">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M9 1.5v1.5M9 15v1.5M15 9h1.5M1.5 9H3M13.24 4.76l1.06-1.06M3.7 14.3l1.06-1.06M13.24 13.24l1.06 1.06M3.7 3.7l1.06 1.06" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      הגדרות
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:24px;max-width:920px">

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-weight:700;font-size:15px">ניהול חודשים</div>
        <span style="font-size:12px;color:var(--muted);background:var(--surface-2);padding:3px 10px;border-radius:20px;border:1px solid var(--border)">${months.length} חודשים</span>
      </div>
      ${months.length?`
      <div style="border:1px solid var(--border);border-radius:var(--r);overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--surface-2)">
              <th style="padding:9px 14px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border)">ייצוא</th>
              <th style="padding:9px 14px;text-align:right;font-size:11px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border)">חודש</th>
              <th style="padding:9px 14px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border)">לקוחות</th>
              <th style="padding:9px 14px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border)">עובדים</th>
              <th style="padding:9px 14px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border)">שעות חוזיות</th>
              <th style="padding:9px 14px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border)">שעות מוקצות</th>
              <th style="padding:9px 14px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border)">ניצולת</th>
              <th style="padding:9px 14px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border)">פעולות</th>
            </tr>
          </thead>
          <tbody>${monthRows}</tbody>
        </table>
      </div>`
      :'<div style="text-align:center;padding:40px;color:var(--muted)">אין חודשים במערכת</div>'}
    </div>

    <div class="card">
      <div style="font-weight:700;font-size:15px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        ייצוא דוח לאקסל
      </div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px;line-height:1.6">
        סמני חודשים בטבלה למעלה ולחצי ייצוא. הקובץ יכלול 4 גיליונות:<br>
        <span style="color:var(--text)">סיכום חודשי · פירוט עובדים · פירוט לקוחות · מטריצת הקצאות</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn btn-s btn-sm" onclick="document.querySelectorAll('.export-month-cb').forEach(cb=>cb.checked=true)">
          בחר הכל
        </button>
        <button class="btn btn-s btn-sm" onclick="document.querySelectorAll('.export-month-cb').forEach(cb=>cb.checked=false)">
          בטל הכל
        </button>
        <div style="width:1px;height:20px;background:var(--border)"></div>
        <button class="btn btn-p" onclick="exportMonthsToExcel()" style="gap:7px">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M7 4v6M4.5 7.5 7 10l2.5-2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ייצוא לאקסל
        </button>
      </div>
    </div>

  </div>`;
}

export function deleteMonth(mk){
  const ml=mkLabel(mk);
  if(!confirm('למחוק את חודש '+ml+'?\n\nכל הנתונים של החודש הזה — הקצאות, הגדרות וחופשות — יימחקו לצמיתות.'))return;
  state.activeMonths=(state.activeMonths||[]).filter(m=>m!==mk);
  delete (state.matrix||{})[mk];
  if(state.monthSetup)delete state.monthSetup[mk];
  if(state.vacations)delete state.vacations[mk];
  state.employees.forEach(e=>{if(e.monthlyHours)delete e.monthlyHours[mk];});
  state.clients.forEach(c=>{
    if(c.monthlyHours)delete c.monthlyHours[mk];
    if(c.billedHours)delete c.billedHours[mk];
  });
  if(state.currentMonth===mk){
    const remaining=state.activeMonths;
    state.currentMonth=remaining.length?remaining[remaining.length-1]:'';
  }
  saveState();
  initMonthSelect();
  navigate('settings');
}

export function exportMonthsToExcel(forceMks){
  let mks;
  if(forceMks){
    mks=Array.isArray(forceMks)?forceMks:[forceMks];
  } else {
    const cbs=document.querySelectorAll('.export-month-cb:checked');
    mks=[...cbs].map(cb=>cb.value);
    if(!mks.length){alert('יש לסמן לפחות חודש אחד לייצוא');return;}
  }

  const wb=XLSX.utils.book_new();
  const typeHe={retainer:'ריטיינר',project:'פרויקט',internal:'פנימי'};

  // ── Sheet 1: Monthly summary ──
  const sum=[['חודש','לקוחות פעילים','עובדים פעילים','שעות חוזיות','שעות מוקצות','ניצולת %','ימי עבודה']];
  mks.forEach(mk=>{
    const ac=state.clients.filter(c=>c.active!==false&&c.type!=='internal');
    const ae=state.employees.filter(e=>!e.hidden);
    const contracted=ac.reduce((s,c)=>s+(c.monthlyHours?.[mk]||0),0);
    const allocated=getTotalAllocated(mk);
    const util=contracted>0?Math.round(allocated/contracted*100):0;
    const wd=state.monthSetup?.[mk]?.workDays??calcMonthWorkDays(mk).effective;
    sum.push([mkLabel(mk),ac.length,ae.length,contracted,allocated,contracted>0?util+'%':'—',wd]);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sum),'סיכום חודשי');

  // ── Sheet 2: Employees detail ──
  const empRows=[['חודש','עובד','תפקיד','שעות קיבולת','שעות מוקצות','ניצולת %','ימי חופש','לקוחות פעילים']];
  mks.forEach(mk=>{
    state.employees.filter(e=>!e.hidden).forEach(e=>{
      const cap=getEmpHours(e,mk);
      const alloc=getEmpAllocated(e.id,mk);
      const util=cap>0?Math.round(alloc/cap*100):0;
      const vac=state.vacations?.[mk]?.[e.id]||0;
      const clients=getEmpActiveClients(e.id,mk);
      empRows.push([mkLabel(mk),e.name,e.role||'',cap,alloc,cap>0?util+'%':'—',vac,clients]);
    });
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(empRows),'פירוט עובדים');

  // ── Sheet 3: Clients detail ──
  const clientRows=[['חודש','לקוח','סוג','שעות חוזיות','שעות מוקצות','ניצולת %']];
  mks.forEach(mk=>{
    state.clients.filter(c=>c.active!==false).forEach(c=>{
      const contracted=c.monthlyHours?.[mk]||0;
      const allocated=Object.values(state.matrix[mk]||{}).reduce((s,ed)=>s+(parseFloat(ed[c.id])||0),0);
      const util=contracted>0?Math.round(allocated/contracted*100):0;
      clientRows.push([mkLabel(mk),c.name,typeHe[c.type]||c.type,contracted||'—',allocated||'—',contracted>0?util+'%':'—']);
    });
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(clientRows),'פירוט לקוחות');

  // ── Sheet 4: Allocation matrix ──
  const allocRows=[['חודש','עובד','לקוח','שעות מוקצות']];
  mks.forEach(mk=>{
    Object.entries(state.matrix[mk]||{}).forEach(([eid,cMap])=>{
      const emp=state.employees.find(e=>e.id===eid);
      if(!emp)return;
      Object.entries(cMap).forEach(([cid,hrs])=>{
        const h=parseFloat(hrs)||0;
        if(!h)return;
        const client=state.clients.find(c=>c.id===cid);
        allocRows.push([mkLabel(mk),emp.name,client?.name||cid,h]);
      });
    });
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(allocRows),'מטריצת הקצאות');

  // style column widths
  [sum,empRows,clientRows,allocRows].forEach((data,si)=>{
    const ws=wb.Sheets[wb.SheetNames[si]];
    if(!ws['!cols'])ws['!cols']=[];
    const maxW=data[0].map((_,ci)=>Math.min(30,Math.max(...data.map(r=>String(r[ci]??'').length))+2));
    ws['!cols']=maxW.map(w=>({wch:w}));
  });

  const fname=mks.length===1
    ?'workforce-'+mks[0]+'.xlsx'
    :'workforce-report-'+new Date().toISOString().slice(0,10)+'.xlsx';
  XLSX.writeFile(wb,fname);
}
