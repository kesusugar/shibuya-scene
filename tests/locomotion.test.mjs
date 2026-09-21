import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGaitSpace,createGaitBlend,createBodyFacing,LOCOMOTION,turnTo} from '../src/player/locomotion.mjs';
import {PLAYER,createPlayer} from '../src/player/controller.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';

const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const clips=report.clips.map(c=>({name:c.name,duration:c.seconds}));
const ladder=()=>buildGaitSpace(clips,report.gait,report.gaitDetail);
const settle=(blend,speed,frames=20)=>{let w;for(let i=0;i<frames;i++)w=blend.update(speed,1/60);return w;};
const ctx={height:()=>0,solid:()=>false,safe:()=>true,onRoad:()=>false};
const walk=()=>{const p=createPlayer(ctx,{start:[0,0],heading:0});p.place(0,0,0);return p;};

test('the ladder is built from measured stride and contact, in speed order',()=>{
 const rungs=ladder();
 assert.deepEqual(rungs.map(r=>r.name),['Walk','Run','Sprint']);
 for(let i=1;i<rungs.length;i++)assert.ok(rungs[i].speed>rungs[i-1].speed);
 assert.equal(rungs[0].stride,1.3);
 assert.equal(rungs[0].contact,0.108);
});

test('a cycle takes the blended stride divided by the ground speed',()=>{
 // This is the whole point: get it right and the planted foot is stationary on the ground.
 const blend=createGaitBlend(ladder());
 for(const speed of [2.2,3.0,3.6,4.2]){
  const weights=settle(blend,speed);
  let stride=0;
  for(const [name,weight] of weights){
   const rung=blend.ladder.find(r=>r.name===name);
   if(rung)stride+=rung.stride*weight;
  }
  const implied=stride/blend.period;
  assert.ok(Math.abs(implied-speed)/speed<.02,
   `at ${speed} m/s the feet travel ${implied.toFixed(2)} m/s`);
 }
});

test('no clip is ever played at slow motion or double speed',()=>{
 // The defect this replaces: Sprint at 0.51x to make 4.2 m/s, which is not a run at half
 // speed, it is a sprint in slow motion.
 const blend=createGaitBlend(ladder());
 for(const speed of [PLAYER.walk,2.5,3.4,PLAYER.run]){
  const weights=settle(blend,speed);
  for(const [name,weight] of weights){
   if(name==='Idle'||weight<.05)continue;
   const rate=blend.rateFor(name);
   assert.ok(rate>=.78&&rate<=1.45,`${name} at ${speed} m/s plays at ${rate.toFixed(2)}x`);
  }
 }
});

test('both gameplay speeds are carried by Walk and Run; Sprint is out of range',()=>{
 const blend=createGaitBlend(ladder());
 for(const speed of [PLAYER.walk,PLAYER.run]){
  const weights=settle(blend,speed);
  assert.ok(!weights.has('Sprint'),`Sprint is in the blend at ${speed} m/s`);
  assert.ok((weights.get('Walk')??0)+(weights.get('Run')??0)>.98);
 }
 // It is still reachable, so raising the gameplay speed later needs no new plumbing.
 assert.ok((settle(blend,7).get('Sprint')??0)>.3);
});

test('clips are held in phase by their own left-foot contact',()=>{
 const blend=createGaitBlend(ladder());
 settle(blend,3.0);
 for(const name of ['Walk','Run']){
  const rung=blend.ladder.find(r=>r.name===name);
  const local=blend.timeFor(name)/rung.duration;
  // Every clip should be the same distance past its own contact, or a blend puts one foot
  // down while the other is still swinging.
  const since=((local-rung.contact)%1+1)%1;
  const reference=((blend.phase%1)+1)%1;
  assert.ok(Math.abs(since-reference)<1e-6,`${name} is ${since} into the cycle, not ${reference}`);
 }
});

test('speed changes move the blend, not the foot that is down',()=>{
 const blend=createGaitBlend(ladder());
 settle(blend,1.5,40);
 const before=blend.phase;
 blend.update(4.2,1/60);
 const after=blend.phase;
 // One frame of a speed change advances the phase by one frame, not by a reset.
 assert.ok(after-before>0&&after-before<.05,`phase jumped ${after-before}`);
});

