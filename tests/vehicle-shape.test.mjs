import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {buildVehicleShape,wheelRadius} from '../src/traffic/vehicle-shape.mjs';
import {createVehicleAsset,adoptVehicleAsset,LAMP} from '../src/player/vehicle-asset.mjs';
import {createVehicleVisual} from '../src/player/vehicle-visual.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {createVehicleShadows} from '../src/traffic/vehicle-shadow.mjs';

const TYPES=Object.keys(VEHICLES).filter(t=>t!=='scooter');

test('a saloon has the proportions of a Tokyo saloon',()=>{
 const asset=createVehicleAsset('sedan');
 asset.root.updateMatrixWorld(true);
 const size=new Box3().setFromObject(asset.root).getSize(new Vector3());
 assert.ok(size.z>4.5&&size.z<4.8,`length ${size.z}`);
 assert.ok(size.x>1.75&&size.x<1.85,`width ${size.x}`);
 assert.ok(size.y>1.4&&size.y<1.55,`height ${size.y}`);
 assert.ok(asset.dimensions.wheelbase>2.6&&asset.dimensions.wheelbase<2.8,
  `wheelbase ${asset.dimensions.wheelbase}`);
 asset.dispose();
});

test('every vehicle sits on the road rather than through it',()=>{
 for(const type of TYPES){
  const asset=createVehicleAsset(type);
  asset.root.updateMatrixWorld(true);
  const box=new Box3().setFromObject(asset.root);
  // The wheels define y=0. A body that dips below it is a car buried in the tarmac.
  assert.ok(box.min.y>-.04,`${type} reaches ${box.min.y.toFixed(3)} below the road`);
  assert.ok(Math.abs(box.min.y)<.12,`${type} floats at ${box.min.y.toFixed(3)}`);
  asset.dispose();
 }
});

test('the body is three boxes, not one: bonnet and boot sit below the beltline',()=>{
 // This is the whole reason the shape was rebuilt. A constant-section body with a cabin on
 // top is a pickup truck, and measuring it is the only way to keep it from coming back.
 const shape=buildVehicleShape('sedan');
 const paint=shape.geometry.paint;
 const position=paint.attributes.position;
 const height=z=>{let top=-Infinity;
  for(let i=0;i<position.count;i++)
   if(Math.abs(position.getZ(i)-z)<.12)top=Math.max(top,position.getY(i));
  return top;};
 const cabin=height(0),bonnet=height(1.9),boot=height(-1.9);
 assert.ok(cabin>bonnet+.12,`cabin ${cabin.toFixed(2)} is not above bonnet ${bonnet.toFixed(2)}`);
 assert.ok(cabin>boot+.02,`cabin ${cabin.toFixed(2)} is not above boot ${boot.toFixed(2)}`);
});

test('the windscreen is raked further than the backlight',()=>{
 // A saloon leans its screen back much further than its rear window. The other way round is
 // what made an earlier attempt read as a van.
 const shape=buildVehicleShape('sedan');
 const position=shape.geometry.glass.attributes.position;
 const extreme=sign=>{let best=null;
  for(let i=0;i<position.count;i++){
   const z=position.getZ(i)*sign;
   if(!best||z>best.z)best={z,y:position.getY(i)};
  }return best;};
 const roofAt=sign=>{let best=-Infinity;
  for(let i=0;i<position.count;i++)
   if(position.getY(i)>1.3&&position.getZ(i)*sign>best)best=position.getZ(i)*sign;
  return best;};
 const front=extreme(1),rear=extreme(-1);
 // Both are measured in the sign-flipped frame, so each is how far the glass runs forward or
 // back of where the roof ends -- the horizontal run of the screen.
 const rakeFront=front.z-roofAt(1),rakeRear=rear.z-roofAt(-1);
 assert.ok(rakeFront>rakeRear,`windscreen run ${rakeFront.toFixed(2)} vs backlight ${rakeRear.toFixed(2)}`);
});

