import {Group,Mesh,MeshStandardMaterial,BoxGeometry,CylinderGeometry} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {VEHICLES} from '../src/traffic/config.mjs';

// Only the controlled vehicle uses this close-range model. Its simulation slot remains authoritative.
export function createVehicleVisual(){
 const root=new Group();root.name='player-vehicle-detail';let type=null,geometries=[],materials=[],wheels=[],doors=[],body=null,lastSpeed=0,pitch=0,roll=0,spin=0,disposed=false,slot=null;
 function clear(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();geometries=[];materials=[];wheels=[];doors=[];}
 function build(next){clear();type=next;const d=VEHICLES[type];body=new Group();body.name='vehicle-body';root.add(body);
  const mat=(color,roughness=.4,metalness=.15)=>{const m=new MeshStandardMaterial({color,roughness,metalness});materials.push(m);return m;};
  const paint=mat(d.color,.28,.35),glass=mat(0x173543,.19,.42),rubber=mat(0x121820,.95,0),chrome=mat(0xabb6bc,.25,.8),lamp=mat(0xfff0cd),tail=mat(0xaa1818);
  lamp.emissive.setHex(0xffe7b0);lamp.emissiveIntensity=.65;tail.emissive.setHex(0xff2520);tail.emissiveIntensity=.4;
  const add=(g,m,parent,x,y,z)=>{geometries.push(g);const o=new Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;};
  const box=(w,h,l,m,x,y,z,r=.06)=>add(new RoundedBoxGeometry(w,h,l,2,Math.min(r,h*.25)),m,body,x,y,z);
  const van=['van','bus'].includes(type),truck=type==='keiTruck',cabL=d.length*(van?.78:truck?.36:.48),cabZ=truck?d.length*.24:-d.length*.06;
  box(d.width,.52,d.length,paint,0,.59,0,.12);
  box(d.width*.88,.25,d.length*.96,paint,0,.86,0,.08);
  box(d.width*.78,Math.max(.25,d.height-1.02),cabL,glass,0,(1+d.height)/2-.05,cabZ,.1);
  box(d.width*.82,.10,cabL*.94,paint,0,d.height-.05,cabZ,.04);
  for(const side of [-1,1]){
   box(.055,Math.max(.25,d.height-1.02),.09,paint,side*d.width*.39,(1+d.height)/2-.05,cabZ);
   box(.10,.05,.23,chrome,side*d.width*.505,.79,-.18);
   box(.19,.13,.27,paint,side*d.width*.53,1.03,cabZ+cabL*.35);
   const door=new Group();door.name=`player-vehicle-door-${side}`;door.position.set(side*d.width*.5,.92,cabZ+cabL*.08);body.add(door);
   add(new RoundedBoxGeometry(.045,.52,Math.max(.48,cabL*.52),2,.025),paint,door,0,0,0);doors.push({pivot:door,side});
   box(d.width*.22,.12,.055,lamp,side*d.width*.32,.72,d.length/2+.02);
   box(d.width*.22,.12,.055,tail,side*d.width*.32,.72,-d.length/2-.02);
  }
  box(d.width*.55,.14,.055,rubber,0,.44,d.length/2+.03);
  box(.36,.12,.025,chrome,0,.48,-d.length/2-.045);
  const radius=type==='bus'?.42:.30;
  for(const z of [-d.length*.31,d.length*.31])for(const side of [-1,1]){
   const pivot=new Group();pivot.name='vehicle-wheel-'+wheels.length;pivot.position.set(side*(d.width/2-.02),radius,z);root.add(pivot);
   const g=new CylinderGeometry(radius,radius,.18,18);g.rotateZ(Math.PI/2);add(g,rubber,pivot,0,0,0);
   const hub=new CylinderGeometry(radius*.55,radius*.55,.19,10);hub.rotateZ(Math.PI/2);add(hub,chrome,pivot,0,0,0);wheels.push({pivot,front:z>0});
  }
  if(type==='taxi')box(.48,.16,.24,lamp,0,d.height+.08,0);
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
  spin+=state.speed*dt/.3;for(const [i,w] of wheels.entries()){w.pivot.position.y=(type==='bus'?.42:.30)+(state.wheelCompression?.[i]??0);const steer=state.steerAngle??state.steering*.35;w.pivot.rotation.set(spin,w.front?-steer*(1+(i%2?1:-1)*steer*.17):0,0,'YXZ');}
 },hide(){root.visible=false;if(slot)slot.playerVisual=false;slot=null;},dispose(){if(disposed)return;disposed=true;if(slot)slot.playerVisual=false;clear();root.removeFromParent();}};
}
