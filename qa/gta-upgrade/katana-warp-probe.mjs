// Katana B evidence: one cut at a person 3 m off and 40 degrees to the side, stepped frame by frame
// through the real combat and controller. Writes the body's distance to them and its heading
// (eased, as the figure turns it) against time, as JSON and a small SVG chart.
//   node qa/gta-upgrade/katana-warp-probe.mjs
import {mkdirSync,writeFileSync} from 'node:fs';
import {createMeleeCombat,PHASE,WARP} from '../../src/player/combat.mjs';
import {SWORD} from '../../src/player/attack-timing.mjs';
import {createPlayer} from '../../src/player/controller.mjs';
import {createBodyFacing} from '../../src/player/locomotion.mjs';
import {STRIKE} from '../../src/player/figure.mjs';

const OUT='evidence/katana/b';
const cell=(x,z)=>Math.floor(x/2)+','+Math.floor(z/2);
const bearing=40*Math.PI/180;
const target={id:1,x:Math.sin(bearing)*3,z:Math.cos(bearing)*3,active:true,archetype:'adult',state:'walking'};
const crowd={time:0,pool:[target],grid:new Map([[cell(target.x,target.z),[target]]]),cell,network:{ctx:{safe:()=>true,height:()=>0}},
 insert(){},leave(){},strike(p){p.struck=0;return true;},say(){},flee(){},vehicleOverlap:()=>false,blocked:()=>false};
const pl=createPlayer({solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false},{start:[0,0],heading:0,bodies:null});
const melee=createMeleeCombat({weapon:()=>'katana'}),facing=createBodyFacing(0),dt=1/60;
melee.request();melee.update(dt,crowd,pl);
const frames=[];let t=0,tx=target.x,tz=target.z;
while(melee.phase!==PHASE.IDLE&&t<2){
 pl.step(dt);melee.update(dt,crowd,pl);t+=dt;
 facing.update(pl.state.attackHeading,0,dt,STRIKE.cutTurn);
 if(melee.phase===PHASE.WINDUP){tx=target.x;tz=target.z;}
 frames.push({t:+t.toFixed(4),phase:melee.phase,distance:+Math.hypot(tx-pl.state.x,tz-pl.state.z).toFixed(4),
  heading:+facing.heading.toFixed(4)});
}
const snap=melee.snapshot();
const report={warp:WARP,turn:STRIKE.cutTurn,bladeLive:SWORD.windup,target:{distance:3,bearingDeg:40},
 cuts:snap.cuts,warps:snap.warps,frames};
mkdirSync(OUT,{recursive:true});
writeFileSync(`${OUT}/warp.json`,JSON.stringify(report,null,1)+'\n');

// Chart: distance (m, left) and heading (deg, right) against time, the wind-up shaded.
const W=640,H=300,L=50,R=50,T=20,B=40,x=s=>L+(W-L-R)*s/1.6,yd=m=>T+(H-T-B)*(1-m/3.2),yh=d=>T+(H-T-B)*(1-d/45);
const line=(f)=>frames.map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(1)},${f(p).toFixed(1)}`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif" font-size="11">
<rect width="${W}" height="${H}" fill="#fff"/>
<rect x="${x(0)}" y="${T}" width="${x(SWORD.windup)-x(0)}" height="${H-T-B}" fill="#eef"/>
<rect x="${x(WARP.from)}" y="${T}" width="${x(WARP.to)-x(WARP.from)}" height="${H-T-B}" fill="#dde"/>
<line x1="${x(SWORD.windup)}" x2="${x(SWORD.windup)}" y1="${T}" y2="${H-B}" stroke="#c33" stroke-dasharray="4 3"/>
<text x="${x(SWORD.windup)+4}" y="${T+12}" fill="#c33">blade live ${SWORD.windup}s</text>
<text x="${x(WARP.from)+4}" y="${H-B-6}" fill="#557">step ${WARP.from}-${WARP.to}s</text>
<line x1="${L}" x2="${W-R}" y1="${yd(WARP.standoff)}" y2="${yd(WARP.standoff)}" stroke="#888" stroke-dasharray="2 3"/>
<text x="${W-R-120}" y="${yd(WARP.standoff)-4}" fill="#555">standoff ${WARP.standoff} m</text>
<path d="${line(p=>yd(p.distance))}" fill="none" stroke="#136" stroke-width="2"/>
<path d="${line(p=>yh(p.heading*180/Math.PI))}" fill="none" stroke="#c80" stroke-width="2"/>
<line x1="${L}" x2="${L}" y1="${T}" y2="${H-B}" stroke="#000"/><line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" stroke="#000"/>
${[0,1,2,3].map(m=>`<text x="${L-6}" y="${yd(m)+4}" text-anchor="end" fill="#136">${m} m</text>`).join('')}
${[0,20,40].map(d=>`<text x="${W-R+6}" y="${yh(d)+4}" fill="#c80">${d}°</text>`).join('')}
${[0,.4,.8,1.2,1.6].map(s=>`<text x="${x(s)}" y="${H-B+16}" text-anchor="middle">${s}s</text>`).join('')}
<text x="${L}" y="${H-6}" fill="#136">distance to the person</text><text x="${L+170}" y="${H-6}" fill="#c80">body heading (eased turn)</text>
</svg>
`;
writeFileSync(`${OUT}/warp.svg`,svg);
const live=frames.find(f=>f.phase!==PHASE.WINDUP);
console.log(JSON.stringify({cuts:snap.cuts,warps:snap.warps,distanceAtBladeLive:live?.distance,
 squareAt:frames.find(f=>Math.abs(f.heading-bearing)<.02)?.t}));