test('the first step starts just before a contact, not mid-swing',()=>{
 const blend=createGaitBlend(ladder());
 blend.reset();
 blend.update(1.5,1/60);
 assert.ok(blend.phase>.85||blend.phase<.05,`set off at phase ${blend.phase}`);
});

test('standing lets the camera swing before the body follows it',()=>{
 const facing=createBodyFacing(0);
 for(let i=0;i<30;i++)facing.update(.6,0,1/60);
 assert.equal(facing.heading,0,'the body twitched at a small camera movement');
 for(let i=0;i<60;i++)facing.update(2.4,0,1/60);
 assert.ok(Math.abs(turnTo(facing.heading,2.4))<.1,'the body never caught up');
});

test('a half turn takes about half a second, not three frames',()=>{
 const facing=createBodyFacing(0);
 let frames=0;
 while(Math.abs(turnTo(facing.heading,Math.PI))>.05&&frames<240){facing.update(Math.PI,2,1/60);frames++;}
 const seconds=frames/60;
 assert.ok(seconds>.35&&seconds<.7,`a 180 degree turn took ${seconds.toFixed(2)}s`);
});

test('acceleration is bounded and stopping is not instant',()=>{
 const player=walk();
 player.setTouch({forward:1,strafe:0,running:false});
 const speeds=[];
 for(let i=0;i<40;i++){player.step(1/60);speeds.push(player.state.speed);}
 for(let i=1;i<speeds.length;i++)
  assert.ok((speeds[i]-speeds[i-1])*60<=PLAYER.accelerate+1e-6,'accelerated faster than the limit');
 assert.ok(Math.abs(speeds.at(-1)-PLAYER.walk)<.05,`settled at ${speeds.at(-1)}`);
 player.setTouch({forward:0,strafe:0,running:false});
 let frames=0;
 while(player.state.speed>.05&&frames<120){player.step(1/60);frames++;}
 assert.ok(frames>=6,`stopped in ${frames} frames`);
});

test('a diagonal input walks diagonally rather than sliding sideways',()=>{
 const player=walk();
 player.setTouch({forward:1,strafe:1,running:false});
 for(let i=0;i<90;i++)player.step(1/60);
 const s=player.state;
 // The body ends up facing where it is going, and where it is going is 45 degrees off the
 // camera. Feet pointing one way while the body travels another is the thing to avoid.
 assert.ok(Math.abs(turnTo(s.bodyHeading,s.course))<.05,'the body is not facing its course');
 assert.ok(Math.abs(turnTo(s.course,Math.PI/4))<.05,`course is ${s.course}`);
});

test('a reversal does not happen at full speed',()=>{
 const player=walk();
 player.setTouch({forward:1,strafe:0,running:true});
 for(let i=0;i<120;i++)player.step(1/60);
 const cruising=player.state.speed;
 player.setTouch({forward:-1,strafe:0,running:true});
 let slowest=cruising;
 for(let i=0;i<60;i++){player.step(1/60);slowest=Math.min(slowest,player.state.speed);}
 assert.ok(slowest<cruising*.75,`only dropped to ${slowest.toFixed(2)} from ${cruising.toFixed(2)}`);
});

test('walking into a wall does not leave the legs running',()=>{
 // heading 0 walks toward +z, so the wall goes there.
 const wall={height:()=>0,solid:(x,z)=>z>2,safe:()=>true,onRoad:()=>false};
 const player=createPlayer(wall,{start:[0,0],heading:0});
 player.place(0,0,0);
 player.setTouch({forward:1,strafe:0,running:true});
 for(let i=0;i<180;i++)player.step(1/60);
 assert.ok(player.state.speed<.2,`legs still running at ${player.state.speed.toFixed(2)} m/s`);
});

