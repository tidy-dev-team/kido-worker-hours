import { state } from '../state.js';
import { api } from '../api.js';
import { getEmpHours } from '../working-days.js';
import { mkLabel } from '../utils.js';
import { _weeklyWeekIdx, setWeeklyWeekIdx, renderPage } from '../router.js';

const _wdName={0:'א׳',1:'ב׳',2:'ג׳',3:'ד׳',4:'ה׳'};

function normWS(val){if(!val)return[];return Array.isArray(val)?val:[val];}

function _buildMonthWorkDays(mk){
  const [yr,mo]=mk.split('-').map(Number);
  const daysInMonth=new Date(yr,mo,0).getDate();
  const holidays=new Set(state.monthSetup[mk]?.holidays||[]);
  const wd=[];
  for(let d=1;d<=daysInMonth;d++){const dow=new Date(yr,mo-1,d).getDay();if(dow!==5&&dow!==6&&!holidays.has(d))wd.push({d,dow});}
  return wd;
}

function buildAutoMapMulti(allocs,allWorkDays){
  const map={};
  if(!allocs.length)return map;
  const weeks=[];let cur=[];
  for(let i=0;i<allWorkDays.length;i++){
    const wd=allWorkDays[i];
    if(i>0&&wd.dow<=allWorkDays[i-1].dow){if(cur.length)weeks.push(cur);cur=[wd];}
    else cur.push(wd);
  }
  if(cur.length)weeks.push(cur);

  for(const week of weeks){
    const weekMap={};week.forEach(wd=>{weekMap[wd.d]=[];});
    const pinnedCids=new Set();
    for(const x of allocs){
      const raw=x.client.weeklyDay;
      if(raw===undefined||raw===null)continue;
      const wds=Array.isArray(raw)?raw:[raw];
      for(const wd of week){if(wds.includes(wd.dow)){weekMap[wd.d].push(x);pinnedCids.add(x.cid);}}
    }
    const unpinned=allocs.filter(x=>!pinnedCids.has(x.cid));
    const emptyDays=week.filter(wd=>weekMap[wd.d].length===0);
    if(unpinned.length&&emptyDays.length){
      for(let i=0;i<unpinned.length;i++)weekMap[emptyDays[i%emptyDays.length].d].push(unpinned[i]);
    } else if(unpinned.length){
      const sortedDays=[...week].sort((a,b)=>weekMap[a.d].length-weekMap[b.d].length);
      unpinned.forEach((x,i)=>weekMap[sortedDays[i%sortedDays.length].d].push(x));
    }
    const sorted=[...allocs].sort((a,b)=>b.h-a.h);
    week.filter(wd=>weekMap[wd.d].length===0).forEach((wd,i)=>weekMap[wd.d].push(sorted[i%sorted.length]));
    Object.entries(weekMap).forEach(([d,a])=>{map[d]=a;});
  }
  return map;
}

export function clearWeeklySchedule(mk){
  if(!confirm('לנקות את הסידור השבועי לחודש זה?'))return;
  const allWorkDays=_buildMonthWorkDays(mk);
  const emps=state.employees.filter(e=>e.visible!==false);
  state.weeklySchedule[mk]={};
  emps.forEach(function(emp){
    state.weeklySchedule[mk][emp.id]={};
    allWorkDays.forEach(function(wd){state.weeklySchedule[mk][emp.id][wd.d]=[];});
  });
  api.delete(`/api/weekly/${mk}`);
  renderPage();
}

export function autoWeeklyDistribute(mk){
  const allWorkDays=_buildMonthWorkDays(mk);
  const activeClients=state.clients.filter(c=>c.active!==false&&c.type!=='internal');
  const emps=state.employees.filter(e=>e.visible!==false);
  if(!state.weeklySchedule[mk])state.weeklySchedule[mk]={};
  emps.forEach(emp=>{
    const monthAlloc=state.matrix[mk]?.[emp.id]||{};
    const allocs=Object.entries(monthAlloc)
      .map(([cid,h])=>({cid,h:parseFloat(h)||0,client:activeClients.find(c=>c.id===cid)}))
      .filter(x=>x.h>0&&x.client).sort((a,b)=>b.h-a.h);
    state.weeklySchedule[mk][emp.id]={};
    if(!allocs.length)return;
    const autoMap=buildAutoMapMulti(allocs,allWorkDays);
    Object.entries(autoMap).forEach(([d,assignments])=>{
      if(assignments.length)state.weeklySchedule[mk][emp.id][d]=assignments.map(x=>x.cid);
    });
  });
  api.put(`/api/weekly/${mk}`,state.weeklySchedule[mk]||{});
  renderPage();
}

