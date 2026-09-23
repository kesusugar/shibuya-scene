import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHQCrowd,STATE,CLIP_FOR,STATE_HOLD} from '../src/life/hq-crowd.mjs';
import {createCrowdGrid,applyVehicleThreat,THREAT} from '../src/life/hq-threat.mjs';
import {appearanceOf,ARCHETYPES,PALETTE} from '../src/life/appearance.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const laneOf=new Map(manifest.archetypes.map((a,i)=>[a.id,i]));

function build(count,lod='L2'){
 const crowd=createHQCrowd(manifest,bin,{capacity:Math.ceil(count*.45)+16,lod});
 for(let id=0;id<count;id++){
  const look=appearanceOf(id);
  const row=Math.floor(id/40),col=id%40;
  crowd.spawn(id,look,laneOf.get(look.archetype.id)??0,
   {x:(col-20)*1.2,z:(row-20)*1.2,heading:Math.PI,speed:1.3});
 }
 return crowd;
}

test('the prebuilt pack loads and describes itself',()=>{
 assert.ok(manifest.bones>0,'no bones');
 assert.ok(manifest.clips.length>=3,'a crowd needs at least Idle, Walk and Run');
 for(const name of ['Idle','Walk','Run'])
  assert.ok(manifest.clips.some(c=>c.name===name),`no ${name} clip`);
 assert.equal(manifest.archetypes.length,ARCHETYPES.length,
  'the pack and the appearance recipe disagree about how many archetypes there are');
 for(const a of manifest.archetypes){
  assert.ok(ARCHETYPES.some(x=>x.id===a.id),`pack has an archetype ${a.id} the recipe does not`);
  assert.ok(a.levels.length>=2,`${a.id} has no LOD levels`);
  for(const level of a.levels){
   assert.ok(level.vertices>0&&level.triangles>0,`${a.id} ${level.name} is empty`);
  }
  // The LODs must actually descend, or the ladder means nothing.
  for(let i=1;i<a.levels.length;i++)
   assert.ok(a.levels[i].triangles<a.levels[i-1].triangles,
    `${a.id} ${a.levels[i].name} is not cheaper than ${a.levels[i-1].name}`);
 }
 // Every state must have a clip that exists.
 for(const [state,clip] of Object.entries(CLIP_FOR))
  assert.ok(manifest.clips.some(c=>c.name===clip),`state ${state} wants a missing clip ${clip}`);
});

test('no citizen has a Skeleton or an AnimationMixer, at any count',()=>{
 // This is the whole architecture in one assertion. A crowd of two thousand that allocated a
 // skeleton each would be two thousand bone textures and two thousand mixer updates a frame,
 // which is the thing RUN 7A exists to avoid.
 const crowd=build(600);
 assert.ok(crowd.population>500,`only ${crowd.population} spawned`);
 let skeletons=0,mixers=0,skinned=0;
 crowd.root.traverse(o=>{
  if(o.isSkinnedMesh)skinned++;
  if(o.skeleton)skeletons++;
  if(o.mixer||o.isAnimationMixer)mixers++;
 });
 assert.equal(skeletons,0,`${skeletons} skeletons`);
 assert.equal(mixers,0,`${mixers} mixers`);
 assert.equal(skinned,0,'a SkinnedMesh would bring a Skeleton with it');
 const got=crowd.inspect();
 assert.equal(got.skeletons,0);assert.equal(got.mixers,0);
 crowd.dispose();
});

test('draw calls follow the archetype count, not the population',()=>{
 for(const count of [64,512]){
  const crowd=build(count);
  crowd.update(1/60,{time:0});
  const got=crowd.inspect();
  assert.ok(got.drawCalls<=ARCHETYPES.length,
   `${got.population} citizens took ${got.drawCalls} draw calls`);
  crowd.dispose();
 }
});

test('appearance and animation phase are stable, and not shared',()=>{
 const crowd=build(256);
 const sample=[];
 for(let i=0;i<crowd.population;i++)sample.push({
  id:crowd.state.id[i],lane:crowd.state.lane[i],
  phase:crowd.state.phase[i],rate:crowd.state.rate[i],
  height:crowd.state.height[i],width:crowd.state.width[i]});
 // Not a chorus line: phases must be spread, not all equal.
 const phases=new Set(sample.map(s=>s.phase.toFixed(4)));
 assert.ok(phases.size>sample.length*.5,
  `only ${phases.size} distinct phases across ${sample.length} citizens`);
 const rates=new Set(sample.map(s=>s.rate.toFixed(4)));
 assert.ok(rates.size>20,`only ${rates.size} distinct walk rates`);
 // Rebuilt from scratch, the same ids must come back identical.
 crowd.dispose();
 const again=build(256);
 for(let i=0;i<again.population;i++){
  const was=sample[i];
  assert.equal(again.state.id[i],was.id);
  assert.equal(again.state.lane[i],was.lane,`citizen ${was.id} changed archetype`);
  assert.equal(again.state.phase[i],was.phase,`citizen ${was.id} changed phase`);
  assert.equal(again.state.height[i],was.height,`citizen ${was.id} changed height`);
 }
 again.dispose();
});