test('a figure blends rather than switching, and keeps walking through a punch',()=>{
 const figure=createPlayerFigure();
 const state={x:0,y:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true,vehiclePhase:0};
 for(let i=0;i<30;i++)figure.update({...state,speed:2.6},1/60);
 const weights=figure.gait.update(2.6,1/60);
 assert.ok([...weights.values()].filter(w=>w>.05).length>=2,'only one clip is carrying the body');
 figure.update({...state,speed:2.6,attackTime:.3},1/60);
 assert.equal(figure.action,'Punch');
 // The legs are still being driven underneath it.
 assert.ok(figure.gait.period>0);
 figure.dispose();
});

// --- RUN 5: foot IK ------------------------------------------------------------------------

test('stance weight follows the measured contact window, and standing is both feet',async()=>{
 const {stanceWeight}=await import('../src/player/foot-ik.mjs');
 // Standing: duty of one, both feet down for the whole cycle.
 assert.equal(stanceWeight(0,1,0),1);
 assert.equal(stanceWeight(.5,1,.5),1);
 // Walking: the left foot plants at phase 0 and lifts after its duty.
 assert.ok(stanceWeight(.2,.4,0)>.9,'mid-stance is not planted');
 assert.equal(stanceWeight(.5,.4,0),0,'planted during its own swing');
 // The right foot is half a cycle out for a symmetric gait.
 assert.ok(stanceWeight(.7,.4,.5)>.9);
 assert.equal(stanceWeight(.2,.4,.5),0);
 // Edges are faded, or the correction switches on visibly.
 assert.ok(stanceWeight(.005,.4,0)<.2);
});

test('the two-bone solver reaches its target and keeps the knee bending the same way',async()=>{
 const {createTwoBoneSolver}=await import('../src/player/foot-ik.mjs');
 const {Object3D,Bone,Vector3}=await import('three');
 const root=new Object3D();
 const hip=new Bone();hip.position.set(0,1,0);root.add(hip);
 const knee=new Bone();knee.position.set(0,-.45,.02);hip.add(knee);
 const ankle=new Bone();ankle.position.set(0,-.45,0);knee.add(ankle);
 root.updateMatrixWorld(true);
 const solve=createTwoBoneSolver();
 const at=new Vector3();
 for(const target of [[0,.15,0],[0,.30,.15],[.1,.12,-.1],[0,.55,.25]]){
  hip.rotation.set(0,0,0);knee.rotation.set(0,0,0);root.updateMatrixWorld(true);
  solve(hip,knee,ankle,new Vector3(...target));
  ankle.updateWorldMatrix(true,false);
  at.setFromMatrixPosition(ankle.matrixWorld);
  assert.ok(at.distanceTo(new Vector3(...target))<.01,
   `${target} -> ${at.toArray().map(v=>v.toFixed(3))}`);
  // The knee must stay in front. A solver that inverts it is worse than no solver.
  const kneeAt=new Vector3().setFromMatrixPosition(knee.matrixWorld);
  assert.ok(kneeAt.z>-.06,`knee folded backwards to z ${kneeAt.z.toFixed(3)}`);
 }
});

test('a step is read as a step, not a slope',async()=>{
 const {sampleGround}=await import('../src/player/foot-ik.mjs');
 const {Vector3}=await import('three');
 const out={height:0,normal:new Vector3(),edge:false};
 // A kerb: 13 cm over nothing. Standing a sole on that normal looks like a broken ankle.
 sampleGround({heightExact:x=>x<0?.15:.02},-.01,0,out);
 assert.equal(out.edge,true);
 assert.equal(out.normal.y,1);
 // A kerb ramp: 15 cm over 1.5 m, which is the real slope this city has.
 sampleGround({heightExact:x=>Math.max(.02,Math.min(.15,.02+(-x)*.0867))},-.75,0,out);
 assert.equal(out.edge,false);
 assert.ok(out.normal.y>.99&&out.normal.y<1,`normal ${out.normal.toArray()}`);
 assert.ok(Math.abs(out.normal.x)>.001,'a ramp reported perfectly flat');
});

