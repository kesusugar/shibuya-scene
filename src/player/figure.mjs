import {AnimationMixer,LoopOnce,LoopRepeat} from 'three';
import {bakedCitizen} from './character-asset.mjs';
import {buildGaitSpace,createGaitBlend,createBodyFacing,LOCOMOTION} from './locomotion.mjs';
import {createFootIK} from './foot-ik.mjs';
import pack from './generated/character.mjs';

export const FIGURE=Object.freeze({height:1.76,shirt:0xc94d38,trousers:0x263443,skin:0xdfb994,hair:0x25282a,cycle:1.55});

const looping=new Set(['Idle','Walk','Run','Sprint','Death','Guard','Drive']);
/** Clips the gait blend owns. Anything else is a one-shot the state machine plays over it. */
const GAIT=new Set(['Idle','Walk','Run','Sprint']);

/**
 * What the body is doing, other than walking.
 *
 * Returns null when nothing is happening and the gait blend should have the body to itself.
 * This used to also pick which locomotion clip to play, by speed thresholds; it does not any
 * more, because a threshold is what put three clips inside a third of a second.
 */
export function characterAction(state){
 if(state.alive===false)return (state.runOver??0)<.6?'Fall':'Death';
 if(state.vehiclePhase>0)return state.vehicleKind==='exit'?'Exit':'Enter';
 if(state.hurtTime>0)return 'Hit';
 if(state.trafficReaction==='guard')return 'Guard';
 if(state.trafficReaction==='startle')return 'Startle';
 if(state.attackTime>0)return 'Punch';
 return null;
}

