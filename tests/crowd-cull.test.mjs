// Crowd performance: the mass crowd draws from the main camera only the citizens it can see.
// Nobody is removed: everyone stays simulated, animated and positioned, keeps their own look and
// their own walk, and any other camera (a reflection) still draws the whole crowd.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera,Frustum,Matrix4,Sphere,Vector3} from 'three';
import {createHQCrowd} from '../src/life/hq-crowd.mjs';
import {appearanceOf} from '../src/life/appearance.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const laneOf=new Map(manifest.archetypes.map((a,i)=>[a.id,i]));

// 800 citizens on a ring round the origin, 10-90 m out: about a fifth in front of a camera there.
function build(count=800){
 const crowd=createHQCrowd(manifest,bin,{capacity:count,lods:['L0','L1','L2']});
 for(let id=0;id<count;id++){
  const look=appearanceOf(id),a=id*2.399963,r=10+(id*37%80);
  crowd.spawn(id,look,laneOf.get(look.archetype.id)??0,{x:Math.cos(a)*r,z:Math.sin(a)*r,heading:a,speed:1.3});
 }
 crowd.update(1/60,{time:0});
 return crowd;
}
const camera=(yaw=0)=>{const c=new PerspectiveCamera(50,16/9,.1,2000);c.position.set(0,1.7,0);c.lookAt(Math.sin(yaw)*10,1.5,Math.cos(yaw)*10);c.updateMatrixWorld();return c;};
const inView=(c,x,y,z,r=2.6)=>new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse)).intersectsSphere(new Sphere(new Vector3(x,y+.9,z),r));
// Everything a citizen's slot carries, read back from the lane, by pedestrian id.
function snapshot(crowd){
 const out=new Map();
 for(let i=0;i<crowd.population;i++){
  const lane=crowd.lanes[crowd.state.lane[i]],slot=crowd.state.slot[i],read=(a,n)=>Array.from(a.array.slice(slot*n,slot*n+n));
  assert.equal(lane.owners[slot],i,'a slot does not know who is in it');
  out.set(crowd.state.id[i],{matrix:read(lane.mesh.instanceMatrix,16),pal:read(lane.palAttr,4),clip:read(lane.clipAttr,2),anim:read(lane.animAttr,2),
   shoe:read(lane.shoeAttr,2),prev:read(lane.prevAttr,4),blend:read(lane.blendAttr,2)});
 }
 return out;
}
const drawn=(lane,c)=>{lane.mesh.onBeforeRender(null,null,c);return lane.mesh.count;};

test('cull: the main camera draws exactly who it can see, first in each lane; nobody is removed',()=>{
 const crowd=build(),c=camera(),before=crowd.population;
 const r=crowd.cull(c);
 assert.equal(crowd.population,before,'culling removed citizens');
 let seen=0;
 for(const lane of crowd.lanes){
  const n=drawn(lane,c);assert.equal(n,lane.visible);seen+=n;
  for(let s=0;s<lane.count;s++){const i=lane.owners[s];
   assert.equal(inView(c,crowd.state.x[i],crowd.state.y[i],crowd.state.z[i],2.6),s<n,`slot ${s}: drawn ${s<n} but in view ${!(s<n)}`);}
 }
 assert.equal(seen,r.citizens);
 assert.ok(seen>40&&seen<before*.5,`saw ${seen} of ${before}`);
});

test('cull: every citizen keeps their own look, pose and walk through the reordering',()=>{
 const crowd=build(),before=snapshot(crowd);
 crowd.cull(camera(0));crowd.cull(camera(2.1));crowd.cull(camera(4.4));
 const after=snapshot(crowd);
 assert.equal(after.size,before.size);
 for(const [id,b] of before)assert.deepEqual(after.get(id),b,`citizen ${id} changed in the reordering`);
});

test('cull: another camera (a reflection) still draws everyone; turning it off draws everyone again',()=>{
 const crowd=build(),c=camera(),mirror=camera(Math.PI);
 crowd.cull(c);
 for(const lane of crowd.lanes)assert.equal(drawn(lane,mirror),lane.count);
 assert.ok(crowd.lanes.some(lane=>drawn(lane,c)<lane.count),'nothing was culled');
 crowd.cull(null);
 for(const lane of crowd.lanes)assert.equal(drawn(lane,c),lane.count);
});

test('cull: a turn of the camera moves only who changed sides, and the next frame keeps it',()=>{
 const crowd=build(),c=camera(0);
 crowd.cull(c);
 const again=crowd.cull(c);
 assert.equal(again.swaps,0,'a frame with nothing changed still reordered');
 const turn=crowd.cull(camera(.15));
 assert.ok(turn.swaps<crowd.population*.1,`a small turn moved ${turn.swaps}`);
 // Update after culling still writes each citizen into their own slot.
 const before=snapshot(crowd);crowd.update(0,{time:0});const after=snapshot(crowd);
 for(const [id,b] of before)assert.deepEqual(after.get(id).pal,b.pal);
});