test('foot IK corrects a kerb and leaves flat ground alone',async()=>{
 const {readFileSync}=await import('node:fs');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {humanoidCitizen}=await import('../src/player/character-asset.mjs');
 const {createPlayerFigure}=await import('../src/player/figure.mjs');
 const {Vector3}=await import('three');
 globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const asset=humanoidCitizen(gltf,report);

 // `stand` is the surface the body's own position reports, which is the plane the animation
 // is assumed to have been authored over -- on a kerb that is the pavement the character is
 // standing on, with one foot hanging over the road.
 const run=(surface,stand=surface(0))=>{
  const ctx={heightExact:surface,height:surface,solid:()=>false,safe:()=>true,onRoad:()=>false};
  const figure=createPlayerFigure(asset,undefined,{ctx});
  const state={x:0,y:stand,z:0,heading:0,bodyHeading:0,speed:0,alive:true,vehiclePhase:0};
  for(let i=0;i<90;i++)figure.update(state,1/60);
  figure.root.updateMatrixWorld(true);
  const feet=['ball_l','ball_r'].map(name=>{
   const bone=figure.root.getObjectByName(name);
   bone.updateWorldMatrix(true,false);
   const at=new Vector3().setFromMatrixPosition(bone.matrixWorld);
   return Math.abs(at.y-.0215-surface(at.x));
  });
  const stats={...figure.footIK.stats};
  figure.dispose();
  return {feet,stats};
 };

 // Flat pavement: the animation is already right, so nothing should be solved at all.
 const flat=run(()=>.15);
 assert.equal(flat.stats.solved,0,'solved on flat ground, where there is nothing to correct');

 // Astride a kerb: pavement at 15 cm on one side, road at 2 cm on the other.
 const kerb=run(x=>x<0?.15:.02,.15);
 assert.ok(kerb.stats.solved>0,'did not correct a kerb');
 assert.ok(kerb.stats.pelvisDrop>.12,'the hips did not come down to the lower foot');
 assert.ok(kerb.stats.pelvisDrop<=.17,`the hips dropped ${kerb.stats.pelvisDrop} m`);
 // BOTH feet, not just the low one, and to the same tolerance flat ground gets. Two bugs hid
 // behind a looser bound here and each of them moved a foot by tens of millimetres: the
 // pelvis drop was applied along a Z-up skeleton's local Y, so the hips went backwards
 // instead of down; and the two-bone solve was left free to pitch the planted foot, which
 // drove its toe into the pavement while its ankle sat exactly where it was asked to. A
 // threshold generous enough to pass with either of those in place is not a test.
 const flatError=Math.max(...flat.feet);
 for(const error of kerb.feet)
  assert.ok(error<=flatError+.004,
   `a foot is ${(error*1000).toFixed(1)} mm off its surface astride a kerb, against `+
   `${(flatError*1000).toFixed(1)} mm on flat ground`);
});

test('the pelvis drop is metres downwards in the world, not units along a bone axis',async()=>{
 // This skeleton is authored Z-up -- the pelvis bone's rest position is (0.005, 0.086, 0.877)
 // -- and a wrapper node rotates it into the scene's Y-up. `pelvis.position.y -= drop`
 // therefore moved the hips backwards rather than down, and still reported the drop it meant
 // to make, so every counter agreed with itself while the body was wrong. The only honest
 // check is the world matrix.
 const {readFileSync}=await import('node:fs');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {humanoidCitizen}=await import('../src/player/character-asset.mjs');
 const {createPlayerFigure}=await import('../src/player/figure.mjs');
 const {Vector3}=await import('three');
 globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const asset=humanoidCitizen(gltf,report);
 const kerb=x=>x<0?.15:.02;
 const at=enabled=>{
  const ctx={heightExact:kerb,height:kerb,solid:()=>false,safe:()=>true,onRoad:()=>false};
  const figure=createPlayerFigure(asset,undefined,{ctx});
  figure.footIK.setEnabled(enabled);
  const state={x:0,y:.15,z:0,heading:0,bodyHeading:0,speed:0,alive:true,vehiclePhase:0};
  for(let i=0;i<90;i++)figure.update(state,1/60);
  figure.root.updateMatrixWorld(true);
  const bone=figure.root.getObjectByName('pelvis');
  bone.updateWorldMatrix(true,false);
  const world=new Vector3().setFromMatrixPosition(bone.matrixWorld);
  const drop=figure.footIK.stats.pelvisDrop;
  figure.dispose();
  return {world,drop};
 };
 const off=at(false),on=at(true);
 assert.ok(on.drop>.12,`the solver only asked for ${(on.drop*1000).toFixed(0)} mm`);
 // Down by what it said, to a millimetre, and no sideways or forward drift at all.
 assert.ok(Math.abs((off.world.y-on.world.y)-on.drop)<.001,
  `reported a ${(on.drop*1000).toFixed(1)} mm drop but the hips moved `+
  `${((off.world.y-on.world.y)*1000).toFixed(1)} mm`);
 assert.ok(Math.hypot(off.world.x-on.world.x,off.world.z-on.world.z)<.002,
  'the hips moved horizontally, which is the axis bug wearing a different hat');
});