test('every anchor the game and RUN 10 need is present and on the driver side',()=>{
 for(const type of TYPES){
  const asset=createVehicleAsset(type);
  for(const name of ['frontLeftWheel','frontRightWheel','rearLeftWheel','rearRightWheel'])
   assert.ok(asset.wheels[name],`${type} has no ${name}`);
  for(const name of ['driverSeat','driverDoor','driverEntry','driverExit'])
   assert.ok(asset.anchors[name],`${type} has no ${name}`);
  // Right-hand drive would mirror these; what matters is that they agree with each other.
  assert.ok(asset.anchors.driverSeat.position.x<0,`${type} seat is on the wrong side`);
  assert.ok(asset.anchors.driverEntry.position.x<asset.anchors.driverDoor.position.x,
   `${type} entry point is inside the car`);
  const radius=wheelRadius(type);
  assert.ok(Math.abs(asset.wheels.frontLeftWheel.position.y-radius)<1e-6,
   `${type} front wheel does not rest on its own radius`);
  asset.dispose();
 }
});

test('the wheels turn, steer and take the suspension without the body taking them with it',()=>{
 const visual=createVehicleVisual();
 const slot={brake:false,blinker:0};
 const state={active:true,type:'sedan',x:3,y:.5,z:-4,heading:.4,speed:8,steering:.6,
  steerAngle:.3,pitch:.05,roll:-.04,wheelCompression:[.02,-.03,.05,-.01],slot};
 visual.update(state,1/60);
 const asset=visual.asset;
 const front=asset.wheels.frontLeftWheel,rear=asset.wheels.rearLeftWheel;
 assert.ok(Math.abs(front.rotation.x)>0,'wheels do not roll');
 assert.ok(Math.abs(front.rotation.y)>.1,'front wheels do not steer');
 assert.equal(rear.rotation.y,0,'rear wheels steer');
 assert.notEqual(front.position.y,rear.position.y,'suspension does not reach the wheels');
 // Lean belongs to the shell. If it reached the wheels they would leave the road on a camber.
 assert.equal(asset.body.rotation.x,state.pitch);
 assert.equal(asset.body.rotation.z,state.roll);
 const before=front.rotation.x;
 visual.update({...state,speed:8},1/60);
 assert.notEqual(front.rotation.x,before,'wheel rotation does not accumulate with speed');
 visual.dispose();
});

test('brake and indicator come from the simulation slot, and amber wins',()=>{
 const visual=createVehicleVisual();
 const base={active:true,type:'sedan',x:0,y:0,z:0,heading:0,speed:2,steering:0,
  wheelCompression:[0,0,0,0]};
 const tail=()=>visual.asset.root.getObjectByName('traffic-player-rear').material.color.getHex();
 visual.update({...base,slot:{brake:false,blinker:0}},1/60);
 assert.equal(tail(),LAMP.off);
 visual.update({...base,slot:{brake:true,blinker:0}},1/60);
 assert.equal(tail(),LAMP.brake);
 visual.update({...base,slot:{brake:true,blinker:-1}},1/60);
 assert.equal(tail(),LAMP.indicator,'an indicator must not be hidden by a brake light');
 visual.dispose();
});

test('the door the driver uses opens and the other one does not',()=>{
 const visual=createVehicleVisual();
 visual.update({active:true,type:'taxi',x:0,y:0,z:0,heading:0,speed:0,steering:0,
  wheelCompression:[0,0,0,0],slot:{},doorSide:-1,doorPhase:.9},1/60);
 const open=visual.asset.root.getObjectByName('player-vehicle-door--1');
 const shut=visual.asset.root.getObjectByName('player-vehicle-door-1');
 assert.ok(Math.abs(open.rotation.y)>.5,'the driver door did not open');
 assert.equal(shut.rotation.y,0,'the far door opened too');
 visual.dispose();
});

