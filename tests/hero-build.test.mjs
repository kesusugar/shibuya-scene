// Gate R1 (owner's recovery pack): the landmark module must build from the real, PLATEAU-merged
// scene data, and QFRONT / MAGNET must actually reach the screen from the reference cameras.
// A PLATEAU roof step once made polygon-clipping throw inside buildHeroScene; the exception took
// every landmark down while the signs stayed up, and no test built the module from real data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera,Raycaster,Vector3,Box3,Group} from 'three';
import {buildHeroScene} from '../src/heroes/render.mjs';
import {HERO_DEFINITIONS} from '../src/heroes/config.mjs';
import {prepareHero} from '../src/heroes/model.mjs';
import {BUILDERS} from '../src/heroes/builders.mjs';
import {buildBuildings} from '../src/buildings/render.mjs';
import {CAMERAS} from '../src/app/foundation.mjs';

const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));
const scene=buildHeroScene(data);

test('R1: every hero builds from the real data with valid geometry',()=>{
 assert.deepEqual(scene.stats.missing??[],[],'no hero source missing');
 assert.deepEqual(scene.stats.failures??[],[],'no hero failed');
 assert.equal(scene.heroes.length,HERO_DEFINITIONS.length);
 assert.deepEqual(scene.heroes.map(h=>h.key).sort(),HERO_DEFINITIONS.map(d=>d.key).sort());
 for(const h of scene.heroes){
  assert.ok(h.masses.length>0&&h.triangles>100,`${h.key}: ${h.triangles} triangles`);
  for(const m of h.masses)assert.ok(m.top>m.bottom&&m.polygon.outer.length>=3&&m.polygon.outer.flat().every(Number.isFinite),`${h.key} ${m.label}`);
 }
 let meshes=0;
 scene.root.traverse(o=>{if(!o.isMesh)return;meshes++;assert.equal(o.visible,true,o.name);
  const p=o.geometry.attributes.position;assert.ok(p.count>0,o.name);
  o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;assert.ok([b.min.x,b.min.y,b.min.z,b.max.x,b.max.y,b.max.z].every(Number.isFinite),o.name);});
 assert.ok(meshes>=8,`${meshes} hero meshes`);
});

test('R1: PLATEAU roof steps are repaired, not dropped, and never break a hero',()=>{
 for(const key of ['magnet','seibuA','seibuB','109']){
  const def=HERO_DEFINITIONS.find(d=>d.key===key),h=prepareHero(data,def);BUILDERS[def.builder](h);
  assert.ok(h.roofStepReport,`${key} has a roof step report`);
  assert.equal(h.roofStepReport.skipped.length,0,`${key} skipped ${JSON.stringify(h.roofStepReport.skipped)}`);
  assert.ok(h.roofStepReport.accepted>0,`${key} keeps its surveyed roof steps`);
 }
 // The case that broke: Seibu B's 44 m and 46 m steps share a footprint corner.
 const seibuB=scene.heroes.find(h=>h.key==='seibuB');
 assert.ok(seibuB.masses.filter(m=>m.label==='plateau-roof').length>=4);
});

// Visibility: rays from the reference cameras to a grid over each landmark's street faces must
// meet that landmark first often enough, with the generic city in place as occluders.
const city=buildBuildings(data,{farCity:false});
const world=new Group();world.add(scene.root,city.root);world.updateMatrixWorld(true);
const targets=[];world.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)targets.push(o);});
function visibleShare(cameraId,heroKey,frame){
 const c=CAMERAS.find(c=>c.id===cameraId),cam=new PerspectiveCamera(c.fov??50,frame[0]/frame[1],.1,2000);
 cam.position.fromArray(c.position);cam.lookAt(new Vector3(...c.target));cam.updateMatrixWorld(true);
 const h=scene.heroes.find(h=>h.key===heroKey),pts=h.masses.flatMap(m=>m.polygon.outer),box=new Box3();
 for(const [x,z] of pts){box.expandByPoint(new Vector3(x,0,z));box.expandByPoint(new Vector3(x,h.height,z));}
 const ray=new Raycaster();let inFrame=0,hit=0,n=0;
 for(let i=0;i<=6;i++)for(let j=1;j<=6;j++){
  // points spread over the box, 1 m inside its faces nearest the camera
  const p=new Vector3(box.min.x+(box.max.x-box.min.x)*i/6,box.max.y*j/7,box.min.z+(box.max.z-box.min.z)*(i%2?0:1)*.999);
  const ndc=p.clone().project(cam);if(Math.abs(ndc.x)>1||Math.abs(ndc.y)>1||ndc.z>1)continue;inFrame++;
  ray.set(cam.position,p.clone().sub(cam.position).normalize());const first=ray.intersectObjects(targets,false)[0];n++;
  if(first&&first.point.x>=box.min.x-1.5&&first.point.x<=box.max.x+1.5&&first.point.z>=box.min.z-1.5&&first.point.z<=box.max.z+1.5&&first.point.y<=h.height+8)hit++;
 }
 return {inFrame,share:n?hit/n:0};
}
for(const [cameraId,frame] of [['ref-a',[1280,960]],['ref-b',[1280,964]],['ref',[1280,720]]])
 for(const key of ['qfront','magnet'])
  test(`R1: ${key} reaches the screen from ${cameraId}`,()=>{
   const v=visibleShare(cameraId,key,frame);
   assert.ok(v.inFrame>=6,`${key} in frame from ${cameraId}: ${v.inFrame} sample points`);
   assert.ok(v.share>=.3,`${key} first-hit share from ${cameraId}: ${v.share.toFixed(2)}`);
  });

test('R1: one landmark failing to build does not take the others down',()=>{
 const broken=structuredClone(data),seibuB=HERO_DEFINITIONS.find(d=>d.key==='seibuB');
 const rec=broken.buildings.find(b=>b.id===seibuB.id);
 // A bow-tie footprint: validateFootprint rejects it, so prepareHero throws for Seibu B only.
 const [a,b,c,d]=rec.polygon.outer;rec.polygon={outer:[a,c,b,d],holes:[]};
 const errors=console.error;console.error=()=>{};
 let result;try{result=buildHeroScene(broken);}finally{console.error=errors;}
 assert.deepEqual(result.stats.failures?.map(f=>f.key),['seibuB']);
 assert.equal(result.heroes.length,HERO_DEFINITIONS.length-1);
 for(const key of ['qfront','magnet','109','seibuA'])assert.ok(result.heroes.find(h=>h.key===key)?.triangles>100,key);
 result.dispose?.();
});
