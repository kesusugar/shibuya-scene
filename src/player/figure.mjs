import {AnimationMixer,LoopOnce,LoopRepeat} from 'three';
import {bakedCitizen} from './character-asset.mjs';
import {buildGaitSpace,createGaitBlend,createBodyFacing,LOCOMOTION} from './locomotion.mjs';
import {createFootIK} from './foot-ik.mjs';
import {attackOf} from './attack-timing.mjs';
import pack from './generated/character.mjs';

export const FIGURE=Object.freeze({height:1.76,shirt:0xc94d38,trousers:0x263443,skin:0xdfb994,hair:0x25282a,cycle:1.55});

const looping=new Set(['Idle','Walk','Run','Sprint','Death','Guard','Drive']);
/** Clips the gait blend owns. Anything else is a one-shot the state machine plays over it. */
const GAIT=new Set(['Idle','Walk','Run','Sprint']);
/** The swings. They own the whole body while they play; see STRIKE. */
const PUNCHES=new Set(['Punch','PunchCross']);

/**
 * How a swing takes the body over, and how fast the body turns onto its target.
 *
 * The punch used to go through the mixer at weight 1 ON TOP of a gait blend that already
 * summed to 1. three.js averages every action that animates a bone, so the arm was half punch
 * and half idle: at the jab's peak the fist sat 0.6 m out to the side at chest height instead
 * of 0.76 m forward at the shoulder, which is the sideways swing seen on real hardware. A
 * swing now takes weight from the gait instead of being added to it, so the sum stays 1 and
 * the fist goes where the clip puts it.
 */
export const STRIKE=Object.freeze({fadeIn:.08, fadeOut:.3, turnRate:14});

/**
 * What the body is doing, other than walking.
 *
 * Returns null when nothing is happening and the gait blend should have the body to itself.
 * This used to also pick which locomotion clip to play, by speed thresholds; it does not any
 * more, because a threshold is what put three clips inside a third of a second.
 */
/**
 * The punch envelope, -0.35..1 over the swing: a wind-up away, a drive through that peaks when
 * the fist is out, and a settle. Timing comes from the measured clip, not a fraction chosen by
 * eye. Pure, for the test.
 */
/** Spine lean at the peak of a punch, radians (replaces an 11 cm root slide; see below). */
export const PUNCH_LEAN=.13;
export function punchEmphasis(name,progress){
 const a=attackOf(name),w=a.windup/a.duration,p=a.peak/a.duration,u=Math.max(0,Math.min(1,progress));
 const ease=x=>x*x*(3-2*x);
 if(u<w)return -.35*Math.sin(Math.PI*.5*u/w);
 if(u<p)return -.35+1.35*ease((u-w)/Math.max(1e-6,p-w));
 return 1-ease((u-p)/Math.max(1e-6,1-p));
}

/**
 * The victim's recoil envelope, 0..1 over a blow's hold: snaps in over the first fifth, then
 * eases out. claude/crowd-realism. The baked `Hit` barely moves the body (UAL2's
 * Hit_Knockback is still not pinned), so a punch landed on someone who hardly flinched; this
 * rides on top of it the way punchEmphasis rides on the punch. Pure, for the test.
 */
export function hitRecoil(progress){
 const u=Math.max(0,Math.min(1,progress)),ease=x=>x*x*(3-2*x);
 return u<.2?Math.sin(Math.PI*.5*u/.2):1-ease((u-.2)/.8);
}
/** How far the recoil bends a body, radians: [spine, head], for a jab and for a cross. */
export const RECOIL=Object.freeze({light:[.2,.22],strong:[.38,.34]});

