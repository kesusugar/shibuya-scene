import {edges,facadePoint} from './model.mjs';
// Render-only finish: do not change surveyed masses or the cached placement model.
export function refineQfrontGlass(h){
 if(h.key!=='qfront')return;
 for(const m of h.masses)if(m.bottom>=7.5)m.material='qfrontGlass';
 h.panels=h.panels.filter(p=>p.position[1]<8);
 h.details=h.details.filter(p=>p.position[1]<8);
 for(const e of edges(h.footprint)){
  const count=Math.max(1,Math.round(e.length/1.15));
  for(let i=0;i<=count;i++)h.details.push({position:facadePoint(e,e.length*i/count,25.15,.55),heading:e.heading,scale:[.085,35,.16],color:0xb7c7d2,role:'curtain-mullion'});
  for(const y of [8,32.5,37.5,42.5])h.details.push({position:facadePoint(e,e.length/2,y,.28),heading:e.heading,scale:[e.length,.105,.12],color:0x8596a5,role:'curtain-transom'});
 }
}
