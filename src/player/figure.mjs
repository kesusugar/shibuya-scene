import {ObjectLoader,AnimationMixer,LoopOnce,LoopRepeat} from 'three';
import pack from './generated/character.mjs';
export const FIGURE=Object.freeze({height:1.76,shirt:0xc94d38,trousers:0x263443,skin:0xdfb994,hair:0x25282a,cycle:1.55});
const looping=new Set(['Idle','Walk','Run','Sprint','Death']);
export function characterAction(state){
 if(state.alive===false)return (state.runOver??0)<.6?'Fall':'Death';
 if(state.vehiclePhase>0)return state.vehicleKind==='exit'?'Exit':'Enter';
 if(state.hurtTime>0)return 'Hit';
 if(state.attackTime>0)return 'Punch';
 const speed=Math.abs(state.speed??0);return speed<.12?'Idle':speed<2.1?'Walk':speed<3.7?'Run':'Sprint';
}
// Buffers, skin weights, skeleton and clips are authored offline, loaded without geometry generation.
export function createPlayerFigure(){
 const root=new ObjectLoader().parse(pack.scene),mixer=new AnimationMixer(root),actions={};
 for(const clip of root.animations){const action=mixer.clipAction(clip);action.setLoop(looping.has(clip.name)?LoopRepeat:LoopOnce,looping.has(clip.name)?Infinity:1);action.clampWhenFinished=!looping.has(clip.name);actions[clip.name]=action;}
 let current='Idle',heading=null,disposed=false,previousAttack=0;actions.Idle.play();mixer.update(0);
 return {root,update(state,dt=0){if(disposed)return;dt=Math.max(0,Math.min(.1,Number(dt)||0));root.visible=true;
  const next=characterAction(state),restart=next==='Punch'&&(state.attackTime??0)>previousAttack+.01;
  if(next!==current||restart){const old=actions[current],action=actions[next];action.reset().play();if(next!==current)old.crossFadeTo(action,next==='Fall'?.06:.16,false);current=next;}
  const action=actions[current];action.timeScale=pack.gait[current]?Math.max(.15,Math.min(2,Math.abs(state.speed)/pack.gait[current])):1;
  mixer.update(dt);
  let time=null;if(current==='Punch')time=.42-state.attackTime;if(current==='Hit')time=.34-state.hurtTime;if(current==='Enter'||current==='Exit')time=state.vehiclePhase*action.getClip().duration;if(current==='Fall')time=state.runOver??0;
  if(time!==null){action.time=Math.max(0,Math.min(action.getClip().duration,time));mixer.update(0);}
  previousAttack=state.attackTime??0;
  const desired=state.bodyHeading??state.heading??0;heading=heading===null?desired:heading+Math.atan2(Math.sin(desired-heading),Math.cos(desired-heading))*(1-Math.exp(-14*dt));
  root.position.set(state.x,state.y,state.z);root.rotation.set(0,heading,0);root.updateMatrixWorld(true);
 },get action(){return current;},hide(){root.visible=false;},dispose(){if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(root);const geometries=new Set(),materials=new Set(),skeletons=new Set();root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}if(o.isSkinnedMesh)skeletons.add(o.skeleton);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());root.removeFromParent();root.clear();}};
}
