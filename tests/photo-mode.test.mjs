// Backlog ②: photo mode -- a free camera over a stopped, slowed or running world; the body takes no
// input while it has the view; stills are named by the time they were taken.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoMode,captureName,PHOTO} from '../src/player/photo-mode.mjs';
import {createPlayer} from '../src/player/controller.mjs';

const from={x:10,y:1.7,z:-5,yaw:0,pitch:0,fov:50};

test('photo mode: entering stops the world; T cycles stopped → 1/4 → running; leaving gives the world back',()=>{
 const p=createPhotoMode();
 assert.equal(p.timeScale,1,'the world stopped before photo mode');
 assert.equal(p.enter(from),true);assert.equal(p.active,true);
 assert.equal(p.timeScale,0);
 assert.equal(p.cycleTime(),.25);assert.equal(p.timeScale,.25);
 assert.equal(p.cycleTime(),1);assert.equal(p.cycleTime(),0);
 assert.equal(p.enter(from),false,'entered twice');
 assert.equal(p.exit(),true);assert.equal(p.timeScale,1);assert.equal(p.exit(),false);
 // Entering again starts stopped, whatever it was left at.
 p.enter(from);p.cycleTime();p.exit();p.enter(from);assert.equal(p.timeScale,0);
});

test('photo mode: the camera starts where the game camera was and flies where it looks',()=>{
 const p=createPhotoMode();p.enter(from);
 assert.deepEqual({x:p.pose.x,y:p.pose.y,z:p.pose.z,fov:p.pose.fov},{x:10,y:1.7,z:-5,fov:50});
 // Forward at yaw 0 is +z (the game's heading); one second at the flying speed.
 p.update(1/30,{});for(let i=0;i<30;i++)p.update(1/30,{forward:1});
 assert.ok(Math.abs(p.pose.z-(-5+PHOTO.speed))<.05&&Math.abs(p.pose.x-10)<1e-6,`flew to ${p.pose.x},${p.pose.z}`);
 // Strafe right at yaw 0 is -x (as the game's), and level whatever the pitch.
 p.look(0,-400);const y=p.pose.y;
 for(let i=0;i<30;i++)p.update(1/30,{strafe:1});
 assert.ok(p.pose.x<10-PHOTO.speed*.9&&Math.abs(p.pose.y-y)<1e-6);
 // Shift is faster, Alt slower.
 const q=createPhotoMode();q.enter(from);q.update(1,{forward:1,fast:true});
 const r=createPhotoMode();r.enter(from);r.update(.1,{forward:1,slow:true});
 assert.ok(q.pose.z-from.z>r.pose.z-from.z);
 // The target is a metre along the view.
 const t=p.target();assert.ok(Math.abs(Math.hypot(t.x-p.pose.x,t.y-p.pose.y,t.z-p.pose.z)-1)<1e-6);
});

test('photo mode: kept near the scene, above the ground, and within its zoom, tilt and pitch',()=>{
 const p=createPhotoMode({ground:()=>2});p.enter({...from,y:.5});
 p.update(1/30,{});assert.ok(p.pose.y>=2+PHOTO.floor-1e-9,'under the ground');
 for(let i=0;i<600;i++)p.update(.1,{forward:1,fast:true});
 assert.ok(Math.hypot(p.pose.x-from.x,p.pose.z-from.z)<=PHOTO.reach+1e-6,'flew off the map');
 p.zoom(-100);assert.equal(p.pose.fov,PHOTO.fov.min);p.zoom(100);assert.equal(p.pose.fov,PHOTO.fov.max);
 for(let i=0;i<100;i++)p.update(.1,{roll:1});assert.equal(p.pose.roll,PHOTO.roll.max);
 p.look(0,-1e5);assert.equal(p.pose.pitch,PHOTO.pitch);
 // Leaving and entering again starts level.
 p.exit();p.enter(from);assert.equal(p.pose.roll,0);
});

test('photo mode: a still is named by when it was taken',()=>{
 assert.equal(captureName(new Date(2026,8,28,21,5,9)),'shibuya-20260928-210509.png');
});

test('photo mode: while it has the view the body takes no input, and has it back after',()=>{
 const flat={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
 const pl=createPlayer(flat,{start:[0,0],heading:0,bodies:null});
 pl.setTouch({forward:1});pl.suspend(true);
 assert.deepEqual(pl.input(),{forward:0,strafe:0,running:false,handbrake:false});
 for(let i=0;i<30;i++)pl.step(1/30);
 assert.ok(Math.hypot(pl.state.x,pl.state.z)<1e-6,'the body walked in photo mode');
 // What was held is let go; given back, it listens again.
 pl.suspend(false);assert.equal(pl.input().forward,0,'a held stick outlived photo mode');
 pl.setTouch({forward:1});for(let i=0;i<30;i++)pl.step(1/30);
 assert.ok(pl.state.z>.1,'the body did not walk after photo mode');
});
