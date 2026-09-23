import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {createPlayerVehicle,CAR} from '../src/player/vehicle.mjs';
import {pose} from '../src/traffic/path.mjs';

// Codex's handoff raised the player car's padding against static solids so the bonnet stops
// entering station walls and platforms that render ahead of their map solids. At .55 on every
// side it made 35 of 2,467 sedan lane poses undrivable -- road the AI's own sedans use. The
// cost was entirely lateral, so the margin is split: ends .55, sides .25. This drives the REAL
// player vehicle onto every lane pose rather than restating its collision test.
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core});
const flat={height:()=>0,safe:()=>true,solid:()=>false,onRoad:()=>true};

test('the bonnet keeps Codex’s margin and the sides keep a real one',()=>{
 assert.equal(CAR.solidEnd,.55,'the bonnet margin that fixed the station facade was lost');
 assert.ok(CAR.solidSide>=.2,'the side margin fell back to nothing');
 assert.ok(CAR.solidSide<CAR.solidEnd,'the side margin is the one that cost lanes; it must be the smaller');
});

test('every sedan lane pose on the map is drivable by the player',()=>{
 const sim=new TrafficSimulation(graph,{tier:'low',street});
 for(const v of sim.pool)if(v.active)sim.despawn(v,'test');   // judge solids, not other cars
 sim.refill=()=>{};
 const car=createPlayerVehicle(sim,flat);
 const slot=sim.pool[0];
 Object.assign(slot,{active:true,type:'sedan',x:0,z:0,heading:0,speed:0,parked:true});
 assert.ok(car.reserve(slot));car.state.active=true;
 const p={},blocked=[];let samples=0;
 for(const lane of graph.lanes){
  if(!lane.allowed.includes('sedan'))continue;
  for(let d=car.def.length/2;d<lane.path.length-car.def.length/2;d+=3){
   pose(lane.path,d,p);
   if(Math.abs(p.x)>242||Math.abs(p.z)>242)continue;   // off the playable map: the world edge, not a solid
   samples++;
   Object.assign(car.state,{x:p.x,z:p.z,heading:p.heading,course:p.heading,speed:0,lateral:0,yawRate:0,stalled:false});
   car.step(1/60,{forward:0,strafe:0});
   if(car.state.stalled)blocked.push([+p.x.toFixed(1),+p.z.toFixed(1)]);
  }
 }
 assert.ok(samples>2000,`only ${samples} lane poses sampled`);
 assert.deepEqual(blocked,[],`${blocked.length} lane poses the AI drives are walls to the player: ${JSON.stringify(blocked.slice(0,5))}`);
 sim.dispose();
});
