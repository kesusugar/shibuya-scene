import {Group,InstancedMesh,IcosahedronGeometry,MeshBasicMaterial,Object3D,Color,DynamicDrawUsage} from 'three';
export function createVehicleEffects(){
 const root=new Group();root.name='player-effects';const obj=new Object3D(),color=new Color();let cursor=0,emit=0,disposed=false;
 const geometry=new IcosahedronGeometry(1,0),material=new MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.32,depthWrite:false});
 const mesh=new InstancedMesh(geometry,material,72);mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;root.add(mesh);
 const particles=Array.from({length:72},()=>({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:0,smoke:true}));
 const spawn=(state,spark=false)=>{const i=cursor++%particles.length,p=particles[i],s=Math.sin(state.heading),c=Math.cos(state.heading),seed=Math.sin(cursor*127.1)*.5+.5;
  Object.assign(p,{life:spark?.35:1.7,max:spark?.35:1.7,x:state.x+s*1.5,y:state.y+.9,z:state.z+c*1.5,vx:Math.sin(cursor*2.4)*(spark?3:.35),vz:Math.cos(cursor*2.4)*(spark?3:.35),vy:spark?1.5:1.1,size:spark?.05:.13+seed*.08,smoke:!spark,dark:state.damage>.7});};
 // RUN 11.4: a low puff of road dust where a body met the car -- movement and weight rather than
 // more blood. Shares the same 72-particle pool, so it cannot add a draw call or grow.
 const dust=(x,y,z,intensity=.7)=>{const n=3+Math.round(3*intensity);for(let k=0;k<n;k++){const i=cursor++%particles.length,p=particles[i],a=cursor*2.4;
  Object.assign(p,{life:.9,max:.9,x:x+Math.sin(a)*.3,y:y+.12,z:z+Math.cos(a)*.3,vx:Math.sin(a)*(.6+intensity),vz:Math.cos(a)*(.6+intensity),vy:.35,size:.1+.06*intensity,smoke:true,dark:false});}};
 return {root,dust,impact(state){for(let i=0;i<12;i++)spawn(state,true);},update(dt,state){if(disposed)return;root.visible=true;
  if(state?.active&&state.damage>.4){emit+=dt;while(emit>.12){emit-=.12;spawn(state);}}else emit=0;
  let count=0;for(const p of particles){if(p.life<=0)continue;p.life-=dt;if(p.life<=0)continue;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(!p.smoke)p.vy-=7*dt;
   obj.position.set(p.x,p.y,p.z);const scale=p.size*(p.smoke?1+(p.max-p.life)*3:1)*Math.min(1,p.life/.25);obj.scale.setScalar(scale);obj.updateMatrix();mesh.setMatrixAt(count,obj.matrix);mesh.setColorAt(count++,color.setHex(p.smoke?(p.dark?0x343c45:0xabb9c0):0xffb64a));}
  mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 },hide(){root.visible=false;for(const p of particles)p.life=0;emit=0;},dispose(){if(disposed)return;disposed=true;root.removeFromParent();mesh.dispose();geometry.dispose();material.dispose();}};
}
