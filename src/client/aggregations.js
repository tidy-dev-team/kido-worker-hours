import { state } from './state.js';

// ===================== AGGREGATIONS =====================
export function getTotalAllocated(mk){
  const activeCids=new Set(state.clients.filter(c=>c.active!==false).map(c=>c.id));
  return Object.values(state.matrix[mk]||{}).reduce((s,ed)=>s+Object.entries(ed).reduce((a,[cid,v])=>a+(activeCids.has(cid)?parseFloat(v)||0:0),0),0);
}
export function getClientAllocated(cid,mk){
  return Object.values(state.matrix[mk]||{}).reduce((s,ed)=>s+(parseFloat(ed[cid])||0),0);
}
export function getEmpAllocated(eid,mk){
  const activeCids=new Set(state.clients.filter(c=>c.active!==false).map(c=>c.id));
  return Object.entries((state.matrix[mk]||{})[eid]||{}).reduce((s,[cid,v])=>s+(activeCids.has(cid)?parseFloat(v)||0:0),0);
}
export function getEmpActiveClients(eid,mk){
  const activeCids=new Set(state.clients.filter(c=>c.active!==false).map(c=>c.id));
  return Object.keys((state.matrix[mk]||{})[eid]||{}).filter(cid=>activeCids.has(cid)&&(parseFloat(((state.matrix[mk]||{})[eid]||{})[cid])||0)>0).length;
}
