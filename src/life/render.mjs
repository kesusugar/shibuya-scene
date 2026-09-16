import {Group,BoxGeometry,CapsuleGeometry,SphereGeometry,ConeGeometry,CylinderGeometry,TorusGeometry,InstancedMesh,MeshStandardMaterial,Object3D,Color,DynamicDrawUsage,BufferGeometry,Float32BufferAttribute,LineSegments,LineBasicMaterial} from 'three';
import {triangleCount,merge} from '../geo/geometry.mjs';
import {buildGroundModel} from '../ground/model.mjs';
import {buildBuildingModel} from '../buildings/model.mjs';
import {buildStationModel} from '../station/model.mjs';
import {buildDetailModel} from '../station-detail/model.mjs';
import {buildStreetscapeModel} from '../streetscape/model.mjs';
import {buildPedestrianNetwork} from './network.mjs';
import {CrowdSimulation} from './simulation.mjs';
import {ARCHETYPES,POOL_SIZE,BODY_VARIANTS,HAIR_VARIANTS,ACCESSORY_TARGETS} from './config.mjs';

const BODY_COLORS=[0x343f51,0x556173,0x29374b,0xc38966,0x738d88,0xb7b9c4,0xb98193,0xa2b29b,0xdac5a5,0xd8adbf,0xc2b9dd,0xb1d7ce];
const SKIN_COLORS=[0xdfb994,0xba8868,0xeac6a7,0xc99c7e];
const HAIR_COLORS=[0x25282a,0x4e3a30,0x706051,0xaeb0ac];
// The played agent occupies slot 0, which by id would draw BODY_COLORS[0] -- the palette's
// darkest navy, and so the one outfit that disappears into a night crowd. None of the twelve
// crowd colours is saturated, so a saturated one reads instantly without looking painted on.
// This is the only thing the player changes here: the overhead marker is a player affordance
// rather than a pedestrian body part, so it lives with the player and leaves the crowd's
// thirteen geometry pools and three materials as they were.
export const PLAYER_SHIRT=0xff3b1f;
// Arms and legs are merged into one body geometry -- that is what makes two thousand
// pedestrians affordable -- so a gait here is whole-body lean and rise, nothing swings. At
// crowd amplitude that reads as a slide on the one figure the camera is locked to, so the
// played agent leans and rises further. It is the same cycle, only larger.
const PLAYER_GAIT=2.6;
const rank=(id,salt=0)=>(id*37+salt)%POOL_SIZE;
function pickVariant(id,profiles,salt=0){let r=rank(id,salt);for(const profile of profiles){if(r<profile.count)return profile.key;r-=profile.count;}return profiles.at(-1).key;}
function transformed(g,scale,position){g.scale(...scale);g.translate(...position);return g;}
function bodyGeometry(index){
 const widths=[.88,1,.78,.94],shoulders=[.92,1.08,.82,1.02],parts=[];
 parts.push(transformed(new CapsuleGeometry(.5,.44,2,7),[widths[index],.54,.58],[0,.58,0]));
 for(const side of [-1,1]){
  parts.push(transformed(new CapsuleGeometry(.5,.55,1,5),[.19,.38,.18],[side*.2,.19,0]));
  parts.push(transformed(new CapsuleGeometry(.5,.58,1,5),[.16,.35,.16],[side*.31*shoulders[index],.55,0]));
 }
 const result=merge(parts);parts.forEach(g=>g.dispose());result.computeVertexNormals();return result;
}
function hairGeometry(index){
 if(index===0)return transformed(new SphereGeometry(1,9,6),[1,.56,.92],[0,.25,-.04]);
 if(index===1){const g=new SphereGeometry(1,9,6),p=g.attributes.position;for(let i=0;i<p.count;i++)if(p.getY(i)<-.15)p.setY(i,-.15);g.scale(1,.62,.95);g.translate(0,.2,-.04);g.computeVertexNormals();return g;}
 const brim=transformed(new CylinderGeometry(1,1,.12,9),[1,.5,.92],[0,.06,0]),cap=transformed(new SphereGeometry(1,8,5),[.82,.48,.8],[0,.28,-.02]),result=merge([brim,cap]);brim.dispose();cap.dispose();result.computeVertexNormals();return result;
}
function suitcaseGeometry(){const box=transformed(new BoxGeometry(1,1,1),[.7,.9,.32],[0,.43,0]),handle=transformed(new TorusGeometry(.24,.055,4,8,Math.PI),[1,1,1],[0,.98,0]),result=merge([box,handle]);box.dispose();handle.dispose();return result;}

