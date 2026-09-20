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
