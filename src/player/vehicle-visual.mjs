import {Group,ObjectLoader} from 'three';
import vehiclePack from './generated/vehicles.mjs';

// Only the controlled vehicle uses this close-range model. Its simulation slot remains authoritative.
export function createVehicleVisual(){
 const root=new Group();root.name='player-vehicle-detail';let type=null,geometries=[],materials=[],wheels=[],doors=[],body=null,lastSpeed=0,pitch=0,roll=0,spin=0,disposed=false,slot=null;
 function clear(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();geometries=[];materials=[];wheels=[];doors=[];}
 function build(next){clear();type=next;
  const loaded=new ObjectLoader().parse(vehiclePack.models[type]);
  for(const child of [...loaded.children])root.add(child);
  body=root.getObjectByName('vehicle-body');
  root.traverse(o=>{if(o.isMesh){geometries.push(o.geometry);materials.push(o.material);}if(o.name.startsWith('vehicle-wheel-'))wheels.push({pivot:o,front:o.position.z>0});if(o.name.startsWith('player-vehicle-door-'))doors.push({pivot:o,side:Number(o.name.split('door-')[1])});});
 }
 return {root,update(state,dt=0){if(disposed)return;
  if(slot&&slot!==state?.slot)slot.playerVisual=false;slot=state?.slot;
  // Scooters keep their existing two-wheel model.
  if(!state?.active||state.type==='scooter'){root.visible=false;if(slot)slot.playerVisual=false;return;}
  if(type!==state.type){build(state.type);lastSpeed=state.speed;pitch=0;roll=0;spin=0;}root.visible=true;if(slot)slot.playerVisual=true;
  const accel=dt>0?(state.speed-lastSpeed)/dt:0;lastSpeed=state.speed;
  const a=1-Math.exp(-10*dt);pitch+=(Math.max(-.055,Math.min(.055,accel*.005))-pitch)*a;
  roll+=(Math.max(-.055,Math.min(.055,state.steering*state.speed*.006))-roll)*a;
  body.rotation.set(state.pitch??pitch,0,state.roll??roll);root.position.set(state.x,state.y+.025,state.z);root.rotation.y=state.heading;
  const open=Math.max(0,Math.min(1,state.doorPhase??0));for(const door of doors)door.pivot.rotation.y=door.side*(state.doorSide===door.side?open:0)*1.05;
  spin+=state.speed*dt/.3;for(const [i,w] of wheels.entries()){w.pivot.position.y=(type==='bus'?.42:.30)+(state.wheelCompression?.[i]??0)+w.pivot.position.x*Math.sin(state.roll??0)-w.pivot.position.z*Math.sin(state.pitch??0);const steer=state.steerAngle??state.steering*.35;w.pivot.rotation.set(spin,w.front?-steer*(1+(i%2?1:-1)*steer*.17):0,0,'YXZ');}
 },hide(){root.visible=false;if(slot)slot.playerVisual=false;slot=null;},dispose(){if(disposed)return;disposed=true;if(slot)slot.playerVisual=false;clear();root.removeFromParent();}};
}
