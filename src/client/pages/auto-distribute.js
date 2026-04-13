import { state } from '../state.js';
import { api } from '../api.js';
import { getClientHours, getEmpHours } from '../working-days.js';
import { getEmpAllocated } from '../aggregations.js';
import { mkLabel } from '../utils.js';
import { renderPage } from '../router.js';
import { t } from '../i18n.js';

// ===================== AUTO-DISTRIBUTE =====================
// Splits `total` (floored to nearest 5) proportionally by weights.
// Returns multiples of 5 only. Sum ≤ total. Never exceeds input total.
export function _split5(weights, total){
  const t5=Math.floor(total/5)*5;
  if(!weights.length||t5<=0) return weights.map(()=>0);
  const units=t5/5;
  const wSum=weights.reduce((s,v)=>s+v,0)||weights.length;
  const exact=weights.map(w=>(w/wSum)*units);
  const fl=exact.map(v=>Math.floor(v));
  let rem=units-fl.reduce((s,v)=>s+v,0);
  exact.map((v,i)=>({i,f:v-fl[i]})).sort((a,b)=>b.f-a.f)
       .forEach(({i})=>{ if(rem-->0) fl[i]++; });
  return fl.map(v=>v*5);
}

export function autoDistribute(mk){
  const visEmps=state.employees.filter(e=>e.visible!==false);
  if(!visEmps.length){alert(t('autoDist.noEmps'));return;}

  const clients=state.clients.filter(c=>c.active!==false&&c.type!=='internal'&&getClientHours(c,mk)>0)
    .sort((a,b)=>{
      const aR=a.type==='project'?1:0,bR=b.type==='project'?1:0;
      if(aR!==bR) return aR-bR;
      return getClientHours(b,mk)-getClientHours(a,mk);
    });
  if(!clients.length){alert(t('autoDist.noClients'));return;}
  if(!confirm(t('autoDist.confirm').replace('{month}',mkLabel(mk)).replace('{count}',visEmps.length))) return;

  // ── init ──
  if(!state.matrix[mk]) state.matrix[mk]={};
  visEmps.forEach(e=>{ state.matrix[mk][e.id]={}; });

  const rem={};
  visEmps.forEach(e=>{ rem[e.id]=Math.floor(getEmpHours(e,mk)/5)*5; });

  // clientRem: remaining quota per client — never goes negative, never exceeded
  const clientRem={};
  clients.forEach(c=>{ clientRem[c.id]=getClientHours(c,mk); });

  // לכל לקוח — רק עובדים שהלקוח מוגדר אצלהם כלקוח קבוע
  for(const client of clients){
    if(clientRem[client.id]<5) continue;

    const eligible=visEmps
      .filter(e=>(e.preferredClients||[]).includes(client.id)&&rem[e.id]>=5)
      .sort((a,b)=>rem[b.id]-rem[a.id]); // מי שיש לו יותר קיבולת — קודם

    if(!eligible.length) continue;

    const quota=clientRem[client.id];
    // חלוקה יחסית לפי קיבולת עובד, כפולות של 5, לא חורג מהמכסה
    const caps=eligible.map(e=>Math.min(rem[e.id],quota));
    const shares=_split5(caps, Math.min(quota, caps.reduce((s,v)=>s+v,0)));

    eligible.forEach((emp,i)=>{
      const share=Math.min(shares[i], rem[emp.id], clientRem[client.id]);
      const share5=Math.floor(share/5)*5;
      if(share5>=5){
        state.matrix[mk][emp.id][client.id]=share5;
        rem[emp.id]-=share5;
        clientRem[client.id]-=share5;
      }
    });
  }

  // אין שלב 2 — שעות שנשארו לעובד נשארות ריקות לעדכון ידני

  api.put(`/api/matrix/${mk}`,state.matrix[mk]);
  renderPage();

  const totalAssigned=visEmps.reduce((s,e)=>s+getEmpAllocated(e.id,mk),0);
  const totalNeeded=clients.reduce((s,c)=>s+getClientHours(c,mk),0);
  const clientsCovered=clients.filter(c=>clientRem[c.id]<5).length;
  const empsWithGap=visEmps.filter(e=>rem[e.id]>=5);
  setTimeout(()=>{
    let msg=`${t('autoDist.done')}\n\n${t('autoDist.clientsCovered')} ${clientsCovered}/${clients.length}\n${t('autoDist.hoursAllocated')} ${totalAssigned}h ${t('autoDist.outOf')} ${totalNeeded}h`;
    if(empsWithGap.length)
      msg+=`\n\n${t('autoDist.empsWithGap')} (${empsWithGap.length}):\n`+
           empsWithGap.map(e=>`• ${e.name}: ${rem[e.id]}h`).join('\n');
    alert(msg);
  },100);
}
