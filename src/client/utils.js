import { MONTHS, MONTH_NAMES_HE } from './constants.js';
import { state } from './state.js';

export function clientTypeBadge(type){
  if(type==='retainer')return'<span class="badge b-ret">ריטיינר</span>';
  if(type==='project')return'<span class="badge b-proj">פרויקט</span>';
  return'<span class="badge b-int">פנימי</span>';
}
export function clientTypeLabel(type){
  if(type==='retainer')return'ריטיינר';
  if(type==='project')return'פרויקט';
  return'פנימי';
}

export function mkLabel(mk){
  const mo=MONTHS.find(x=>x.key===mk);
  if(mo)return mo.label;
  const[y,m]=mk.split('-').map(Number);
  return `${MONTH_NAMES_HE[m-1]} ${y}`;
}
export function mkKey(y,m){return `${y}-${String(m).padStart(2,'0')}`;}

export function closeModal(){document.getElementById('modal-root').innerHTML='';}

export function initMonthSelect(){
  const sel=document.getElementById('month-select');
  sel.innerHTML='';
  (state.activeMonths||[state.currentMonth]).slice().sort().forEach(mk=>{
    const mo=MONTHS.find(x=>x.key===mk);
    const o=document.createElement('option');
    o.value=mk;o.textContent=mkLabel(mk);
    if(mk===state.currentMonth)o.selected=true;
    sel.appendChild(o);
  });
}