export function wsShowPopover(mk,eid,day,cellEl){
  wsHidePopover();
  const activeClients=state.clients.filter(c=>c.active!==false&&c.type!=='internal');
  const emp=state.employees.find(function(e){return e.id===eid;});
  const prefCids=(emp&&emp.preferredClients&&emp.preferredClients.length)?emp.preferredClients:activeClients.map(function(c){return c.id;});
  const clientsToShow=activeClients.filter(function(c){return prefCids.includes(c.id);});
  if(!clientsToShow.length)return;
  if(!state.weeklySchedule[mk])state.weeklySchedule[mk]={};
  if(!state.weeklySchedule[mk][eid]){
    const monthAlloc=state.matrix[mk]?.[eid]||{};
    const allocs=Object.entries(monthAlloc)
      .map(function(e){return{cid:e[0],h:parseFloat(e[1])||0,client:activeClients.find(function(c){return c.id===e[0];})};})
      .filter(function(x){return x.h>0&&x.client;}).sort(function(a,b){return b.h-a.h;});
    const aw=_buildMonthWorkDays(mk);
    const am=buildAutoMapMulti(allocs,aw);
    state.weeklySchedule[mk][eid]={};
    Object.entries(am).forEach(function(e){if(e[1].length)state.weeklySchedule[mk][eid][e[0]]=e[1].map(function(x){return x.cid;});});
    api.put(`/api/weekly/${mk}`,state.weeklySchedule[mk]);
  }
  const current=new Set(normWS(state.weeklySchedule[mk][eid][day]));
  const div=document.createElement('div');
  div.id='ws-popover';
  div.style.cssText='position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--primary);border-radius:var(--r);padding:6px 4px;box-shadow:0 6px 24px rgba(0,0,0,0.18);min-width:160px;max-height:300px;overflow-y:auto';
  div.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--muted);padding:2px 8px 6px;border-bottom:1px solid var(--border);margin-bottom:4px"><span>לקוחות של '+((emp&&emp.name)||'')+'</span><button onclick="wsEditEmpPrefs(\''+eid+'\')" style="background:none;border:none;cursor:pointer;color:var(--primary);padding:2px;display:flex;align-items:center" title="ערוך לקוחות קבועים"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.41 1.41 0 0 1 2 2L3.5 10.5l-3 .5.5-3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg></button></div>'+clientsToShow.map(function(c){return'<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;border-radius:3px;font-size:12px" onmouseover="this.style.background=\'var(--surface-2)\'" onmouseout="this.style.background=\'\'"><input type="checkbox" '+(current.has(c.id)?'checked ':'')+'onchange="wsToggleClient(\''+mk+'\',\''+eid+'\','+day+',\''+c.id+'\',this.checked)" style="cursor:pointer;accent-color:var(--primary)">'+c.name+'</label>';}).join('');
  document.body.appendChild(div);
  const rect=cellEl.getBoundingClientRect();
  const top=rect.bottom+4;
  const left=Math.max(4,Math.min(rect.left,window.innerWidth-div.offsetWidth-4));
  div.style.top=top+'px';div.style.left=left+'px';
  setTimeout(function(){document.addEventListener('click',wsHandleOutsideClick,true);},30);
}
function wsHandleOutsideClick(e){
  const pop=document.getElementById('ws-popover');
  if(pop&&!pop.contains(e.target))wsHidePopover();
}
function wsHidePopover(){
  const pop=document.getElementById('ws-popover');
  if(pop)pop.remove();
  document.removeEventListener('click',wsHandleOutsideClick,true);
}
export function wsEditEmpPrefs(eid){
  wsHidePopover();
  import('./employees.js').then(mod=>mod.openEmpModal(eid));
}
export function wsToggleClient(mk,eid,day,cid,checked){
  if(!state.weeklySchedule[mk])state.weeklySchedule[mk]={};
  if(!state.weeklySchedule[mk][eid])state.weeklySchedule[mk][eid]={};
  const current=normWS(state.weeklySchedule[mk][eid][day]);
  const newCids=checked?[...current.filter(function(c){return c!==cid;}),cid]:current.filter(function(c){return c!==cid;});
  if(!newCids.length)delete state.weeklySchedule[mk][eid][day];
  else state.weeklySchedule[mk][eid][day]=newCids;
  api.patch(`/api/weekly/${mk}/${eid}/${day}`,{clientIds:newCids});
  wsUpdateCellDisplay(mk,eid,day);
}
function wsUpdateCellDisplay(mk,eid,day){
  const cellEl=document.getElementById('wc-'+eid+'-'+day);
  if(!cellEl)return;
  const activeClients=state.clients.filter(c=>c.active!==false&&c.type!=='internal');
  const cids=normWS(state.weeklySchedule[mk]?.[eid]?.[day]);
  const clients=cids.map(function(cid){return{cid,client:activeClients.find(function(c){return c.id===cid;})};}).filter(function(x){return x.client;});
  const hasManual=normWS(state.weeklySchedule[mk]?.[eid]?.[day]).length>0;
  const [,moS]=mk.split('-');const mo=parseInt(moS);
  const yr=parseInt(mk.split('-')[0]);
  const dow=new Date(yr,mo-1,parseInt(day)).getDay();
  cellEl.style.outline=hasManual?'2px solid #f59e0b':'';
  cellEl.style.outlineOffset=hasManual?'-2px':'';
  if(!clients.length){cellEl.innerHTML='<span style="color:var(--border);font-size:10px">—</span>';return;}
  cellEl.innerHTML='<div style="display:flex;flex-direction:column;gap:2px">'+clients.map(function(a){const wda=a.client.weeklyDay!=null?(Array.isArray(a.client.weeklyDay)?a.client.weeklyDay:[a.client.weeklyDay]):[];const isWD=wda.includes(dow);const short=a.client.name.length>12?a.client.name.slice(0,12)+'…':a.client.name;return'<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:3px;padding:2px 5px;font-size:10px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+a.client.name+(isWD?' ★':'')+'">'+short+(isWD?' ★':'')+'</div>';}).join('')+'</div>';
}

export function renderWeeklySchedule(){
  const mk=state.currentMonth;
  const ml=mkLabel(mk);
  const [,mo]=mk.split('-').map(Number);
  const allWorkDays=_buildMonthWorkDays(mk);

  const activeClients=state.clients.filter(c=>c.active!==false&&c.type!=='internal');
  const emps=state.employees.filter(e=>e.visible!==false);
  if(!emps.length) return '<div class="page-hd"><div class="page-title">סידור שבועי</div></div><div style="text-align:center;padding:60px;color:var(--muted)">אין עובדים פעילים</div>';

  const weeks=[];let cur=[];
  for(let i=0;i<allWorkDays.length;i++){
    const wd=allWorkDays[i];
    if(i>0&&wd.dow<=allWorkDays[i-1].dow){if(cur.length)weeks.push(cur);cur=[wd];}
    else cur.push(wd);
  }
  if(cur.length)weeks.push(cur);
  const weekIdx=Math.max(0,Math.min(_weeklyWeekIdx,weeks.length-1));
  const week=weeks[weekIdx];

  const empData=emps.map(function(emp){
    const monthAlloc=state.matrix[mk]?.[emp.id]||{};
    const allocs=Object.entries(monthAlloc)
      .map(function(e){return{cid:e[0],h:parseFloat(e[1])||0,client:activeClients.find(function(c){return c.id===e[0];})};})
      .filter(function(x){return x.h>0&&x.client;}).sort(function(a,b){return b.h-a.h;});
    const autoMap=buildAutoMapMulti(allocs,allWorkDays);
    const savedMap=state.weeklySchedule[mk]?.[emp.id];
    const hasSaved=savedMap!==undefined;
    const dayMap={};
    week.forEach(function(wd){
      if(hasSaved&&savedMap[wd.d]!==undefined){
        dayMap[wd.d]=normWS(savedMap[wd.d]).map(function(cid){return{cid,client:activeClients.find(function(c){return c.id===cid;})};}).filter(function(x){return x.client;});
      } else {
        dayMap[wd.d]=autoMap[wd.d]||[];
      }
    });
    const totalH=allocs.reduce(function(s,x){return s+x.h;},0);
    const availH=Math.round(getEmpHours(emp,mk));
    return{emp,allocs,totalH,availH,dayMap};
  });

  const tabs=weeks.map(function(w,i){
    const first=w[0],last=w[w.length-1];
    const active=i===weekIdx;
    return '<button class="btn btn-sm '+(active?'btn-p':'btn-s')+'" onclick="setWeeklyWeekIdx('+i+');renderPage()" style="'+(active?'':'opacity:0.7')+'">שבוע '+(i+1)+' <span style="font-size:10px;opacity:0.8">('+first.d+'/'+mo+'–'+last.d+'/'+mo+')</span></button>';
  }).join('');

  const colHeaders=week.map(function(wd){
    return '<th style="padding:8px 12px;text-align:center;background:var(--surface-2);border:1px solid var(--border);min-width:120px;white-space:nowrap"><div style="font-size:11px;color:var(--muted);margin-bottom:2px">'+_wdName[wd.dow]+'</div><div style="font-size:14px;font-weight:700;color:var(--text)">'+wd.d+'/'+mo+'</div></th>';
  }).join('');

  const rows=empData.map(function(ed){
    const emp=ed.emp,allocs=ed.allocs,totalH=ed.totalH,availH=ed.availH,dayMap=ed.dayMap;
    const pct=availH>0?Math.round(totalH/availH*100):0;
    const pctCol=totalH>availH?'var(--danger)':pct>=80?'var(--success)':pct>=50?'var(--warning)':'var(--muted)';
    const cells=week.map(function(wd){
      const clients=dayMap[wd.d]||[];
      const hasManual=normWS(state.weeklySchedule[mk]?.[emp.id]?.[wd.d]).length>0;
      const manualOutline=hasManual?'outline:2px solid #f59e0b;outline-offset:-2px;':'';
      let inner;
      if(!clients.length){
        inner='<span style="color:var(--border);font-size:11px;user-select:none">—</span>';
      } else {
        inner='<div style="display:flex;flex-direction:column;gap:3px">'+clients.map(function(a){
          const wda=a.client.weeklyDay!=null?(Array.isArray(a.client.weeklyDay)?a.client.weeklyDay:[a.client.weeklyDay]):[];
          const isWD=wda.includes(wd.dow);
          const short=a.client.name.length>14?a.client.name.slice(0,14)+'…':a.client.name;
          return '<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:3px 7px;font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+a.client.name+(isWD?' ★':'')+'">'+short+(isWD?' <span style="color:var(--primary)">★</span>':'')+'</div>';
        }).join('')+'</div>';
      }
      return '<td id="wc-'+emp.id+'-'+wd.d+'" onclick="wsShowPopover(\''+mk+'\',\''+emp.id+'\','+wd.d+',this)" style="padding:6px 8px;border:1px solid var(--border);vertical-align:top;min-width:120px;cursor:pointer;transition:background 0.1s;'+manualOutline+'" onmouseover="this.style.background=\'var(--surface-2)\'" onmouseout="this.style.background=\'\'">'+inner+'</td>';
    }).join('');
    return '<tr class="weekly-emp-row" data-emp-id="'+emp.id+'"><td class="weekly-emp-name-cell" style="padding:8px 14px;border:1px solid var(--border);white-space:nowrap;position:sticky;right:0;background:var(--surface);z-index:1;border-right:2px solid var(--border)"><div style="font-weight:600;font-size:13px">'+emp.name+'</div><div class="weekly-emp-hours" style="font-size:11px;color:'+pctCol+';margin-top:2px">'+totalH+'h / '+availH+'h</div></td>'+cells+'</tr>';
  }).join('');

  return `
  <div id="weekly-page" class="page-hd flex items-c just-b" style="margin-bottom:12px">
    <div>
      <div class="page-title" id="weekly-title">סידור שבועי</div>
      <div class="page-sub" id="weekly-sub">${ml} | ${emps.length} עובדים | ${weeks.length} שבועות</div>
    </div>
    <div id="weekly-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-s btn-sm" id="btn-clear-weekly" onclick="clearWeeklySchedule('${mk}')">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="1,3 11,3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4 3V2h4v1M2 3l.7 7.3A1 1 0 0 0 3.7 11h4.6a1 1 0 0 0 1-.7L10 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        נקה סידור
      </button>
      <button class="btn btn-s btn-sm" id="btn-auto-weekly" onclick="autoWeeklyDistribute('${mk}')">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.3"/><path d="M4 6h4M6 4v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        פיזור אוטומטי
      </button>
    </div>
  </div>
  <div id="weekly-week-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
    <span style="font-size:11px;color:var(--muted);font-weight:600;margin-left:4px">שבועות:</span>
    ${tabs}
  </div>
  <div id="weekly-hint" style="font-size:11px;color:var(--muted);margin-bottom:8px">לחץ על תא לעריכה • גבול כתום = עריכה ידנית</div>
  <div id="weekly-tbl-wrap" style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow)">
    <table id="weekly-tbl" style="border-collapse:collapse;width:100%">
      <thead><tr>
        <th class="weekly-emp-hd" style="padding:8px 14px;text-align:right;background:var(--surface-2);border:1px solid var(--border);font-size:12px;position:sticky;right:0;z-index:2;white-space:nowrap;border-right:2px solid var(--border)">עובד</th>
        ${colHeaders}
      </tr></thead>
      <tbody id="weekly-tbody">${rows}</tbody>
    </table>
  </div>`;
}
