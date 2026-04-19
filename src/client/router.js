import { state, saveState, loadMonthData } from './state.js';

// ===================== ROUTER =====================
export let currentPage=sessionStorage.getItem('wh_page')||'overview';
export let _chartInstances={};
export let _showAll=false;
export let _clientShowInactive=true;
export let _empView='table';
export let _matrixView='table';
export let _empEditReturnId=null;
export let _matrixFocusEmp=null;
export let _weeklyWeekIdx=0;

// Setters for mutable state that other modules need to change
export function setClientShowInactive(v){_clientShowInactive=v;}
export function setEmpView(v){_empView=v;}
export function setMatrixView(v){_matrixView=v;}
export function setEmpEditReturnId(v){_empEditReturnId=v;}
export function setMatrixFocusEmp(v){_matrixFocusEmp=v;}
export function setWeeklyWeekIdx(v){_weeklyWeekIdx=v;}
export function setShowAll(v){_showAll=v;}

// Renderer registry — set by main.js to break circular deps
let _renderers={};
export function setRenderers(r){_renderers=r;}

export function navigate(page){
  currentPage=page;
  sessionStorage.setItem('wh_page',page);
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const nav=document.getElementById('nav-'+page);
  if(nav)nav.classList.add('active');
  renderPage();
}
export async function onMonthChange(v){
  state.currentMonth=v;
  _matrixFocusEmp=null;
  saveState();
  await loadMonthData(v);
  renderPage();
}

export function renderPage(){
  Object.values(_chartInstances).forEach(ch=>{try{ch.destroy();}catch(e){}});
  _chartInstances={};
  const el=document.getElementById('page-content');
  if(currentPage==='overview'){el.innerHTML=_renderers.renderOverview();setTimeout(_renderers.initCharts,50);}
  else if(currentPage==='clients')el.innerHTML=_renderers.renderClients();
  else if(currentPage==='employees')el.innerHTML=_renderers.renderEmployees();
  else if(currentPage==='matrix')el.innerHTML=_renderers.renderMatrix();
  else if(currentPage==='weekly')el.innerHTML=_renderers.renderWeeklySchedule();
  else if(currentPage==='actuals')el.innerHTML=_renderers.renderActuals();
  else if(currentPage==='settings')el.innerHTML=_renderers.renderSettings();
}
