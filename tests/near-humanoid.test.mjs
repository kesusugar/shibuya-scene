import test from 'node:test';
import assert from 'node:assert/strict';
import {NEAR_LIMITS,HUMANOID_LIMITS,NEAR_IK_LIMITS,createNearCharacters}
 from '../src/life/near-characters.mjs';
import {WARDROBE} from '../src/player/character-asset.mjs';

const channels=hex=>[(hex>>16)&255,(hex>>8)&255,hex&255];
const distance=(a,b)=>{const x=channels(a),y=channels(b);
 return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);};

test('the humanoid and foot IK budgets are bounded by the pool itself',()=>{
 for(const tier of Object.keys(NEAR_LIMITS)){
  assert.ok(HUMANOID_LIMITS[tier]<=NEAR_LIMITS[tier],
   `${tier}: more humanoids than near slots`);
  // Only a humanoid has the joints the solver needs, so IK can never exceed the humanoids.
  assert.ok(NEAR_IK_LIMITS[tier]<=HUMANOID_LIMITS[tier],
   `${tier}: more foot IK than humanoids`);
 }
 // LOW is the tier that must stay cheapest; it gets neither.
 assert.equal(HUMANOID_LIMITS.low,0);
 assert.equal(NEAR_IK_LIMITS.low,0);
});

test('the pool reports what it deployed, and stays within its own limits',async()=>{
 const pool=createNearCharacters('high');
 const before=pool.inspect();
 assert.equal(before.limit,NEAR_LIMITS.high);
 assert.equal(before.humanoidLimit,HUMANOID_LIMITS.high);
 assert.equal(before.ikLimit,NEAR_IK_LIMITS.high);
 assert.equal(before.humanAssetReady,false,'no humanoid until one is handed over');
 assert.equal(before.humanoidsActive,0);
 // Without a humanoid asset the pool must still work -- that is the fallback path a session
 // which never finishes loading the character takes.
 const people=[];
 for(let id=0;id<40;id++)
  people.push({id,active:true,archetype:'adult',x:id*.4,z:0,heading:0,speed:1,
   renderX:id*.4,renderZ:0,height:0,reactionUntil:-1});
 // Many frames, not one. The pool grows by a slot per frame and every slot is a skeleton and
 // a mixer, so an unbounded growth condition does not show up until it has been running for a
 // while -- which is exactly when it matters.
 let selected;
 for(let frame=0;frame<400;frame++)selected=pool.update(people,{x:0,z:0},1/60,frame/60);
 assert.ok(selected.size<=NEAR_LIMITS.high,'more bodies than the pool allows');
 const after=pool.inspect();
 assert.equal(after.humanoidsActive,0,'no humanoids should exist without the asset');
 assert.ok(after.capacity<=NEAR_LIMITS.high,
  `the pool grew to ${after.capacity} slots against a limit of ${NEAR_LIMITS.high}`);
 assert.equal(after.footIK,0);
 pool.dispose();
});

test('the pool stays bounded once the humanoid asset arrives',async()=>{
 // This is the case the bound exists for, and the earlier version of this test could not
 // reach it: the growth condition that can run away is "a candidate wants a humanoid and
 // every free slot is baked", which requires a humanoid asset to exist at all. Without one
 // the pool simply never takes that branch, and a broken bound passes unnoticed.
 const {readFileSync}=await import('node:fs');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {humanoidCitizen}=await import('../src/player/character-asset.mjs');
 globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const asset=humanoidCitizen(gltf,report);

 const pool=createNearCharacters('high');
 pool.setHumanAsset(asset);
 const people=[];
 for(let id=0;id<40;id++)
  people.push({id,active:true,archetype:'adult',x:id*.4,z:0,heading:0,speed:1,
   renderX:id*.4,renderZ:0,height:0,reactionUntil:-1});
 // Rotate who is nearest, so slots are released and re-taken by different people and the
 // humanoid/baked composition has to churn. This is the hardest case the pool sees, and what
 // it pins is the budgets -- capacity, humanoid count, foot IK count -- holding under churn.
 for(let frame=0;frame<500;frame++){
  for(const p of people){
   const angle=(p.id*.7+frame*.05);
   p.x=p.renderX=Math.cos(angle)*(4+(p.id%5));
   p.z=p.renderZ=Math.sin(angle)*(4+(p.id%5));
  }
  pool.update(people,{x:0,z:0},1/60,frame/60);
 }
 const after=pool.inspect();
 assert.ok(after.capacity<=NEAR_LIMITS.high,
  `the pool grew to ${after.capacity} slots against a limit of ${NEAR_LIMITS.high}`);
 assert.ok(after.humanoidsActive>0,'the humanoid asset was never used');
 assert.ok(after.humanoidsActive<=HUMANOID_LIMITS.high,
  `${after.humanoidsActive} humanoids against a budget of ${HUMANOID_LIMITS.high}`);
 assert.ok(after.footIK<=NEAR_IK_LIMITS.high,
  `${after.footIK} foot IK slots against a budget of ${NEAR_IK_LIMITS.high}`);
 // Without a ground context no slot may take foot IK at all.
 assert.equal(after.footIK,0,'foot IK without a ground query');
 pool.dispose();
});

test('a pool with no focus releases everything',()=>{
 const pool=createNearCharacters('high');
 const people=[{id:1,active:true,archetype:'adult',x:0,z:0,heading:0,speed:0,
  renderX:0,renderZ:0,height:0,reactionUntil:-1}];
 pool.update(people,{x:0,z:0},1/60,0);
 const released=pool.update(people,null,1/60,0);
 assert.equal(released.size,0,'a pool without a focus must hold nothing');
 pool.dispose();
});

test('the player’s shirt is far from every citizen shirt',async()=>{
 // Read the citizen wardrobe out of the module source rather than exporting it just for a
 // test: what is being pinned is the colours in the file.
 const {readFileSync}=await import('node:fs');
 const source=readFileSync('src/life/near-characters.mjs','utf8');
 const tops=[...source.matchAll(/\{top:0x([0-9a-f]{6})/g)].map(m=>parseInt(m[1],16));
 assert.ok(tops.length>=6,`expected a wardrobe, found ${tops.length} entries`);
 for(const top of tops)
  assert.ok(distance(top,WARDROBE.top)>60,
   `citizen top #${top.toString(16)} is too close to the player's #${WARDROBE.top.toString(16)}`);
});
