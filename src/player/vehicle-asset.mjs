// What a vehicle is, so that what a vehicle looks like can change without the game noticing.
//
// The same split RUN 2 made for characters. The physics body is the source of truth -- position,
// heading, speed, steer angle, pitch, roll and a four-point suspension all come out of
// vehicle-dynamics.mjs and none of it is recomputed here. The visual body follows, and it is
// addressed through named anchors rather than by index into a build order:
//
//   body, frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel
//   driverSeat, driverDoor, driverEntry, driverExit      (for RUN 10 and RUN 11)
//
// An asset can be built from the shape generator or adopted from a scene graph that was baked
// offline, and both produce the same object, so the bake script and the game share one
// definition of what the graph looks like instead of two copies that drift.
import {Group,Mesh,MeshStandardMaterial,Object3D} from 'three';
import {buildVehicleShape} from '../traffic/vehicle-shape.mjs';
import {VEHICLES} from '../traffic/config.mjs';

/** Rear lamp colours. Amber wins over red, because an indicator is the one you must not miss. */
export const LAMP=Object.freeze({off:0x4a1216,brake:0xff2a22,indicator:0xffa32b});

// Mesh names are load-bearing. day-night.mjs ramps emissives by name at dusk and look.mjs
// records shadow-casting at registration; matching the names traffic already uses means the
// player's car lights up on exactly the curve every other car does, with no second tuning pass.
const NAMES={paint:'vehicle-paint',glass:'vehicle-glass',dark:'vehicle-dark',plate:'vehicle-plate',
 lamp:'traffic-player-front',tail:'traffic-player-rear',tyre:'vehicle-tyre',rim:'vehicle-rim'};
const WHEELS=['rearLeftWheel','rearRightWheel','frontLeftWheel','frontRightWheel'];
/** Kept from the previous model, because the vehicle transition already opens doors by this name. */
const doorName=side=>`player-vehicle-door-${side}`;
const SEATS=['driverSeat','driverDoor','driverEntry','driverExit'];

function materialsFor(paintColour){
 return {
  paint:new MeshStandardMaterial({color:paintColour,roughness:.34,metalness:.42}),
  // Glass is transparent enough to show the cabin behind it and glossy enough to catch a
  // street light, which is what keeps it separate from near-black paint after dark. It writes
  // depth on purpose: a car's glasshouse is a closed tube, and sorting its two sides per frame
  // costs more than the small error of letting the near pane hide the far one.
  glass:new MeshStandardMaterial({color:0x33505f,roughness:.04,metalness:.16,
   transparent:true,opacity:.52,emissive:0x1a2c38,emissiveIntensity:.5}),
  dark:new MeshStandardMaterial({color:0x1b2026,roughness:.86,metalness:.06}),
  plate:new MeshStandardMaterial({color:0xe8e6dd,roughness:.7,metalness:0}),
  lamp:new MeshStandardMaterial({color:0xfff2d6,emissive:0xffe5ae,emissiveIntensity:.14}),
  tail:new MeshStandardMaterial({color:LAMP.off,emissive:LAMP.off,emissiveIntensity:.25}),
  tyre:new MeshStandardMaterial({color:0x0e1114,roughness:.96,metalness:0}),
  rim:new MeshStandardMaterial({color:0x9aa4ab,roughness:.31,metalness:.78})
 };
}