export function buildCrowd(data,options={}){
 const ground=options.ground??buildGroundModel(data),generic=options.generic??buildBuildingModel(data),core=options.core??buildStationModel(data,{ground,generic});
 const street=options.street?.tier==='high'?options.street:buildStreetscapeModel(data,{tier:'high',ground,generic,core});
 const detail=options.detail?.tier==='high'?options.detail:buildDetailModel(data,{tier:'high',ground,generic,core});
 const network=options.network??buildPedestrianNetwork(data,{ground,generic,core,street,detail}),sim=options.sim??new CrowdSimulation(network,options),root=new Group();root.name='r1-crowd';
 const material=new MeshStandardMaterial({color:0xffffff,roughness:.9}),headMaterial=new MeshStandardMaterial({color:0xffffff,roughness:.7}),hairMaterial=new MeshStandardMaterial({color:0xffffff,roughness:.8});
 const geometry={};for(let i=0;i<BODY_VARIANTS.length;i++)geometry[BODY_VARIANTS[i].key]=bodyGeometry(i);geometry.head=new SphereGeometry(1,10,7);for(let i=0;i<HAIR_VARIANTS.length;i++)geometry[HAIR_VARIANTS[i].key]=hairGeometry(i);
 Object.assign(geometry,{phone:new BoxGeometry(1,1,1),bag:new BoxGeometry(1,1,1),cane:new CylinderGeometry(1,1,1,6),suitcase:suitcaseGeometry(),umbrella:new ConeGeometry(1,.35,8)});
 const capacities={...Object.fromEntries(BODY_VARIANTS.map(v=>[v.key,v.count])),head:POOL_SIZE,...Object.fromEntries(HAIR_VARIANTS.map(v=>[v.key,v.count])),...ACCESSORY_TARGETS};
 const meshes={};for(const [key,g] of Object.entries(geometry)){const m=new InstancedMesh(g,key==='head'?headMaterial:key.startsWith('hair')?hairMaterial:material,capacities[key]);m.instanceMatrix.setUsage(DynamicDrawUsage);m.frustumCulled=false;m.name='crowd-'+key;root.add(m);meshes[key]=m;}
 const obj=new Object3D(),color=new Color(),counts={},stats={geometries:Object.keys(geometry).length,materials:3,textures:0,batches:0,triangles:0,debugBatches:0,bodyCounts:{},hairCounts:{},accessories:{}};let disposed=false,reportClock=0;
 let debug=null;if(options.debug){const lines=[];for(const e of network.edges){if(e.id%2&&!e.crossingId)continue;const a=network.nodes[e.from],b=network.nodes[e.to];if(e.points){for(let i=1;i<e.points.length;i++)lines.push(e.points[i-1][0],.2,e.points[i-1][1],e.points[i][0],.2,e.points[i][1]);}else lines.push(a.x,.2,a.z,b.x,.2,b.z);}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(lines,3));debug=new LineSegments(g,new LineBasicMaterial({color:0xf8b5d1,depthTest:false}));debug.name='r1-walkable-path-grid';root.add(debug);stats.debugBatches=1;
 }
 function part(key,p,lx,y,lz,w,h,d,hex,tilt=0){const c=Math.cos(p.heading),s=Math.sin(p.heading);obj.position.set(p.renderX+c*lx+s*lz,p.height+y,p.renderZ-s*lx+c*lz);obj.rotation.set(tilt,p.heading,0);obj.scale.set(w,h,d);obj.updateMatrix();const i=counts[key]++;meshes[key].setMatrixAt(i,obj.matrix);color.setHex(hex);meshes[key].setColorAt(i,color);}
 function hasAccessory(p,key){return rank(p.id,{phone:211,bag:433,cane:677,suitcase:929,umbrella:1217}[key])<ACCESSORY_TARGETS[key];}
 function sync(dt=0){for(const k of Object.keys(meshes))counts[k]=0;for(const p of sim.pool){if(!p.active)continue;const def=ARCHETYPES[p.archetype],h=def.height*(.96+(p.id%5)*.02),w=def.width*(1.06+(p.id%7)*.015),walk=p.speed>.05,phase=p.animationTime*(walk?7:1)+p.phase,fidelity=p.lod==='near'?1:p.lod==='mid'?.65:.15,gait=p.controlled?PLAYER_GAIT:1,sway=(walk?Math.sin(phase)*.035*fidelity:Math.sin(phase)*.012)*gait,bob=(walk?Math.abs(Math.cos(phase))*.024*fidelity:Math.sin(phase)*.008)*gait;
   const blend=dt?Math.min(1,dt*(p.lod==='far'?10:25)):1;p.renderX+=(p.x-p.renderX)*blend;p.renderZ+=(p.z-p.renderZ)*blend;
   const body=pickVariant(p.id,BODY_VARIANTS),hair=pickVariant(p.id,HAIR_VARIANTS,307),shirt=p.controlled?PLAYER_SHIRT:BODY_COLORS[p.id%BODY_COLORS.length],skin=SKIN_COLORS[p.id%SKIN_COLORS.length],hairColor=def.gray?HAIR_COLORS[3]:HAIR_COLORS[p.id%3];
   part(body,p,0,h*.02+bob,0,w,h*.78,w*.58,shirt,sway);
   part('head',p,0,h*.82+bob,0,h*.15,h*.145,h*.14,skin,sway*.5);
   part(hair,p,0,h*.865+bob,0,h*.16,h*.15,h*.15,def.hood?shirt:hairColor,sway*.5);
   if(hasAccessory(p,'phone'))part('phone',p,w*.43,h*.59+bob,-w*.28,w*.15,h*.16,w*.05,0x303843);
   if(hasAccessory(p,'bag'))part('bag',p,w*.55,h*.37+bob,.02,w*.36,h*.2,w*.4,p.id%2?0x9a7960:0x4e5557);
   if(hasAccessory(p,'cane'))part('cane',p,w*.48,h*.19,0,w*.055,h*.38,w*.055,0x8c7354,-.16);
   if(hasAccessory(p,'suitcase'))part('suitcase',p,-w*.64,h*.02,.08,w*.5,h*.38,w*.52,p.id%2?0x596579:0x6e4d45);
   if(hasAccessory(p,'umbrella'))part('umbrella',p,.08,h*.99,0,.38,.62,.38,shirt);
  }
  stats.triangles=0;stats.batches=0;for(const [k,m] of Object.entries(meshes)){m.count=counts[k];if(m.count)stats.batches++;stats.triangles+=m.count*triangleCount(geometry[k]);m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
  stats.bodyCounts=Object.fromEntries(BODY_VARIANTS.map(v=>[v.key,counts[v.key]]));stats.hairCounts=Object.fromEntries(HAIR_VARIANTS.map(v=>[v.key,counts[v.key]]));stats.accessories=Object.fromEntries(Object.keys(ACCESSORY_TARGETS).map(k=>[k,counts[k]]));stats.instanceCounts={...counts};
  reportClock+=dt;if(reportClock>=1||!dt){reportClock=0;Object.assign(stats,network.stats,sim.snapshot(options.debug));}
 }
 sync();return {root,network,sim,stats,meshes,update(dt,camera){if(disposed)return;if(camera)sim.setCamera(camera.x,camera.z);sim.update(dt);sync(dt);},setTier(t){sim.setTier(t);sync();},dispose(){if(disposed)return;disposed=true;sim.dispose();for(const m of Object.values(meshes))m.dispose();for(const g of Object.values(geometry))g.dispose();material.dispose();headMaterial.dispose();hairMaterial.dispose();debug?.geometry.dispose();debug?.material.dispose();root.removeFromParent();root.clear();}};
}
