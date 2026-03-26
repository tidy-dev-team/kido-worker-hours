import { MONTHS } from './constants.js';
import { state } from './state.js';
import { getHolidays } from './hebrew-calendar.js';

// ===================== WORKING DAYS (א-ה, ללא שישי/שבת) =====================
export function getWorkingDays(mk){
  const[y,m]=mk.split('-').map(Number);
  const last=new Date(y,m,0).getDate();
  let c=0;
  for(let d=1;d<=last;d++){const dow=new Date(y,m-1,d).getDay();if(dow!==5&&dow!==6)c++;}
  return c;
}
export function calcMonthWorkDays(mk){
  const[y,m]=mk.split('-').map(Number);
  const last=new Date(y,m,0).getDate();
  let full=0,half=0,off=0;
  for(let d=1;d<=last;d++){
    const dow=new Date(y,m-1,d).getDay();
    if(dow===5||dow===6)continue;
    const key=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const h=getHolidays(y)[key];
    if(!h)full++;
    else if(h.type==='eve')half++;
    else off++;
  }
  return{full,half,off,effective:full+half*0.5};
}
export function calcAutoHours(mk){
  if(state.monthSetup?.[mk]?.workDays!==undefined)return Math.round(state.monthSetup[mk].workDays*7);
  return Math.round(calcMonthWorkDays(mk).effective*7);
}
export function calcAutoHoursForEmp(emp,mk){
  const scope=(emp.scope!=null?emp.scope:100)/100;
  return Math.round(calcAutoHours(mk)*scope);
}
export function getEmpHours(emp,mk){
  const base=emp.monthlyHours?.[mk]!==undefined?emp.monthlyHours[mk]:calcAutoHoursForEmp(emp,mk);
  const scope=(emp.scope!=null?emp.scope:100)/100;
  const vacDays=(state.vacations?.[mk]?.[emp.id])||0;
  return Math.max(0,base-Math.round(vacDays*7*scope));
}
// Project hours bank helpers
export function getRemainingBankBefore(client,mk){
  const consumed=Object.entries(client.billedHours||{})
    .filter(([m])=>m<mk)
    .reduce((s,[,v])=>s+(parseFloat(v)||0),0);
  return Math.max(0,(client.hoursBank||0)-consumed);
}
export function getTotalBilled(client){
  return Object.values(client.billedHours||{}).reduce((s,v)=>s+(parseFloat(v)||0),0);
}
// Client hours: respects project bank depletion
export function getClientHours(client,mk){
  if(!client.monthlyHours)return 0;
  const planned=client.monthlyHours[mk]!==undefined?client.monthlyHours[mk]
    :(client.defaultHours!==undefined?client.defaultHours:0);
  if(client.type==='project'&&client.hoursBank){
    return Math.min(planned,getRemainingBankBefore(client,mk));
  }
  return planned;
}

// Helper: fill all months with a value for a client
export function fillAllMonths(client,val){
  MONTHS.forEach(mo=>{client.monthlyHours[mo.key]=val;});
}