test('every archetype is represented in a large crowd',()=>{
 const crowd=build(512);
 crowd.update(1/60,{time:0});
 const got=crowd.inspect();
 for(const [name,n] of Object.entries(got.byArchetype))
  assert.ok(n>0,`archetype ${name} has nobody`);
 crowd.dispose();
});

test('a reaction is a handful of writes, and identity survives it',()=>{
 const crowd=build(400);
 const before=[];
 for(let i=0;i<crowd.population;i++)
  before.push([crowd.state.id[i],crowd.state.lane[i],crowd.state.phase[i],crowd.state.height[i]]);
 for(let i=0;i<200;i++)
  assert.ok(crowd.setState(i,STATE.KNOCKDOWN,{impulseX:3,impulseZ:1,impulseY:2,force:true}));
 crowd.update(1/60,{time:0});
 // Being hit must not turn someone into a different person.
 for(let i=0;i<crowd.population;i++){
  assert.equal(crowd.state.id[i],before[i][0],'a hit changed a pedestrian id');
  assert.equal(crowd.state.lane[i],before[i][1],'a hit changed the body');
  assert.equal(crowd.state.phase[i],before[i][2],'a hit changed the phase');
  assert.equal(crowd.state.height[i],before[i][3],'a hit changed the height');
 }
 crowd.dispose();
});

test('nothing produces NaN, however hard it is hit',()=>{
 const crowd=build(200);
 for(let i=0;i<crowd.population;i+=3)
  crowd.setState(i,STATE.KNOCKDOWN,
   {impulseX:(i%7)-3,impulseZ:(i%5)-2,impulseY:3,force:true});
 for(let f=0;f<240;f++)crowd.update(1/60,{time:f/60});
 const s=crowd.state;
 for(let i=0;i<crowd.population;i++)
  for(const key of ['x','y','z','heading','phase','rate','height','width','impulseX','impulseZ','impulseY'])
   assert.ok(Number.isFinite(s[key][i]),`citizen ${i} has a non-finite ${key}`);
 crowd.dispose();
});

test('a knocked-down body settles on the ground and stops',()=>{
 const crowd=build(40);
 crowd.setState(0,STATE.KNOCKDOWN,{impulseX:8,impulseZ:0,impulseY:3,force:true});
 // Long enough for the whole chain: KNOCKDOWN 1.4 s, DOWNED 2.5 s, RECOVER 1.2 s.
 const chain=STATE_HOLD[STATE.KNOCKDOWN]+STATE_HOLD[STATE.DOWNED]+STATE_HOLD[STATE.RECOVER];
 for(let f=0;f<Math.ceil((chain+1)*60);f++)crowd.update(1/60,{time:f/60});
 assert.equal(crowd.state.y[0],0,'a body came to rest off the ground');
 assert.equal(crowd.state.impulseX[0],0,'a body never stopped sliding');
 // ...and then gets back up. This assertion used to demand the body stay DOWNED forever,
 // which is what the bug was: nothing recovered it, and a crossing running all day
 // accumulated bodies that never stood again.
 assert.equal(crowd.state.behaviour[0],STATE.NORMAL,
  `a knocked-down body never got up: still in state ${crowd.state.behaviour[0]}`);
 crowd.dispose();
});

test('bodies hit together do not all fall the same way',()=>{
 // A row of people mown down by one car must not look like a row of dominoes on a hinge.
 const crowd=build(600);
 const grid=createCrowdGrid();
 grid.rebuild(crowd);
 // Put the car IN the block. `build` lays people out in rows from the origin, so a crowd of
 // six hundred does not reach z=0 at all -- an earlier version of this test drove past an
 // empty patch of road and concluded the code was broken.
 let cz=0;for(let i=0;i<crowd.population;i++)cz+=crowd.state.z[i];
 cz/=crowd.population;
 const saved=THREAT.hitRadius;THREAT.hitRadius=10;
 applyVehicleThreat(crowd,grid,{x:0,z:cz,heading:0,speed:16},1/60,[]);
 THREAT.hitRadius=saved;
 const angles=new Set();let hit=0;
 for(let i=0;i<crowd.population;i++){
  if(crowd.state.behaviour[i]!==STATE.KNOCKDOWN)continue;
  hit++;
  angles.add(Math.round(Math.atan2(crowd.state.impulseZ[i],crowd.state.impulseX[i])*8));
 }
 // RUN 11.1: contact is face-aware now. A car going straight ahead knocks down the people in
 // front of it; the ones this widened radius puts ten metres to its side have no closing
 // speed and are not hit, which is correct. Enough still go down to judge the spread.
 assert.ok(hit>=10,`only ${hit} were knocked down`);
 assert.ok(angles.size>=2,`${hit} bodies share ${angles.size} fall direction(s)`);
 crowd.dispose();
});

