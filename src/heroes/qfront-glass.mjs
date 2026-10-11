import {edges,facadePoint} from './model.mjs';
// Render-only finish: do not change surveyed masses or the cached placement model.
export function refineQfrontGlass(h){
 if(h.key!=='qfront')return;
 // Reality alignment G2-2: glass on the storeys only; the crown keeps its metal and the Blender lattice.
 for(const m of h.masses)if(m.bottom>=7.5&&m.label!=='roof-crown')m.material='qfrontGlass';
 h.panels=h.panels.filter(p=>p.position[1]<8);
 h.details=h.details.filter(p=>p.position[1]<8);
 const lo=h.screenBottom-.4,hi=h.screenBottom+h.screenHeight+.4;
 for(const e of edges(h.footprint)){
  // The curtain wall's white aluminium fins, about a metre apart (photographs), proud of the glass.
  const count=Math.max(1,Math.round(e.length/1.05));
  const monitorFace=e.normal[0]*h.primaryFacade.direction[0]+e.normal[1]*h.primaryFacade.direction[1]>.85;
  const spans=monitorFace?[[7.65,lo],[hi,43.85]]:[[7.65,43.85]];
  for(let i=0;i<=count;i++)for(const [a,b]of spans)if(b-a>.5)h.details.push({position:facadePoint(e,e.length*i/count,(a+b)/2,.16),heading:e.heading,scale:[.1,b-a,.32],color:0xd6dadc,role:'curtain-mullion'});
  for(const y of [7.9,12.9,18.3,23.7,29.1,34.5,39.9,43.85]){if(monitorFace&&y>lo&&y<hi)continue;h.details.push({position:facadePoint(e,e.length/2,y,.2),heading:e.heading,scale:[e.length,.22,.36],color:0xc4c9cc,role:'curtain-transom'});}
 }
}
