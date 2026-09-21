import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {createOccupancy,OCCUPANT,DRIVER} from '../src/traffic/occupancy.mjs';
import {createSeatedDrivers} from '../src/traffic/drivers.mjs';

const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core});

// ---------------------------------------------------------------- the model itself

test('a seat holds one occupant, and the model refuses a second',()=>{
 const o=createOccupancy(4);
 assert.equal(o.seat(0),true);
 assert.equal(o.seat(0),false,'two drivers were seated in one car');
 assert.equal(o.takeSeat(0),false,'the player sat on top of a driver');
 assert.equal(o.read(0).type,OCCUPANT.TRAFFIC_DRIVER);
});

test('the player cannot occupy two vehicles',()=>{
 const o=createOccupancy(4);
 assert.equal(o.takeSeat(1),true);
 assert.equal(o.playerVehicle,1);
 assert.equal(o.takeSeat(2),true);
 // Taking a second wheel gives up the first rather than owning both.
 assert.equal(o.playerVehicle,2);
 assert.equal(o.read(1).type,OCCUPANT.NONE,'the player was left in two cars at once');
 const seen=o.inspect();
 assert.equal(seen.player,1);
});

test('a driver cannot be skipped straight out of the seat',()=>{
 const o=createOccupancy(4);
 o.seat(0);
 // This is the instant takeover RUN 9 exists to remove, expressed as a state transition.
 assert.equal(o.extract(0),null,'a seated driver was extracted with no extraction');
 assert.equal(o.advance(0,DRIVER.BEING_EXTRACTED),false,'ALERT was skipped');
 assert.equal(o.advance(0,DRIVER.ALERT),true);
 assert.equal(o.extract(0),null,'an alerted driver was extracted with no extraction');
 assert.equal(o.advance(0,DRIVER.BEING_EXTRACTED),true);
 assert.ok(o.extract(0),'a driver being extracted could not be extracted');
});

test('extraction empties the seat and hands back the same identity',()=>{
 const o=createOccupancy(4);
 o.seat(0);
 const before=o.read(0);
 o.advance(0,DRIVER.ALERT);o.advance(0,DRIVER.BEING_EXTRACTED);
 const out=o.extract(0);
 assert.equal(out.driverId,before.driverId,'a different person got out than got in');
 assert.equal(out.seed,before.seed,'the driver changed appearance on the way out');
 assert.equal(o.isEmpty(0),true,'the seat was still occupied after extraction');
 assert.equal(o.hasDriver(0),false);
 // And the player may now have it -- but only now.
 assert.equal(o.takeSeat(0),true);
});

test('an aborted extraction leaves the driver seated, not half-out',()=>{
 const o=createOccupancy(4);
 o.seat(0);o.advance(0,DRIVER.ALERT);o.advance(0,DRIVER.BEING_EXTRACTED);
 assert.equal(o.abort(0),true);
 assert.equal(o.read(0).state,DRIVER.SEATED);
 assert.equal(o.hasDriver(0),true,'aborting lost the driver');
 assert.equal(o.extract(0),null,'an aborted extraction could still be completed');
});

test('a despawned vehicle takes its driver with it',()=>{
 const o=createOccupancy(4);
 o.seat(0);
 assert.equal(o.drivers,1);
 o.vacate(0);
 assert.equal(o.drivers,0);
 assert.equal(o.isEmpty(0),true);
 // The next car to use the slot is not born with a stranger in it.
 assert.equal(o.seat(0),true);
 assert.notEqual(o.read(0).driverId,-1);
});

// ---------------------------------------------------------------- against the real traffic

test('ordinary moving traffic has drivers, and parked cars do not',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const active=sim.pool.filter(v=>v.active);
 const moving=active.filter(v=>!v.parked&&!v.controlled);
 const parked=active.filter(v=>v.parked);
 assert.ok(moving.length>20,`only ${moving.length} moving vehicles`);
 assert.ok(parked.length>0,'no parked vehicles to check');
 for(const v of moving)
  assert.equal(sim.occupancy.hasDriver(v.id),true,`moving vehicle ${v.id} had nobody driving it`);
 for(const v of parked)
  assert.equal(sim.occupancy.hasDriver(v.id),false,`parked vehicle ${v.id} had a driver`);
 assert.equal(sim.occupancy.drivers,moving.length);
 sim.dispose();
});

test('occupancy survives a despawn, a respawn and a tier change without leaking',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const count=()=>sim.pool.filter(v=>v.active&&!v.parked&&!v.controlled).length;

 const victim=sim.pool.find(v=>v.active&&!v.parked);
 const id=victim.id;
 assert.equal(sim.occupancy.hasDriver(id),true);
 sim.despawn(victim,'test');
 assert.equal(sim.occupancy.hasDriver(id),false,'a despawned car kept its driver');

 sim.setTier('low');sim.update(1/30);
 assert.equal(sim.occupancy.drivers,count(),'tier change leaked or lost drivers');
 sim.setTier('high');sim.update(1/30);
 assert.equal(sim.occupancy.drivers,count(),'tier change leaked or lost drivers');

 // Nothing inactive is holding a seat.
 for(const v of sim.pool)if(!v.active)
  assert.equal(sim.occupancy.hasDriver(v.id),false,`inactive slot ${v.id} held a driver`);
 sim.dispose();
});

