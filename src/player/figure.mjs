import {AnimationMixer,LoopOnce,LoopRepeat} from 'three';
import {bakedCitizen} from './character-asset.mjs';
import pack from './generated/character.mjs';

export const FIGURE=Object.freeze({height:1.76,shirt:0xc94d38,trousers:0x263443,skin:0xdfb994,hair:0x25282a,cycle:1.55});

const looping=new Set(['Idle','Walk','Run','Sprint','Death','Guard','Drive']);

export function characterAction(state){
 if(state.alive===false)return (state.runOver??0)<.6?'Fall':'Death';
 if(state.vehiclePhase>0)return state.vehicleKind==='exit'?'Exit':'Enter';
 if(state.hurtTime>0)return 'Hit';
 if(state.trafficReaction==='guard')return 'Guard';
 if(state.trafficReaction==='startle')return 'Startle';
 if(state.attackTime>0)return 'Punch';
 const speed=Math.abs(state.speed??0);return speed<.12?'Idle':speed<2.1?'Walk':speed<3.7?'Run':'Sprint';
}

// The offline-baked figure, shared by every instance that does not name another asset. It is
// parsed once: its buffers, skin weights, skeleton and clips are authored at build time, so
// constructing a body allocates a skeleton and a mixer and nothing else.
let baked=null;
export function bakedAsset(){return baked??=bakedCitizen(pack);}

/**
 * One animated body.
 *
 * `asset` is a CharacterAsset (see character-asset.mjs) and decides what the body is made of;
 * everything below decides what it is doing. The two are kept apart because the humanoid
 * asset is loaded over the network and the baked one is not, so the same figure has to be
 * able to start on one and continue on the other.
 */
export function createPlayerFigure(asset=bakedAsset(),palette=undefined){
 const instance=asset.instance(palette),root=instance.root;
 const mixer=new AnimationMixer(root),actions={};
 for(const clip of instance.clips){
  const action=mixer.clipAction(clip),loop=looping.has(clip.name);
  action.setLoop(loop?LoopRepeat:LoopOnce,loop?Infinity:1);
  action.clampWhenFinished=!loop;actions[clip.name]=action;
 }
 const gait=asset.gait,head=root.getObjectByName(asset.bones.head);
 let current='Idle',heading=null,disposed=false,previousAttack=0;
 actions.Idle.play();mixer.update(0);
 return {
  root,asset,
  update(state,dt=0){
   if(disposed)return;dt=Math.max(0,Math.min(.1,Number(dt)||0));root.visible=true;
   const requested=characterAction(state),next=actions[requested]?requested:'Idle';
   const restart=next==='Punch'&&(state.attackTime??0)>previousAttack+.01;
   if(next!==current||restart){
    const old=actions[current],action=actions[next];action.reset().play();
    if(gait[next])action.time=(state.animationPhase??0)%action.getClip().duration;
    if(next!==current)old.crossFadeTo(action,next==='Fall'?.06:.16,false);
    current=next;
   }
   const action=actions[current];
   action.timeScale=gait[current]?Math.max(.15,Math.min(2,Math.abs(state.speed)/gait[current])):1;
   mixer.update(dt);
   // Clips the game scrubs rather than plays: their progress is a game quantity, not a clock.
   let time=null;const duration=action.getClip().duration;
   if(current==='Punch')time=duration-state.attackTime*(duration/.42);
   if(current==='Hit')time=state.hurtTime>0?duration-state.hurtTime*(duration/.34):duration/2;
   if(current==='Enter'||current==='Exit')time=state.vehiclePhase*duration;
   if(current==='Fall')time=state.runOver??0;
   if(time!==null){action.time=Math.max(0,Math.min(duration,time));mixer.update(0);}
   previousAttack=state.attackTime??0;
   const desired=state.bodyHeading??state.heading??0;
   heading=heading===null?desired:heading+Math.atan2(Math.sin(desired-heading),Math.cos(desired-heading))*(1-Math.exp(-14*dt));
   root.position.set(state.x,state.y,state.z);root.rotation.set(0,heading,0);
   if(state.trafficReaction==='look'&&Number.isFinite(state.threatHeading)&&head)
    head.rotation.y=Math.max(-.8,Math.min(.8,Math.atan2(Math.sin(state.threatHeading-heading),Math.cos(state.threatHeading-heading))));
   root.updateMatrixWorld(true);
  },
  reset(){
   mixer.stopAllAction();for(const action of Object.values(actions))action.reset();
   current='Idle';heading=null;previousAttack=0;actions.Idle.play();mixer.update(0);
  },
  recolour(palette){instance.recolour(palette);},
  setHeight(metres){instance.setHeight(metres);},
  get action(){return current;},
  hide(){root.visible=false;},
  dispose(){
   if(disposed)return;disposed=true;
   mixer.stopAllAction();mixer.uncacheRoot(root);
   instance.dispose();
  }
 };
}
