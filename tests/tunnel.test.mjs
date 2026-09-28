// Backlog ③: the underground passage -- down the stairs at A3, along the real passage under Dogenzaka,
// up at A0 -- and losing the police in it: cars stop at the stairs, officers follow on foot, the
// corners hide the player, and out of sight below the escape clock runs faster.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTunnel,TUNNEL} from '../src/world/tunnel.mjs';
import {createPlayer} from '../src/player/controller.mjs';
import {createPoliceUnits} from '../src/police/units.mjs';
import {createWanted,WANTED} from '../src/police/wanted.mjs';
import {contains} from '../src/ground/model.mjs';
import {inPolygon} from '../src/geo/core.mjs';

const tunnel=createTunnel();

test('the passage follows the real one under Dogenzaka (OSM way/664498381) between two open ends',()=>{
 const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));
 const way=data.footways.find(f=>f.id===TUNNEL.osmWay);
 assert.ok(way,'the passage is not in the map data');
 assert.equal(way.tags.tunnel,'yes');assert.equal(way.tags.level,'-1');
 // Two of its vertices are the way's own; the two joins lie on it.
 const onWay=([x,z])=>way.points.some((a,i)=>{if(!i)return false;const b=way.points[i-1],vx=a[0]-b[0],vz=a[1]-b[1],t=Math.max(0,Math.min(1,((x-b[0])*vx+(z-b[1])*vz)/(vx*vx+vz*vz)));return Math.hypot(b[0]+vx*t-x,b[1]+vz*t-z)<.1;});
 for(const i of [3,4,5,6])assert.ok(onWay(TUNNEL.route[i]),`route vertex ${i} is off the passage`);
 assert.ok(tunnel.length>120&&tunnel.length<140,`${tunnel.length} m`);
 assert.deepEqual(tunnel.ends.map(e=>e.name),['A3','A0']);
});

test('the stair wells are cut in open land: no road, pavement or building under them, a pavement by each entrance',()=>{
 const ground=JSON.parse(readFileSync('public/data/shibuya-static-models.json','utf8')).ground;
 const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));
 const inBuilding=(x,z)=>data.buildings.some(b=>x>=b.bounds.minX&&x<=b.bounds.maxX&&z>=b.bounds.minZ&&z<=b.bounds.maxZ&&inPolygon([x,z],b.polygon));
 for(const [i,hole] of tunnel.holes.entries()){
  const xs=hole.map(p=>p[0]),zs=hole.map(p=>p[1]);
  for(let x=Math.min(...xs);x<=Math.max(...xs);x+=.5)for(let z=Math.min(...zs);z<=Math.max(...zs);z+=.5){
   assert.ok(!contains(ground.roads,[x,z])&&!contains(ground.sidewalks,[x,z]),`${tunnel.ends[i].name}: the well is on the street at ${x},${z}`);
   assert.ok(!inBuilding(x,z),`${tunnel.ends[i].name}: the well is in a building at ${x},${z}`);
  }
  // A pavement within a few metres of the entrance, the way in faces open ground.
  const e=tunnel.ends[i];let near=Infinity;
  for(let r=0;r<8;r+=.5)for(let a=0;a<16;a++){const x=e.entry.x+Math.sin(a/16*6.283)*r,z=e.entry.z+Math.cos(a/16*6.283)*r;if(contains(ground.sidewalks,[x,z]))near=Math.min(near,r);}
  assert.ok(near<6,`${e.name}: no pavement near the entrance (${near} m)`);
  assert.ok(!inBuilding(e.entry.x,e.entry.z),`${e.name}: the way in is inside a building`);
 }
});

test('the floor: the pavement at each top, a straight ramp down, the passage flat below; the roof meets the ground part way',()=>{
 assert.equal(tunnel.floorAt(0),0);assert.equal(tunnel.floorAt(tunnel.length),0);
 assert.equal(tunnel.floorAt(tunnel.length/2),-TUNNEL.depth);
 const stair=tunnel.segs[0].len,slope=Math.atan(TUNNEL.depth/stair)*180/Math.PI;
 assert.ok(slope>25&&slope<35,`the stairs are ${slope.toFixed(0)}° steep`);
 assert.ok(Math.abs(tunnel.ceilingAt(tunnel.roof))<1e-9,'the roof does not meet the ground where the well ends');
 assert.ok(tunnel.ceilingAt(0)===TUNNEL.height);
});

