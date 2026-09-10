import {Group,BoxGeometry,CapsuleGeometry,SphereGeometry,ConeGeometry,InstancedMesh,MeshStandardMaterial,Object3D,Color,DynamicDrawUsage,BufferGeometry,Float32BufferAttribute,LineSegments,LineBasicMaterial} from 'three';
import {triangleCount} from '../geo/geometry.mjs';
import {buildGroundModel} from '../ground/model.mjs';
import {buildBuildingModel} from '../buildings/model.mjs';
import {buildStationModel} from '../station/model.mjs';
import {buildDetailModel} from '../station-detail/model.mjs';
import {buildStreetscapeModel} from '../streetscape/model.mjs';
import {buildPedestrianNetwork} from './network.mjs';
import {CrowdSimulation} from './simulation.mjs';
import {ARCHETYPES,POOL_SIZE} from './config.mjs';

export function buildCrowd(data,options={}){
 const ground=options.ground??buildGroundModel(data),generic=options.generic??buildBuildingModel(data),core=options.core??buildStationModel(data,{ground,generic});
 // Use HIGH obstacle envelopes even when the visual profile hides minor props.
 const street=options.street?.tier==='high'?options.street:buildStreetscapeModel(data,{tier:'high',ground,generic,core});
 const detail=options.detail?.tier==='high'?options.detail:buildDetailModel(data,{tier:'high',ground,generic,core});
 const network=options.network??buildPedestrianNetwork(data,{ground,generic,core,street,detail}),sim=options.sim??new CrowdSimulation(network,options),root=new Group();root.name='s10-life';
 const material=new MeshStandardMaterial({color:0xffffff,roughness:.9}),headMaterial=new MeshStandardMaterial({color:0xffffff,roughness:.7}),hairMaterial=new MeshStandardMaterial({color:0xffffff,roughness:.8});
 const capsule=(radius,length,cap,radial)=>{const g=new CapsuleGeometry(radius,length,cap,radial);g.scale(1/(radius*2),1/(length+radius*2),1/(radius*2));return g;};
 const geometry={torso:capsule(.5,.5,3,8),head:new SphereGeometry(1,11,8),hair:new SphereGeometry(1,11,7),arms:capsule(.5,2,2,6),legs:capsule(.5,2,2,6),bag:new BoxGeometry(1,1,1),umbrella:new ConeGeometry(1,.35,8),hat:new BoxGeometry(1,1,1)};
 const bodyPositions=geometry.torso.attributes.position;for(let i=0;i<bodyPositions.count;i++){const taper=.94+.12*bodyPositions.getY(i);bodyPositions.setX(i,bodyPositions.getX(i)*taper);bodyPositions.setZ(i,bodyPositions.getZ(i)*taper);}geometry.torso.computeVertexNormals();
 const meshes={};for(const [key,g] of Object.entries(geometry)){const m=new InstancedMesh(g,key==='head'?headMaterial:key==='hair'?hairMaterial:material,POOL_SIZE*(['arms','legs'].includes(key)?2:1));m.instanceMatrix.setUsage(DynamicDrawUsage);m.frustumCulled=false;m.name='crowd-'+key;root.add(m);meshes[key]=m;}
 const obj=new Object3D(),color=new Color(),counts={},stats={geometries:8,materials:3,textures:0,batches:8,triangles:0,debugBatches:0};let disposed=false,reportClock=0;
 let debug=null;if(options.debug){const lines=[];for(const e of network.edges){if(e.id%2&&!e.crossingId)continue;const a=network.nodes[e.from],b=network.nodes[e.to];if(e.points){for(let i=1;i<e.points.length;i++)lines.push(e.points[i-1][0],.2,e.points[i-1][1],e.points[i][0],.2,e.points[i][1]);}else lines.push(a.x,.2,a.z,b.x,.2,b.z);}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(lines,3));debug=new LineSegments(g,new LineBasicMaterial({color:0xf8b5d1,depthTest:false}));debug.name='s10-walkable-path-grid';root.add(debug);stats.debugBatches=1;
 }
 function part(key,p,lx,y,lz,w,h,d,hex,swing=0){const c=Math.cos(p.heading),s=Math.sin(p.heading);obj.position.set(p.renderX+c*lx+s*lz,p.height+y,p.renderZ-s*lx+c*lz);obj.rotation.set(0,p.heading,0);obj.rotateX(swing);obj.scale.set(w,h,d);obj.updateMatrix();const i=counts[key]++;meshes[key].setMatrixAt(i,obj.matrix);color.setHex(hex);meshes[key].setColorAt(i,color);}
 function sync(dt=0){for(const k of Object.keys(meshes))counts[k]=0;for(const p of sim.pool){if(!p.active)continue;const def=ARCHETYPES[p.archetype],h=def.height*(.96+(p.id%5)*.02),w=def.width,walk=p.speed>.05,phase=p.animationTime*(walk?7:1)+p.phase,fidelity=p.lod==='near'?1:p.lod==='mid'?.65:.15,swing=walk?Math.sin(phase)*.38*fidelity:Math.sin(phase)*.025,bob=walk?Math.abs(Math.cos(phase))*.024*fidelity:Math.sin(phase)*.008;
   const blend=dt?Math.min(1,dt*(p.lod==='far'?10:25)):1;p.renderX+=(p.x-p.renderX)*blend;p.renderZ+=(p.z-p.renderZ)*blend;
   const shirt=def.colors[p.color],skin=[0xdfb994,0xba8868,0xeac6a7,0xc99c7e][p.id%4],hair=def.gray?0xaeb0ac:[0x25282a,0x4e3a30,0x706051][p.id%3],legs=p.archetype==='pastel'?0x8b859c:0x354151;
   part('torso',p,0,h*.59+bob,0,w,h*.31,w*.55,shirt);
   part('head',p,0,h*.87+bob,0,h*.135,h*.13,h*.125,skin);
   part('hair',p,0,h*.92+bob,-.015,h*.143,h*.065,h*.132,def.hood?shirt:hair);
   for(const side of [-1,1]){part('legs',p,side*w*.22,h*.22+bob,Math.sin(swing*side)*h*.16,w*.25,h*.42,w*.29,legs,swing*side);part('arms',p,side*w*.64,h*.59+bob,-Math.sin(swing*side)*h*.12,w*.22,h*.32,w*.26,shirt,-swing*side);}
   if(def.bag)part('bag',p,w*.65,h*.43,-.02,w*.37,h*.17,w*.42,p.id%2?0x9a7960:0x4e5557);
   if(def.umbrella)part('umbrella',p,.1,h+ .18,0,.52,1,.52,shirt);
   if(def.hat)part('hat',p,0,h*.96+bob,.02,w*.68,.065,w*.7,0xc9b596);
  }
  stats.triangles=0;stats.batches=0;for(const [k,m] of Object.entries(meshes)){m.count=counts[k];if(m.count)stats.batches++;stats.triangles+=m.count*triangleCount(geometry[k]);m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
  reportClock+=dt;if(reportClock>=1||!dt){reportClock=0;Object.assign(stats,network.stats,sim.snapshot(options.debug));}
 }
 sync();return {root,network,sim,stats,meshes,update(dt,camera){if(disposed)return;if(camera)sim.setCamera(camera.x,camera.z);sim.update(dt);sync(dt);},setTier(t){sim.setTier(t);sync();},dispose(){if(disposed)return;disposed=true;sim.dispose();for(const m of Object.values(meshes))m.dispose();for(const g of Object.values(geometry))g.dispose();material.dispose();headMaterial.dispose();hairMaterial.dispose();debug?.geometry.dispose();debug?.material.dispose();root.removeFromParent();root.clear();}};
}