test('foot IK stands down when the feet are not on anything',async()=>{
 const {readFileSync}=await import('node:fs');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {humanoidCitizen}=await import('../src/player/character-asset.mjs');
 const {createPlayerFigure}=await import('../src/player/figure.mjs');
 globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const asset=humanoidCitizen(gltf,report);
 const ctx={heightExact:x=>x<0?.15:.02,height:x=>x<0?.15:.02,
  solid:()=>false,safe:()=>true,onRoad:()=>false};
 const figure=createPlayerFigure(asset,undefined,{ctx});
 const base={x:0,y:.15,z:0,heading:0,bodyHeading:0,speed:0,alive:true,vehiclePhase:0};
 const settle=state=>{for(let i=0;i<40;i++)figure.update(state,1/60);return figure.footIK.stats.solved;};

 assert.ok(settle(base)>0,'not correcting when it should');
 // Each of these is a state where the feet are deliberately not on the ground.
 assert.equal(settle({...base,alive:false,runOver:.2}),0,'corrected during a knock-down');
 assert.equal(settle({...base,alive:false,runOver:2}),0,'corrected while dead');
 assert.equal(settle({...base,vehiclePhase:.5,vehicleKind:'enter'}),0,'corrected getting into a car');
 assert.equal(settle({...base,vehiclePhase:.5,vehicleKind:'exit'}),0,'corrected getting out of a car');
 assert.ok(settle(base)>0,'did not come back');
 // A teleport drops the correction rather than dragging a foot across the city.
 figure.update({...base,x:40,z:40},1/60);
 assert.equal(figure.footIK.stats.solved,0,'corrected through a teleport');
 figure.dispose();
});

test('foot IK allocates nothing per frame',async()=>{
 const {createTwoBoneSolver,sampleGround}=await import('../src/player/foot-ik.mjs');
 const {Object3D,Bone,Vector3}=await import('three');
 const root=new Object3D();
 const hip=new Bone();hip.position.set(0,1,0);root.add(hip);
 const knee=new Bone();knee.position.set(0,-.45,.02);hip.add(knee);
 const ankle=new Bone();ankle.position.set(0,-.45,0);knee.add(ankle);
 root.updateMatrixWorld(true);
 const solve=createTwoBoneSolver();
 const target=new Vector3(0,.2,.05);
 const out={height:0,normal:new Vector3(),edge:false};
 const ctx={heightExact:(x,z)=>Math.sin(x)*.01+Math.cos(z)*.01};
 const warm=()=>{solve(hip,knee,ankle,target);sampleGround(ctx,.3,.4,out);};
 for(let i=0;i<2000;i++)warm();
 if(!globalThis.gc){return;}   // run with --expose-gc for the strict form
 globalThis.gc();
 const before=process.memoryUsage().heapUsed;
 for(let i=0;i<20000;i++)warm();
 globalThis.gc();
 const growth=process.memoryUsage().heapUsed-before;
 assert.ok(growth<262144,`heap grew ${growth} bytes over 20000 solves`);
});