test('layers: down through an open end, the passage walls hold, up and out at the other end; the wells are walls on the street',()=>{
 const e0=tunnel.ends[0],e1=tunnel.ends[1],st={x:e0.entry.x+e0.out.x,z:e0.entry.z+e0.out.z};
 assert.equal(tunnel.track(st),'surface');
 // The side of a well is a wall on the street; its open end is not.
 const g=tunnel.segs[0],side={x:g.a.x+g.ux*4-g.uz*(TUNNEL.width/2+.1),z:g.a.z+g.uz*4+g.ux*(TUNNEL.width/2+.1)};
 assert.ok(tunnel.solidAbove(side.x,side.z,.3),'a well is open at its side');
 assert.ok(!tunnel.solidAbove(e0.top.x+g.ux*.4,e0.top.z+g.uz*.4,0),'the open end is a wall');
 // At a top nothing flickers: a step short of `down` in stays on the street; once below, a step
 // back out to the top stays below until `up` beyond it.
 const at=(a)=>({x:e0.top.x+tunnel.segs[0].ux*a,z:e0.top.z+tunnel.segs[0].uz*a});
 Object.assign(st,at(TUNNEL.down-.1));assert.equal(tunnel.track(st),'surface','down at the very top');
 Object.assign(st,at(TUNNEL.down+.1));assert.equal(tunnel.track(st),'tunnel');
 Object.assign(st,at(-TUNNEL.up+.1));assert.equal(tunnel.track(st),'tunnel','up at the very top');
 Object.assign(st,at(-TUNNEL.up-.1));assert.equal(tunnel.track(st),'surface');
 // Walk the route, end to end.
 let lowest=0;
 for(let s=TUNNEL.down+.1;s<=tunnel.length-.3;s+=.4){const p=tunnel.pointAt(s,.5);Object.assign(st,{x:p.x,z:p.z});tunnel.track(st);
  assert.equal(st.layer,'tunnel',`on the surface ${s.toFixed(1)} m along`);
  assert.ok(!tunnel.solidBelow(p.x,p.z,.3),`a wall in the passage ${s.toFixed(1)} m along`);lowest=Math.min(lowest,p.y);}
 assert.equal(lowest,-TUNNEL.depth);
 assert.equal(st.tunnelEnd,0,'went down at A3');
 // Up and out at A0.
 Object.assign(st,{x:e1.entry.x,z:e1.entry.z});tunnel.track(st);
 assert.equal(st.layer,'surface');assert.equal(st.tunnelEnd,1);
 // Below, outside the passage is a wall (under the street, under a building).
 const mid=tunnel.pointAt(60);assert.ok(tunnel.solidBelow(mid.x+10,mid.z+10,0));
});

