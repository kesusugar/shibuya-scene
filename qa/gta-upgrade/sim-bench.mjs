// Crowd performance: the crowd and traffic simulations' CPU time in Node, on the same prebuilt
// models the browser loads (public/data/shibuya-static-models.json, restored as
// src/quality/static-models.mjs does) and with the scene's options (HIGH, the choreographed
// scramble, the hero start).
//
//   node qa/gta-upgrade/sim-bench.mjs [frames] [repeats] [out.json]
//
// Each repeat builds fresh simulations, warms them for 10 s of game time, then times `frames`
// updates at 30 Hz with the camera at the crossing. Reported: ms per update for the crowd and the
// traffic (mean, p50, p95, p99) over all repeats, and a hash of the final state of every
// pedestrian and vehicle. An optimisation that is meant to change nothing but speed must leave the
// hash exactly as it was (the simulations are seeded and deterministic).
import {readFileSync,writeFileSync} from 'node:fs';
import {restoreGroundModel} from '../../src/ground/model.mjs';
import {restoreContext} from '../../src/quality/static-context.mjs';
import {restoreTrafficGraph} from '../../src/traffic/graph.mjs';
import {restorePedestrianNetwork} from '../../src/life/network.mjs';
import {TrafficSimulation} from '../../src/traffic/simulation.mjs';
import {CrowdSimulation} from '../../src/life/simulation.mjs';

const frames=+(process.argv[2]??900),repeats=+(process.argv[3]??3),out=process.argv[4];
const t0=performance.now();
const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json','utf8'));
pack.ground=restoreGroundModel(pack.ground);
for(const models of [pack.signs,pack.street])for(const model of Object.values(models??{}))model.context=restoreContext(model.context,pack.ground,pack.generic);
for(const model of Object.values(pack.traffic))Object.assign(model,restoreTrafficGraph(model));
for(const [tier,model] of Object.entries(pack.life))pack.life[tier]=restorePedestrianNetwork(model,pack.ground);
// As buildTraffic does: the graph carries the scene data and the ground.
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));
pack.traffic.high.data??=data;pack.traffic.high.ground??=pack.ground;
const loadMs=performance.now()-t0;

const stats=a=>{const s=a.slice().sort((x,y)=>x-y),at=q=>s[Math.min(s.length-1,Math.floor(q*(s.length-1)+.5))];
 return {mean:+(s.reduce((x,y)=>x+y,0)/s.length).toFixed(3),p50:+at(.5).toFixed(3),p95:+at(.95).toFixed(3),p99:+at(.99).toFixed(3),max:+s.at(-1).toFixed(3)};};
// FNV-1a over the rounded state of everyone.
function hash(crowd,traffic){let h=2166136261>>>0;const mix=v=>{const s=String(v);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}};
 for(const p of crowd.pool){mix(p.active?1:0);if(!p.active)continue;mix(p.x.toFixed(5));mix(p.z.toFixed(5));mix((p.heading??0).toFixed(4));mix(p.state);mix(p.edge);}
 for(const v of traffic.pool){mix(v.active?1:0);if(!v.active)continue;mix(v.x.toFixed(5));mix(v.z.toFixed(5));mix((v.speed??0).toFixed(4));}
 return h.toString(16);}

const crowdMs=[],trafficMs=[],hashes=[];
for(let r=0;r<repeats;r++){
 const traffic=new TrafficSimulation(pack.traffic.high,{tier:'high',street:pack.street.high,heroStart:true});
 traffic.signals.time=88;
 const crowd=new CrowdSimulation(pack.life.high,{tier:'high',traffic,choreography:true,heroStart:true});
 crowd.setCamera(0,0);
 for(let f=0;f<300;f++){traffic.update(1/30);crowd.update(1/30);}
 for(let f=0;f<frames;f++){
  let a=performance.now();traffic.update(1/30);let b=performance.now();trafficMs.push(b-a);
  a=performance.now();crowd.update(1/30);b=performance.now();crowdMs.push(b-a);
 }
 hashes.push(hash(crowd,traffic));
 crowd.dispose?.();traffic.dispose?.();
}
const result={frames,repeats,loadMs:Math.round(loadMs),crowd:stats(crowdMs),traffic:stats(trafficMs),total:stats(crowdMs.map((v,i)=>v+trafficMs[i])),hashes};
console.log(JSON.stringify(result));
if(out)writeFileSync(out,JSON.stringify(result,null,1)+'\n');