test('a vehicle is grounded by five shadows: the floorpan and four tyres',()=>{
 const shadows=createVehicleShadows(5);
 shadows.begin();
 shadows.add({x:1,y:.2,z:2,heading:.5},{width:1.78,length:4.6,radius:.33},
  [[-.7,.33,1.4],[.7,.33,1.4],[-.7,.33,-1.4],[.7,.33,-1.4]]);
 shadows.end();
 assert.equal(shadows.drawn,5);
 assert.equal(shadows.mesh.count,5);
 // One draw call for all of it, or the grounding costs more than the car.
 assert.ok(shadows.mesh.isInstancedMesh);
 shadows.dispose();
});

test('an adopted baked graph and a freshly built one agree about the car',()=>{
 const built=createVehicleAsset('sedan');
 const adopted=adoptVehicleAsset('sedan',built.root,
  {dimensions:built.dimensions,anchors:built.anchorPoints});
 assert.equal(adopted.type,built.type);
 assert.deepEqual(adopted.dimensions,built.dimensions);
 for(const name of ['frontLeftWheel','rearRightWheel'])assert.ok(adopted.wheels[name]);
 // Adopting rebuilds materials rather than trusting the serialised snapshot, so the brake
 // lights of a baked car can still be switched.
 adopted.setRear(true,0);
 assert.equal(adopted.root.getObjectByName('traffic-player-rear').material.color.getHex(),LAMP.brake);
 adopted.dispose();
});

test('the deferred wrapper announces its root once the pack lands',async()=>{
 // Whoever registers the vehicle for day-night and shadows has to wait: the root is empty
 // until the pack arrives, and both systems walk a root exactly once.
 const {createDeferredVehicleVisual}=await import('../src/player/deferred-vehicle-visual.mjs');
 const {Group}=await import('three');
 let resolve;const deferred=createDeferredVehicleVisual(()=>new Promise(r=>{resolve=r;}));
 const seen=[];
 deferred.onReady(root=>seen.push(root));
 deferred.update({active:true,type:'sedan',slot:{}});
 await Promise.resolve();
 assert.equal(seen.length,0,'announced before the pack landed');
 const built=new Group();
 resolve({createVehicleVisual({onAssetReady}={}){const root=new Group();
  onAssetReady?.(built);return {root,update(){},hide(){},dispose(){}};}});
 await deferred.whenSettled();
 assert.equal(seen.length,1);
 // The asset's own root, not the wrapper's: the wrapper outlives a change of vehicle type and
 // the systems that register a root unregister it when it leaves the graph.
 assert.equal(seen[0],built);
 deferred.dispose();
});

// Found during RUN 8 browser QA, and not by any test: the vehicle shadow's vertex shader
// declared `attribute vec3 instanceColor` itself. A ShaderMaterial is given three.js's own
// vertex prefix, which already declares that attribute under the same `#ifdef`, so the
// program failed to compile the moment an instance colour existed -- the scene raised its
// shader-error banner and every car lost its shadow to `useProgram: program not valid`.
//
// The whole scene has to be rendered for a browser to catch it, so it is pinned here instead:
// no custom shader may declare an attribute the renderer already injects.
test('the vehicle shadow shader does not redeclare what three.js injects',()=>{
 const shadows=createVehicleShadows(4);
 const vertex=shadows.mesh.material.vertexShader;
 // three.js injects each of these into every non-raw vertex shader, under its own #ifdef.
 for(const name of ['instanceColor','instanceMatrix','position','normal','uv'])
  assert.equal(new RegExp(`attribute\\s+\\w+\\s+${name}\\s*;`).test(vertex),false,
   `the shader declares ${name}, which three.js already declares -- the program will not compile`);
 // ...but it must still USE instanceColor, guarded, or the falloff exponent never arrives.
 assert.ok(vertex.includes('USE_INSTANCING_COLOR'),'the guard was removed with the declaration');
 assert.ok(/vShape\s*=\s*instanceColor/.test(vertex),'the instance colour is no longer read');
 shadows.dispose();
});