test('a car whose driver was dragged out does not quietly get a new one',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const v=sim.pool.find(v=>v.active&&!v.parked&&!v.controlled);
 sim.occupancy.advance(v.id,DRIVER.ALERT);
 sim.occupancy.advance(v.id,DRIVER.BEING_EXTRACTED);
 assert.ok(sim.occupancy.extract(v.id));
 v.driverless=true;                       // what the carjack sets when it pulls someone out
 for(let i=0;i<60;i++)sim.update(1/30);
 assert.equal(sim.occupancy.hasDriver(v.id),false,
  'a new driver appeared in the seat while the player was walking round to it');
 sim.dispose();
});

test('a hundred seconds of traffic never produces an invalid seat',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 for(let frame=0;frame<3000;frame++){
  sim.update(1/30);
  if(frame%250)continue;
  const seen=sim.occupancy.inspect();
  assert.equal(seen.player,0,'a player seat appeared with no player');
  assert.ok(seen.drivers>=0&&seen.drivers<=seen.capacity);
  for(const v of sim.pool){
   if(!v.active&&sim.occupancy.hasDriver(v.id))assert.fail(`inactive slot ${v.id} held a driver`);
   if(v.parked&&sim.occupancy.hasDriver(v.id))assert.fail(`parked slot ${v.id} held a driver`);
  }
 }
 sim.dispose();
});

// ---------------------------------------------------------------- the seated driver visual

test('seated drivers cost three draw calls, no skeletons and no mixers, at any traffic count',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const drivers=createSeatedDrivers();
 // Look from where the traffic actually is, not from the origin, or the budget never loads.
 const busy=sim.pool.find(v=>v.active&&!v.parked&&sim.occupancy.hasDriver(v.id));
 assert.ok(busy,'no driven traffic to look at');
 drivers.update(sim,{x:busy.x,z:busy.z});
 const seen=drivers.inspect();
 assert.ok(seen.drawn>0,'nobody was drawn in a street full of driven cars');
 assert.equal(seen.skeletons,0,'RUN 7 architecture broken: a driver grew a skeleton');
 assert.equal(seen.mixers,0,'RUN 7 architecture broken: a driver grew an AnimationMixer');
 assert.equal(seen.drawCalls,3,'a driver should not cost its own batch');
 // Three meshes, whatever the count -- the instancing is the whole point.
 assert.equal(Object.keys(drivers.meshes).length,3);
 for(const m of Object.values(drivers.meshes))assert.ok(m.isInstancedMesh);
 drivers.dispose();sim.dispose();
});

test('the driver layer is bounded by distance, not by population',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const drivers=createSeatedDrivers();
 const busy=sim.pool.find(v=>v.active&&!v.parked&&sim.occupancy.hasDriver(v.id));
 const near=drivers.update(sim,{x:busy.x,z:busy.z});
 // Somewhere with no road under it at all.
 const far=drivers.update(sim,{x:9000,z:9000});
 assert.ok(near>0);
 assert.equal(far,0,'drivers were drawn on the other side of the world');
 assert.ok(drivers.inspect().drawn<=drivers.inspect().capacity,'the budget was exceeded');
 drivers.dispose();sim.dispose();
});

test('a driver keeps one face for as long as they keep one car',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const v=sim.pool.find(x=>x.active&&!x.parked&&sim.occupancy.hasDriver(x.id));
 const first=sim.occupancy.read(v.id);
 for(let i=0;i<300;i++)sim.update(1/30);
 if(sim.occupancy.hasDriver(v.id)&&v.active){
  const later=sim.occupancy.read(v.id);
  assert.equal(later.driverId,first.driverId,'the driver was silently replaced mid-journey');
  assert.equal(later.seed,first.seed,'the driver changed appearance mid-journey');
 }
 sim.dispose();
});

test('the driver layer disposes without leaving anything in the scene',()=>{
 const sim=new TrafficSimulation(graph,{tier:'high',street});
 sim.update(1/30);
 const drivers=createSeatedDrivers();
 const root=drivers.root;
 assert.equal(root.children.length,3);
 drivers.dispose();
 assert.equal(root.children.length,0,'the driver meshes outlived their layer');
 drivers.dispose();                                   // a second dispose must be harmless
 assert.equal(drivers.update(sim,{x:0,z:0}),0,'a disposed layer still drew');
 sim.dispose();
});