export function characterAction(state){
 if(state.alive===false)return (state.runOver??0)<.6?'Fall':'Death';
 if(state.vehiclePhase>0)return state.vehicleKind==='exit'?'Exit':'Enter';
 if(state.hurtTime>0)return 'Hit';
 if(state.trafficReaction==='guard')return 'Guard';
 if(state.trafficReaction==='startle')return 'Startle';
 if(state.attackTime>0)return state.attackName==='PunchCross'?'PunchCross':'Punch';
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
 // RUN 11.2: what a punch leans on. Present on the humanoid rig, absent on the baked figure,
 // which simply goes without the emphasis.
 const spine=root.getObjectByName('spine_02');
 const gait=createGaitBlend(buildGaitSpace(instance.clips,asset.gait,asset.gaitDetail));
 const facing=createBodyFacing(0);
 // Foot IK only exists where the skeleton names the joints it needs; the offline-baked figure
 // has eleven bones and none of these names, so it simply goes without.
 const footIK=asset.legBones?createFootIK(root,{bones:asset.legBones,ctx}):null;
 let overlay=null,previousAttack=0,disposed=false,seeded=false,dominant='Idle';
 const strike={Punch:0,PunchCross:0};
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
  const restart=(next==='Punch'||next==='PunchCross')&&(state.attackTime??0)>previousAttack+.01;
  if(next===overlay&&!restart)return;
  // A swing's weight is not the mixer's to fade: it is set every frame against the gait (see
  // STRIKE), so it neither fades in over the legs nor out to nothing.
  if(overlay&&actions[overlay]&&!PUNCHES.has(overlay))actions[overlay].fadeOut(next==='Fall'?.06:.14);
  if(next&&actions[next]){
   const action=actions[next];
   if(PUNCHES.has(next))action.reset().play();
   else action.reset().setEffectiveWeight(1).fadeIn(overlay?.14:.1).play();
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

   // Legs first: an overlay covers them rather than replacing them, so a hit taken at speed
   // does not freeze the feet. A swing is the exception (STRIKE): it is a standing punch, the
   // controller plants the player for it, and it takes the whole body.
   const weights=gait.update(speed,dt);
   // A swing takes its share from the gait rather than being averaged with it (STRIKE).
   const requested=characterAction(state);
   let swung=0;
   for(const name of PUNCHES){
    const on=requested===name&&actions[name]?1:0,rate=dt/(on?STRIKE.fadeIn:STRIKE.fadeOut);
    strike[name]+=Math.max(-rate,Math.min(rate,on-strike[name]));
    actions[name]?.setEffectiveWeight(strike[name]);swung+=strike[name];
   }
   const share=Math.max(0,1-swung);
   for(const name of GAIT){
    const action=actions[name];if(!action)continue;
    const weight=(weights.get(name)??0)*share;
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

   setOverlay(requested&&actions[requested]?requested:null,state);
   mixer.update(dt);

   // Clips the game scrubs rather than plays: their progress is a game quantity, not a clock.
   if(overlay){
    const action=actions[overlay],duration=action.getClip().duration;
    let time=null;
    if(overlay==='Punch'||overlay==='PunchCross'){
     // The player's swing carries its real length: play the clip at its own speed, so the
     // frame the fist is out is the frame the hit test runs (attack-timing.mjs measured both).
     // NPC swings come in as the old 0.42 s pulse and keep that mapping.
     const total=state.attackDuration>0?state.attackDuration:.42;
     time=state.attackDuration>0?duration*(1-state.attackTime/total):duration-state.attackTime*(duration/.42);
    }
    if(overlay==='Hit'){const total=state.hurtDuration>0?state.hurtDuration:.34;
     time=state.hurtTime>0?duration*(1-state.hurtTime/total):duration/2;}
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
   // A swing faces what it is thrown at: combat picks the target when the swing starts and
   // tracks it through the wind-up (`attackHeading`), and the body turns onto it fast enough
   // to be square before the fist is out.
   const aiming=state.attackTime>0&&Number.isFinite(state.attackHeading);
   const desired=aiming?state.attackHeading:speed>LOCOMOTION.idleSpeed
    ?(state.bodyHeading??state.heading??0)
    :(state.heading??state.bodyHeading??0);
   facing.update(desired,speed,dt,aiming?STRIKE.turnRate:undefined);
   root.position.set(state.x,state.y,state.z);
   root.rotation.set(0,facing.heading,facing.lean,'YXZ');
   if(state.trafficReaction==='look'&&Number.isFinite(state.threatHeading)&&head)
    head.rotation.y=Math.max(-.8,Math.min(.8,Math.atan2(Math.sin(state.threatHeading-facing.heading),Math.cos(state.threatHeading-facing.heading))));
   // RUN 11.2: weight behind a punch: the body leans into it as the fist goes out. Additive
   // and bounded, and only for a swing that carries its timing (the player's).
   //
   // It used to twist the torso as well (spine .24 and chest .2 rad). The twist ran the wrong
   // way -- positive yaw pulls the left shoulder BACK -- and any twist at all swings an
   // extended arm off its line: at the jab's peak it alone moved the fist 28 cm outward. The
   // clips already turn the shoulders into the punch, so the twist is gone and the lean stays.
   if(PUNCHES.has(overlay)&&state.attackDuration>0&&spine){
    const k=punchEmphasis(overlay,1-state.attackTime/state.attackDuration);
    // claude/crowd-realism: the weight goes forward through the spine, not by sliding the whole
    // body. Moving the root 11 cm with both feet planted slid both feet 11 cm on every punch;
    // a deeper lean puts the chest about as far forward and leaves the feet where they are.
    const lean=Math.max(0,k);spine.rotateX(PUNCH_LEAN*lean);
   }
   // claude/crowd-realism: the victim's side of a blow. Bend away from it -- back for a blow
   // from the front, sideways for one from the side -- in the body's own frame, snapping in and
   // settling over the blow's hold.
   if(overlay==='Hit'&&spine&&state.hurtTime>0&&(state.hurtX||state.hurtZ)){
    const total=state.hurtDuration>0?state.hurtDuration:.34,k=hitRecoil(1-state.hurtTime/total);
    const [bend,snap]=state.hurtStrong?RECOIL.strong:RECOIL.light;
    const s=Math.sin(facing.heading),c=Math.cos(facing.heading);
    const back=-(state.hurtX*s+state.hurtZ*c),across=state.hurtX*c-state.hurtZ*s;
    spine.rotateX(-bend*k*back);spine.rotateZ(-bend*k*across*.8);
    head?.rotateX(-snap*k*back);head?.rotateZ(-snap*k*across*.8);
   }
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
   overlay=null;previousAttack=0;seeded=false;dominant='Idle';strike.Punch=strike.PunchCross=0;
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