test('the spatial query is bounded by the radius, not by the population',()=>{
 // Same population, same query, four densities. If the cost tracked the population the
 // candidate count would not move; it does, which is what the grid is for.
 const crowd=build(1200);
 const grid=createCrowdGrid();
 const scratch=[];
 const counts=[];
 for(const spacing of [1.2,2.4,4.0]){
  for(let i=0;i<crowd.population;i++){
   const row=Math.floor(i/40),col=i%40;
   crowd.place(i,(col-20)*spacing,0,(row-20)*spacing,Math.PI,1.3);
  }
  grid.rebuild(crowd);
  applyVehicleThreat(crowd,grid,{x:0,z:0,heading:0,speed:14},1/60,scratch);
  counts.push(scratch.length);
 }
 assert.ok(counts[0]>counts[1]&&counts[1]>counts[2],
  `candidates did not fall as the crowd spread out: ${counts.join(' -> ')}`);
 assert.ok(counts[2]<crowd.population*.25,
  `a sparse crowd still scanned ${counts[2]} of ${crowd.population}`);
 crowd.dispose();
});

test('a car through a dense crowd affects far more than a handful',()=>{
 // The requirement this whole run exists for: not eight people.
 const crowd=build(1200);
 const grid=createCrowdGrid();
 const scratch=[];
 const car={x:0,z:-26,heading:0,speed:14};
 let peakReacting=0,peakDown=0;
 for(let f=0;f<120;f++){
  car.z+=14/60;
  grid.rebuild(crowd);
  applyVehicleThreat(crowd,grid,car,1/60,scratch);
  crowd.update(1/60,{time:f/60});
  let reacting=0,down=0;
  for(let i=0;i<crowd.population;i++){
   const b=crowd.state.behaviour[i];
   if(b===STATE.LOOK||b===STATE.AVOID||b===STATE.FLEE)reacting++;
   else if(b===STATE.HIT||b===STATE.KNOCKDOWN||b===STATE.DOWNED)down++;
  }
  peakReacting=Math.max(peakReacting,reacting);peakDown=Math.max(peakDown,down);
 }
 assert.ok(peakReacting>=20,`only ${peakReacting} pedestrians reacted at once`);
 assert.ok(peakDown>=5,`only ${peakDown} were knocked down over a whole pass`);
 crowd.dispose();
});

test('a citizen behind the car is not frightened by it',()=>{
 const crowd=build(300);
 const grid=createCrowdGrid();
 grid.rebuild(crowd);
 // The car sits at the crowd's centre facing +z, so everyone at smaller z is BEHIND it.
 let cz=0;for(let i=0;i<crowd.population;i++)cz+=crowd.state.z[i];
 cz/=crowd.population;
 applyVehicleThreat(crowd,grid,{x:0,z:cz,heading:0,speed:14},1/60,[]);
 let behind=0,ahead=0;
 for(let i=0;i<crowd.population;i++){
  const past=crowd.state.z[i]<cz-2;
  if(past&&crowd.state.behaviour[i]!==STATE.NORMAL)behind++;
  if(!past&&crowd.state.behaviour[i]!==STATE.NORMAL)ahead++;
 }
 assert.ok(ahead>0,'the test proved nothing -- nobody in front of the car reacted either');
 assert.equal(behind,0,`${behind} pedestrians reacted to a car driving away from them`);
 crowd.dispose();
});

test('trousers are never lighter than skin',()=>{
 // At LOD2 a trouser hem is a few vertices and the eye has only the tone to go on. The first
 // palette had beige trousers and a crowd of two thousand looked bare-legged.
 const lum=h=>.299*((h>>16)&255)+.587*((h>>8)&255)+.114*(h&255);
 const darkestSkin=Math.min(...PALETTE.skins.map(lum));
 for(const bottom of PALETTE.bottoms)
  assert.ok(lum(bottom)<darkestSkin,
   `trousers #${bottom.toString(16)} (luminance ${lum(bottom).toFixed(0)}) are lighter than `
   +`the darkest skin (${darkestSkin.toFixed(0)})`);
});