/** The old discrete mapping, kept for anything that still asks which clip a speed looks like. */
export function gaitAction(speed=0){
 const v=Math.abs(speed);
 return v<LOCOMOTION.idleSpeed?'Idle':v<2.1?'Walk':v<3.7?'Run':'Sprint';
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
/**
 * States in which the feet are not walking on anything, and the solver stands down.
 *
 * Correcting a foot towards the ground during a knock-down, a vehicle transition or a death
 * is worse than not correcting it: the animation is deliberately not grounded, and forcing it
 * there folds the leg. Cheaper to believe the animation.
 */
const UNGROUNDED=new Set(['Fall','Death','Enter','Exit','Drive']);

export function createPlayerFigure(asset=bakedAsset(),palette=undefined,{ctx=null,variant=null}={}){
 // `variant` names an appearance archetype (RUN 6.8). Assets with one look ignore it.
 const instance=asset.instance(palette,variant),root=instance.root;
 const mixer=new AnimationMixer(root),actions={};
 for(const clip of instance.clips){
  const action=mixer.clipAction(clip),loop=looping.has(clip.name);
  action.setLoop(loop?LoopRepeat:LoopOnce,loop?Infinity:1);
  action.clampWhenFinished=!loop;actions[clip.name]=action;
 }
 const head=root.getObjectByName(asset.bones.head);
 const gait=createGaitBlend(buildGaitSpace(instance.clips,asset.gait,asset.gaitDetail));
 const facing=createBodyFacing(0);
 // Foot IK only exists where the skeleton names the joints it needs; the offline-baked figure
 // has eleven bones and none of these names, so it simply goes without.
 const footIK=asset.legBones?createFootIK(root,{bones:asset.legBones,ctx}):null;
 let overlay=null,previousAttack=0,disposed=false,seeded=false,dominant='Idle';
 // A jump in world position is a teleport, not a stride. Locked feet have to be forgotten or
 // one gets dragged across the city on the next frame.
 let lastX=null,lastZ=null;
 const teleported=state=>{
  const jumped=lastX!==null&&Math.hypot(state.x-lastX,state.z-lastZ)>1.2;
  lastX=state.x;lastZ=state.z;return jumped;
 };

 // The gait clips are driven by hand: weight and time are set every frame from the blend, and
 // the mixer is only asked to evaluate. Crossfades are what a blend exists to avoid.
 for(const name of GAIT)actions[name]?.play().setEffectiveWeight(0);
 for(const name of GAIT)if(actions[name])actions[name].paused=true;
 if(actions.Idle){actions.Idle.paused=false;actions.Idle.setEffectiveWeight(1);}
 mixer.update(0);

 /** Play a one-shot or a held pose over the legs, or hand the body back to the gait. */
 function setOverlay(next,state){
  const restart=next==='Punch'&&(state.attackTime??0)>previousAttack+.01;
  if(next===overlay&&!restart)return;
  if(overlay&&actions[overlay])actions[overlay].fadeOut(next==='Fall'?.06:.14);
  if(next&&actions[next]){
   const action=actions[next];
   action.reset().setEffectiveWeight(1).fadeIn(overlay?.14:.1).play();
  }
  overlay=next&&actions[next]?next:null;
 }

 return {
  root,asset,
  get gait(){return gait;},
  update(state,dt=0){
   if(disposed)return;
   dt=Math.max(0,Math.min(.1,Number(dt)||0));root.visible=true;
   const speed=Math.abs(state.speed??0);

   // Legs first, always: an overlay covers them rather than replacing them, so a punch thrown
   // while walking does not stop the walk and a hit taken at speed does not freeze the feet.
   const weights=gait.update(speed,dt);
   for(const name of GAIT){
    const action=actions[name];if(!action)continue;
    const weight=weights.get(name)??0;
    action.setEffectiveWeight(weight);
    if(name==='Idle'){action.paused=false;action.timeScale=1;continue;}
    const time=gait.timeFor(name);
    if(time!==null)action.time=time;
   }
   // A phase offset from outside: the near-NPC pool gives every pedestrian its own, so a
   // crowd walks out of step with itself rather than marching.
   if(!seeded&&Number.isFinite(state.animationPhase)){seeded=true;gait.seed(state.animationPhase);}
   dominant='Idle';
   {let best=-1;for(const [name,weight] of weights)if(weight>best){best=weight;dominant=name;}}

   const requested=characterAction(state);
   setOverlay(requested&&actions[requested]?requested:null,state);
   mixer.update(dt);

   // Clips the game scrubs rather than plays: their progress is a game quantity, not a clock.
   if(overlay){
    const action=actions[overlay],duration=action.getClip().duration;
    let time=null;
    if(overlay==='Punch')time=duration-state.attackTime*(duration/.42);
    if(overlay==='Hit')time=state.hurtTime>0?duration-state.hurtTime*(duration/.34):duration/2;
    if(overlay==='Enter'||overlay==='Exit')time=state.vehiclePhase*duration;
    if(overlay==='Fall')time=state.runOver??0;
    if(time!==null){action.time=Math.max(0,Math.min(duration,time));mixer.update(0);}
   }
   previousAttack=state.attackTime??0;

   // Moving, the body faces where it is going. Standing, it faces where the camera is
   // looking -- but only once the camera has swung far enough to be worth turning for, which
   // is createBodyFacing's job. Feeding it the body heading in both cases, as this did, meant
   // a standing character never learned the view had moved at all and stood facing a wall
   // while the camera orbited it.
   const desired=speed>LOCOMOTION.idleSpeed
    ?(state.bodyHeading??state.heading??0)
    :(state.heading??state.bodyHeading??0);
   facing.update(desired,speed,dt);
   root.position.set(state.x,state.y,state.z);
   root.rotation.set(0,facing.heading,facing.lean,'YXZ');
   if(state.trafficReaction==='look'&&Number.isFinite(state.threatHeading)&&head)
    head.rotation.y=Math.max(-.8,Math.min(.8,Math.atan2(Math.sin(state.threatHeading-facing.heading),Math.cos(state.threatHeading-facing.heading))));
   root.updateMatrixWorld(true);

   // Feet last, on top of the finished pose, because it corrects what the animation produced
   // rather than producing it. A teleport or a state where the feet are not on anything drops
   // every lock instead of dragging one across the city.
   if(footIK){
    const grounded=state.alive!==false&&!UNGROUNDED.has(overlay)&&!state.riding;
    if(!grounded||teleported(state))footIK.reset();
    else footIK.update({phase:gait.phase,...gait.stance()},dt);
   }
  },
  get footIK(){return footIK;},
  reset(){
   footIK?.reset();
   mixer.stopAllAction();
   for(const action of Object.values(actions))action.reset();
   overlay=null;previousAttack=0;seeded=false;dominant='Idle';
   gait.reset();facing.reset(0);
   for(const name of GAIT)actions[name]?.play().setEffectiveWeight(0);
   for(const name of GAIT)if(actions[name])actions[name].paused=true;
   if(actions.Idle){actions.Idle.paused=false;actions.Idle.setEffectiveWeight(1);}
   mixer.update(0);
  },
  recolour(palette){instance.recolour(palette);},
  setHeight(metres){instance.setHeight(metres);},
  /** RUN 6.8: how broad this body is. A no-op on an asset that has one build. */
  setBuild(width){instance.setBuild?.(width);},
  /** What the body is mostly doing, for diagnostics and for the capture harness. */
  get action(){return overlay??dominant;},
  hide(){root.visible=false;},
  dispose(){
   if(disposed)return;disposed=true;
   mixer.stopAllAction();mixer.uncacheRoot(root);
   instance.dispose();
  }
 };
}
