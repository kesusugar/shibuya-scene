// Crowd performance: the choreographed scramble cast is moved less often away from the camera
// (CAST_INTERVAL), staggered, with the skipped time carried -- so a far crosser covers the same
// ground -- and never before a camera is known, nor within 65 m of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreContext} from '../src/quality/static-context.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {restorePedestrianNetwork} from '../src/life/network.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {CrowdSimulation,CAST_INTERVAL} from '../src/life/simulation.mjs';

const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json','utf8'));
pack.ground=restoreGroundModel(pack.ground);
pack.street.high.context=restoreContext(pack.street.high.context,pack.ground,pack.generic);
Object.assign(pack.traffic.high,restoreTrafficGraph(pack.traffic.high));
pack.traffic.high.data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));pack.traffic.high.ground=pack.ground;
const network=restorePedestrianNetwork(pack.life.high,pack.ground);
function build(camera){
 const traffic=new TrafficSimulation(pack.traffic.high,{tier:'high',street:pack.street.high,heroStart:true});traffic.signals.time=88;
 const sim=new CrowdSimulation(network,{tier:'high',traffic,choreography:true,heroStart:true});
 if(camera)sim.setCamera(...camera);
 for(let f=0;f<60;f++){traffic.update(1/30);sim.update(1/30);}
 return {traffic,sim};
}
const run=({traffic,sim},frames)=>{for(let f=0;f<frames;f++){traffic.update(1/30);sim.update(1/30);}};

test('cast LOD: 30 Hz near, 15 Hz mid, 10 Hz far',()=>{
 assert.deepEqual({...CAST_INTERVAL},{near:1/30,mid:1/15,far:1/10});
});

test('cast LOD: without a camera nobody is slowed; with the camera at the crossing, nobody near it is',()=>{
 for(const camera of [null,[0,0]]){
  const w=build(camera),before=new Map(w.sim.pool.filter(p=>p.active&&p.choreographed&&(camera?p.lod==='near':true)).map(p=>[p.id,p.age]));
  run(w,30);
  for(const [id,age] of before){const p=w.sim.pool[id];if(!p.active||!p.choreographed||p.flee||p.struck!==undefined)continue;
   assert.ok(Math.abs(p.age-age-1)<1e-6,`cast member ${id} (${p.lod}) advanced ${(p.age-age).toFixed(3)} s in 1 s`);}
 }
});

test('cast LOD: far from the camera the cast is moved less often, staggered, and keeps its pace',()=>{
 const full=build(null),far=build([-200,150]);
 assert.ok(far.sim.pool.filter(p=>p.active&&p.choreographed).every(p=>p.lod==='far'));
 // Steps in which a far cast member moved, over 3 s: about one in three, and not all on the same steps.
 const p0=far.sim.pool.filter(p=>p.active&&p.choreographed);const moves=new Map(p0.map(p=>[p.id,0])),last=new Map(p0.map(p=>[p.id,p.age]));
 const perStep=[];
 for(let f=0;f<90;f++){run(far,1);run(full,1);let k=0;for(const p of p0){if(p.age!==last.get(p.id)){moves.set(p.id,moves.get(p.id)+1);last.set(p.id,p.age);k++;}}perStep.push(k);}
 const m=[...moves.values()].sort((a,b)=>a-b)[moves.size>>1];
 assert.ok(m>=29&&m<=31,`a far cast member moved on ${m} of 90 steps`);
 assert.ok(Math.max(...perStep)<p0.length*.6,'the far cast all moved on the same step');
 // ...and the clock it is moved by is the real one: its age keeps time with the world's.
 const aged=p0.filter(p=>p.active&&p.choreographed&&!p.flee);
 for(const p of aged.slice(0,50))assert.ok(Math.abs(p.age-full.sim.pool[p.id].age)<=.1+1e-6,`cast member ${p.id} lags ${(full.sim.pool[p.id].age-p.age).toFixed(3)} s`);
});