test('the player walks down the A3 stairs, along below, and cannot leave the passage but by an open end',()=>{
 const street={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
 let player=null;const ctx=tunnel.context(street,()=>player?.state.layer??'surface');
 const e0=tunnel.ends[0];
 player=createPlayer(ctx,{start:[e0.entry.x+e0.out.x,e0.entry.z+e0.out.z],heading:e0.heading,bodies:null});
 player.state.heading=e0.heading;player.setTouch({forward:1});
 let lowest=0;
 for(let i=0;i<30*8;i++){player.step(1/30);tunnel.track(player.state);lowest=Math.min(lowest,player.state.y);}
 assert.equal(player.state.layer,'tunnel','the player did not go down');
 assert.ok(lowest<=-TUNNEL.depth+.05,`the player reached ${lowest.toFixed(2)} m`);
 // Walk straight on, into the far wall of the landing: the passage holds them.
 for(let i=0;i<30*4;i++){player.step(1/30);tunnel.track(player.state);}
 assert.ok(tunnel.inside(player.state.x,player.state.z),'the player walked through the passage wall');
 assert.equal(player.state.layer,'tunnel');
 // The camera's ceiling is the passage's.
 assert.ok(ctx.ceiling(player.state.x,player.state.z)<0);
});

const cell=(x,z)=>Math.floor(x/2)+','+Math.floor(z/2);
function street(){const grid=new Map();return {time:0,pool:[],grid,cell,network:{ctx:{solid:()=>false,safe:()=>true,height:()=>0}},
 insert(p){const k=cell(p.x,p.z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);},despawn(){},leave(){}};}

test('police: an officer at the stairs goes down after the player, follows below, and comes up where the player came out',()=>{
 const units=createPoliceUnits(),crowd=street(),e0=tunnel.ends[0],dt=1/30;
 const p={id:4,active:true,officer:true,x:e0.entry.x+.5,z:e0.entry.z,height:0,state:'fighting',combatHealth:100};crowd.insert(p);units.officers.add(p);
 const run=(seconds,below,exited=null,me=e0.entry)=>{for(let t=0;t<seconds;t+=dt){crowd.time+=dt;units.update(dt,{stars:2,crowd,me,tunnel,below,exited});}};
 // The player is 40 m in: the officer goes down and runs after them.
 const at=tunnel.pointAt(40);run(1,{s:40,x:at.x,z:at.z});
 assert.ok(p.tunnelS!=null,'the officer did not go down');
 run(6,{s:40,x:at.x,z:at.z});
 assert.ok(p.tunnelS>15&&p.tunnelS<40,`the officer is ${p.tunnelS?.toFixed(1)} m along`);
 assert.ok(p.height<-1,'the officer is not below');
 // The player came out at A0: the officer runs there and comes up onto the street.
 const e1=tunnel.ends[1];run(60,null,1,e1.entry);
 assert.equal(p.tunnelS,null,'the officer is still below');
 assert.ok(Math.hypot(p.x-e1.entry.x,p.z-e1.entry.z)<3,'the officer came up somewhere else');
 assert.equal(p.height,0);
});

test('underground sight: an officer below sees along the passage, not round a corner; the street does not see below',()=>{
 // 70 m along is on the long straight (the passage's own segment, 33.5-84.1 m).
 const s=70,me=tunnel.pointAt(s),officer=(at)=>{const q=tunnel.pointAt(at);return {tunnelS:at,x:q.x,z:q.z};};
 assert.ok(tunnel.sees(officer(s-15),me.x,me.z,s),'an officer 15 m behind on the straight does not see');
 assert.ok(!tunnel.sees(officer(s-TUNNEL.sight-2),me.x,me.z,s),'seen from beyond the sight range');
 // Round the corner at the join (route vertex 3): 6 m up the link, 6 m along the passage.
 const cornerS=tunnel.segs[2].s0+tunnel.segs[2].len,a=officer(cornerS-6),b=tunnel.pointAt(cornerS+8);
 assert.ok(!tunnel.sees(a,b.x,b.z,cornerS+8),'seen round a corner');
 assert.ok(!tunnel.sees({tunnelS:null,x:me.x,z:me.z},me.x,me.z,s),'an officer on the street sees below');
});

test('escape: unseen underground the clock runs faster and the search circle does not reach',()=>{
 const run=hidden=>{const w=createWanted();w.crime('officerAssault',{x:0,z:0,t:0});w.crime('officerAssault',{x:0,z:0,t:0});
  w.update(1/30,{x:0,z:0,t:0,seen:true});let t=0;
  while(w.state.stars&&t<120){t+=1/30;w.update(1/30,{x:5,z:0,t,seen:false,hidden});}return {t,stars:w.state.stars};};
 const street=run(0),below=run(TUNNEL.escapeRate);
 assert.ok(street.stars>0,'escaped on the street inside the search circle');
 assert.equal(below.stars,0,'not escaped underground');
 assert.ok(Math.abs(below.t-WANTED.escapeSeconds[2]/TUNNEL.escapeRate)<.2,`escaped after ${below.t.toFixed(1)} s`);
});

test('police: officers on the street let go of their cover when the player goes below, and make for the stairs',async()=>{
 const {createPoliceDirector}=await import('../src/police/director.mjs');
 const director=createPoliceDirector({speech:null,Utterance:null});
 const crowd=street(),e0=tunnel.ends[0],dt=1/30;
 const o={id:7,active:true,officer:true,x:e0.entry.x+8,z:e0.entry.z,height:0,state:'fighting',combatHealth:100,gunHold:true,gunAim:1};
 crowd.insert(o);director.units.officers.add(o);
 director.wanted.crime('policeCarTaken',{x:e0.entry.x,z:e0.entry.z,t:0});
 const below=tunnel.pointAt(20),player={x:below.x,z:below.z,y:below.y,layer:'tunnel',tunnelS:20,tunnelEnd:0,alive:true,heading:0};
 const step=seconds=>{for(let t=0;t<seconds;t+=dt){crowd.time+=dt;director.frame(dt,{player,crowd,tunnel,solid:()=>false});}};
 const x0=o.x;step(.5);
 assert.equal(o.gunHold,false,'the officer above still holds cover over a player below');
 assert.ok(o.x<x0-.5,'the officer above did not set off for the stairs');
 step(6);
 assert.ok(o.tunnelS!=null,'the officer did not go down after the player');
 director.dispose(null,crowd);
});

test('the trail: an officer close behind below holds the escape clock; pulling well ahead loses them',async()=>{
 const {createPoliceDirector}=await import('../src/police/director.mjs');
 const director=createPoliceDirector({speech:null,Utterance:null}),crowd=street(),dt=1/30,at=s=>tunnel.pointAt(s);
 director.wanted.crime('policeCarTaken',{x:0,z:0,t:0});
 // On the long straight (33.5-84.1 m): the player at 75 m, an officer below 35 m behind -- beyond
 // sight (28 m), within the trail (40 m).
 const o={id:9,active:true,officer:true,tunnelS:40,...at(40),height:-4.2,state:'fighting',combatHealth:100};
 crowd.insert(o);director.units.officers.add(o);
 const player={layer:'tunnel',tunnelS:75,tunnelEnd:0,alive:true,heading:0,...at(75)};
 const frame=()=>{crowd.time+=dt;return director.frame(dt,{player,crowd,tunnel,solid:()=>false});};
 director.wanted.state.escape=3;
 let f;for(let i=0;i<6;i++)f=frame();
 assert.equal(f.seen,false,'the officer 35 m back sees the player');
 assert.equal(f.trail,true,'an officer 35 m behind below is not on the trail');
 assert.equal(director.wanted.state.escape,3,'the escape clock moved while they were on the trail');
 // Well ahead: the officer 95 m back is off the trail, and the clock runs at the underground rate.
 Object.assign(o,{tunnelS:15,...at(15)});Object.assign(player,{tunnelS:110,...at(110)});
 f=frame();assert.equal(f.trail,false,'an officer 95 m back is still on the trail');
 const e0=director.wanted.state.escape;frame();
 assert.ok(Math.abs(director.wanted.state.escape-e0-dt*TUNNEL.escapeRate)<1e-6,'the escape clock does not run at the underground rate');
 director.dispose(null,crowd);
});
