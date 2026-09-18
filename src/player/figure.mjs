import {BoxGeometry,CapsuleGeometry,SphereGeometry,CylinderGeometry,Group,Mesh,MeshStandardMaterial} from 'three';
export const FIGURE=Object.freeze({height:1.76,shirt:0xc94d38,trousers:0x263443,skin:0xdfb994,hair:0x25282a,cycle:1.55});

// One nearby hero, articulated with rigid joints; the crowd retains its instancing budget.
export function createPlayerFigure(){
 const root=new Group();root.name='player-figure';const owned=[],materials={};
 for(const [name,color] of Object.entries({...FIGURE,shoes:0x171d25,bag:0xcdb58d}))if(!['height','cycle'].includes(name))materials[name]=new MeshStandardMaterial({color,roughness:.85});
 const mesh=(g,mat,parent,x=0,y=0,z=0)=>{owned.push(g);const m=new Mesh(g,materials[mat]);m.position.set(x,y,z);parent.add(m);return m;};
 const torso=mesh(new CapsuleGeometry(.23,.31,4,10),'shirt',root,0,1.19);torso.scale.z=.64;
 mesh(new BoxGeometry(.32,.18,.23),'trousers',root,0,.9);
 mesh(new CylinderGeometry(.065,.075,.13,10),'skin',root,0,1.48);
 const head=mesh(new SphereGeometry(1,14,10),'skin',root,0,1.62);head.scale.set(.115,.145,.12);
 const hair=mesh(new SphereGeometry(1,14,8,Math.PI/2+.55,Math.PI*2-1.1,0,Math.PI*.72),'hair',root,0,1.63);hair.scale.set(.12,.145,.125);
 mesh(new BoxGeometry(.18,.24,.10),'bag',root,.22,1.03,-.05);
 const strap=mesh(new BoxGeometry(.035,.53,.025),'bag',root,.025,1.22,.153);strap.rotation.z=-.35;
 const joint=(x,y,parent)=>{const p=new Group();p.position.set(x,y,0);parent.add(p);return p;};
 const legs=[],knees=[],arms=[],elbows=[];
 for(const side of [-1,1]){
  const hip=joint(side*.105,.88,root),knee=joint(0,-.38,hip);
  mesh(new CapsuleGeometry(.073,.235,3,8),'trousers',hip,0,-.19);
  mesh(new CapsuleGeometry(.062,.24,3,8),'trousers',knee,0,-.18);
  mesh(new BoxGeometry(.14,.11,.26),'shoes',knee,0,-.435,.055);
  const shoulder=joint(side*.25,1.38,root),elbow=joint(0,-.26,shoulder);
  mesh(new CapsuleGeometry(.064,.14,3,8),'shirt',shoulder,0,-.13);
  mesh(new CapsuleGeometry(.052,.14,3,8),'shirt',elbow,0,-.12);
  mesh(new SphereGeometry(.058,8,6),'skin',elbow,0,-.265);
  legs.push(hip);knees.push(knee);arms.push(shoulder);elbows.push(elbow);
 }
 let phase=0,heading=null,disposed=false,time=0;
 return {root,update(state,dt=0){if(disposed)return;root.visible=true;time+=dt;
  phase+=state.speed*dt*Math.PI*2/FIGURE.cycle;const amp=Math.min(.65,state.speed*.19);
  for(let i=0;i<2;i++){const gait=Math.sin(phase+i*Math.PI);legs[i].rotation.x=gait*amp;knees[i].rotation.x=Math.max(0,-gait)*amp*.85;arms[i].rotation.x=-gait*amp*.7-.08;elbows[i].rotation.x=-.18-Math.min(.75,state.speed*.12);}
  const desired=state.bodyHeading??state.heading;
  heading=heading===null?desired:heading+Math.atan2(Math.sin(desired-heading),Math.cos(desired-heading))*(1-Math.exp(-14*dt));
  root.position.set(state.x,state.y+Math.abs(Math.cos(phase))*.018*amp,state.z);
  root.rotation.set(Math.min(.1,state.speed*.018),heading,0);
  torso.scale.y=1+Math.sin(time*2.4)*.003;
  if(state.alive===false){root.rotation.z=Math.min(1,state.runOver*3)*Math.PI/2;root.position.y=state.y+.14;}
 },hide(){root.visible=false;},dispose(){if(disposed)return;disposed=true;root.removeFromParent();owned.forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());root.clear();}};
}