/** Wrap a built graph. `owned` says whether this asset may dispose the geometry it was handed. */
function wrap(type,root,materials,{owned,dimensions,anchors}){
 const body=root.getObjectByName('vehicle-body');
 if(!body)throw new Error(`vehicle asset ${type} has no body`);
 const wheels={};for(const name of WHEELS)wheels[name]=root.getObjectByName(name);
 const seats={};for(const name of SEATS)seats[name]=root.getObjectByName(name);
 for(const [name,node] of Object.entries(wheels))
  if(!node)throw new Error(`vehicle asset ${type} has no ${name}`);
 const doors=[-1,1].map(side=>({side,pivot:root.getObjectByName(doorName(side))})).filter(d=>d.pivot);
 let disposed=false,triangles=0;
 const geometries=new Set();
 root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);
  triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;
  // Recorded before the fidelity system registers the root, which preserves whatever it finds.
  o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;});
 return {
  type,root,body,wheels,doors,anchors:seats,dimensions,anchorPoints:anchors,
  materials:Object.values(materials),triangles,
  /** Repaint without rebuilding: one material, one instance, one colour. */
  setPaint(hex){materials.paint.color.setHex(hex);},
  /** Swing the door on the side the driver is using; the other one stays shut. */
  setDoor(side,phase){
   const open=Math.max(0,Math.min(1,phase??0));
   for(const door of doors)door.pivot.rotation.y=door.side*(door.side===side?open:0)*1.05;
  },
  /** Brake beats nothing, an indicator beats a brake. */
  setRear(brake,indicator){
   const hex=indicator?LAMP.indicator:brake?LAMP.brake:LAMP.off;
   materials.tail.color.setHex(hex);materials.tail.emissive.setHex(hex);
  },
  dispose(){
   if(disposed)return;disposed=true;
   Object.values(materials).forEach(m=>m.dispose());
   if(owned)geometries.forEach(g=>g.dispose());
   root.removeFromParent();root.clear();
  }
 };
}

/** Build one from the shape generator. This is what the bake script runs. */
export function createVehicleAsset(type,{detail=1,paint=null}={}){
 const shape=buildVehicleShape(type,{detail});
 const materials=materialsFor(paint??VEHICLES[type].color);
 const root=new Group();root.name='vehicle-'+type;
 // The shell hangs off its own node so body lean can be applied without tilting the wheels,
 // which stay on the road because the suspension already told them where the road is.
 const body=new Group();body.name='vehicle-body';root.add(body);
 for(const [part,geometry] of Object.entries(shape.geometry)){
  const mesh=new Mesh(geometry,materials[part]);mesh.name=NAMES[part];body.add(mesh);
 }
 for(const name of WHEELS){
  const pivot=new Group();pivot.name=name;pivot.position.fromArray(shape.anchors[name]);
  const tyre=new Mesh(shape.wheel.rubber,materials.tyre);tyre.name=NAMES.tyre;
  const rim=new Mesh(shape.wheel.rim,materials.rim);rim.name=NAMES.rim;
  // A right-hand wheel is the left one mirrored, so the dish faces out on both sides.
  if(name.includes('Right'))pivot.scale.x=-1;
  pivot.add(tyre,rim);root.add(pivot);
 }
 for(const name of SEATS){
  const node=new Object3D();node.name=name;node.position.fromArray(shape.anchors[name]);root.add(node);
 }
 for(const {side,hinge,panel} of shape.doors??[]){
  const pivot=new Group();pivot.name=doorName(side);pivot.position.fromArray(hinge);
  pivot.add(new Mesh(panel,materials.paint));body.add(pivot);
 }
 return wrap(type,root,materials,{owned:true,dimensions:shape.dimensions,anchors:shape.anchors});
}

/**
 * Adopt a graph that was baked offline.
 *
 * The baked JSON carries geometry and node names but not materials worth keeping -- a
 * serialised material is a snapshot, and this one has to be repainted and have its brake lights
 * switched. So the graph is kept and the materials are rebuilt from the same definitions the
 * generator uses, which is also what stops the baked path and the live path drifting apart.
 */
export function adoptVehicleAsset(type,root,{paint=null,dimensions=null,anchors=null}={}){
 const materials=materialsFor(paint??VEHICLES[type].color);
 const byName=new Map(Object.entries(NAMES).map(([part,name])=>[name,part]));
 root.traverse(o=>{
  if(!o.isMesh)return;
  const part=byName.get(o.name);
  if(part)o.material=materials[part];
 });
 const points=anchors??{};
 if(!dimensions){
  const d=VEHICLES[type],front=root.getObjectByName('frontLeftWheel');
  dimensions={length:d.length,width:d.width,height:d.height,
   wheelbase:front?front.position.z*2:d.length*.6,radius:front?front.position.y:.33};
 }
 return wrap(type,root,materials,{owned:false,dimensions,anchors:points});
}