test('only the slots in use are uploaded',()=>{
 const crowd=build();
 for(const lane of crowd.lanes){
  const r=lane.mesh.instanceMatrix.updateRanges;
  assert.equal(r.length,1);assert.equal(r[0].start,0);assert.equal(r[0].count,Math.max(1,lane.count)*16);
 }
});

// The owner's choice from evidence/crowd-perf/l0cap: at most 48 citizens at full detail (L0),
// the nearest; the rest of the L0 band at L1. Nobody is removed.
import {createHQLayer,L0_CAP_DEFAULT,HQ_LOD} from '../src/life/hq-layer.mjs';
test('L0 cap: only the nearest N are drawn at full detail, the rest of the band at L1, nobody removed',()=>{
 assert.equal(L0_CAP_DEFAULT,48);
 // 600 people in a 1 m grid round the camera: ~600 within the L0 band.
 const people=[];for(let id=0;id<600;id++){const row=Math.floor(id/25),col=id%25;
  people.push({id,active:true,controlled:false,archetype:'adult',state:'walking',x:col-12,z:row-12,renderX:col-12,renderZ:row-12,
   height:0,heading:0,speed:1.3,crossing:null,queueKey:null,edge:3,route:[3]});}
 const layer=createHQLayer(manifest,bin,{budget:600}),cam={x:0,z:0};
 layer.sync(people,cam,0,{time:0});layer.relod();layer.sync(people,cam,0,{time:0});
 const uncapped=layer.crowd.inspect().byLod.L0;
 assert.ok(uncapped>200,`only ${uncapped} at L0 before the cap`);
 layer.setL0Cap(L0_CAP_DEFAULT);layer.relod();layer.sync(people,cam,0,{time:0});
 const got=layer.crowd.inspect();
 assert.equal(got.byLod.L0,L0_CAP_DEFAULT);
 assert.equal(got.population,600,'the cap removed people');
 // The ones kept at L0 are the nearest.
 const lodOf=p=>layer.crowd.lanes[layer.crowd.state.lane[layer.crowd.indexOf(p.id)]].lod;
 const d=p=>Math.hypot(p.x,p.z),l0=people.filter(p=>lodOf(p)==='L0'),rest=people.filter(p=>lodOf(p)!=='L0'&&d(p)<=HQ_LOD.bands[0].in);
 assert.ok(Math.max(...l0.map(d))<=Math.min(...rest.map(d))+1e-9,'a farther citizen kept full detail over a nearer one');
 assert.ok(rest.every(p=>lodOf(p)==='L1'));
 // Lifting the cap gives full detail back.
 layer.setL0Cap(0);layer.relod();layer.sync(people,cam,0,{time:0});
 assert.equal(layer.crowd.inspect().byLod.L0,uncapped);
});

// The far level L3 (scripts/bake-crowd-l3.mjs): L2's own vertices with about a quarter of its
// triangles, for citizens beyond 70 m; switchable off, and nobody removed either way.
import {withL3} from '../src/life/hq-crowd.mjs';
test('L3: every archetype gets a far level over L2, a quarter of the triangles, used only beyond 70 m',()=>{
 const l3=JSON.parse(readFileSync('public/data/crowd/hq-crowd-l3.json','utf8'));
 const m=withL3(manifest,l3,b=>Buffer.from(b,'base64'));
 for(const a of m.archetypes){
  const l2=a.levels.find(l=>l.name==='L2'),far=a.levels.find(l=>l.name==='L3');
  assert.ok(far,`${a.id} has no L3`);
  assert.equal(far.position.byteOffset,l2.position.byteOffset,'L3 must draw L2 vertices');
  assert.ok(far.triangles<l2.triangles*.3&&far.triangles>l2.triangles*.15,`${a.id}: ${far.triangles} of ${l2.triangles}`);
  assert.ok(far.indexData.every(v=>v<l2.vertices),'an L3 index outside L2');
 }
 // People on a line away from the camera: 50 m is L2, 100 m is L3; with L3 off, both L2.
 const people=[];for(let id=0;id<40;id++){const z=20+id*3;people.push({id,active:true,controlled:false,archetype:'adult',state:'walking',x:0,z,renderX:0,renderZ:z,
  height:0,heading:0,speed:1.3,crossing:null,queueKey:null,edge:3,route:[3]});}
 const layer=createHQLayer(m,bin,{budget:40}),cam={x:0,z:0};
 layer.sync(people,cam,0,{time:0});layer.relod();layer.sync(people,cam,0,{time:0});
 const lodOf=p=>layer.crowd.lanes[layer.crowd.state.lane[layer.crowd.indexOf(p.id)]].lod;
 assert.equal(layer.farLod,true);
 assert.equal(lodOf(people.find(p=>p.z>=50&&p.z<53)),'L2');
 assert.equal(lodOf(people.find(p=>p.z>=100&&p.z<103)),'L3');
 layer.setFarLod(false);layer.sync(people,cam,0,{time:0});
 assert.ok(people.every(p=>lodOf(p)!=='L3'),'L3 still drawn with it off');
 assert.equal(layer.crowd.population,40);
 // Without the file the crowd is the three levels it was.
 assert.equal(createHQLayer(manifest,bin,{budget:8}).farLod,false);
});
