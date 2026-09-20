// How fast the legs go, and which legs.
//
// The figure used to pick one clip by a speed threshold and play it at `speed / nativeSpeed`.
// Two things follow from that, and both are visible in evidence/run4-locomotion/before:
//
//   The player crosses Walk, Run and Sprint inside a third of a second on the way to 4.2 m/s,
//   so Run is a two-tenths-of-a-second flicker between two other clips.
//   At 4.2 m/s the Sprint clip plays at 0.51x, which is not a run at half speed -- it is a
//   sprint in slow motion, with the stride of an 8 m/s stride and the cadence of a stroll.
//
// This replaces both with a continuous blend, and the arithmetic that makes it work is one
// line: a cycle takes as long as the blended stride divided by the ground speed. Get that
// right and the foot on the ground is stationary relative to the ground, which is the whole
// problem -- clip playback rate is not a free parameter, it is determined by how far the
// animation moves the body per cycle and how fast the body is actually going.
//
// The clips are then held in phase with each other by their measured left-foot contact, so
// blending Walk into Run cannot put one clip's left foot down while the other's is swinging.
// Contact timings come from scripts/analyse-gait.mjs, which reads them off the foot bones.

export const LOCOMOTION=Object.freeze({
 // Below this the body is standing. Above `moveSpeed` it is entirely walking; between the two
 // the idle pose is mixed in, which is what covers the first and last step of a journey in the
 // absence of any authored start or stop clip.
 idleSpeed:.16, moveSpeed:.95,
 // A cycle may not take longer or shorter than this however the stride arithmetic comes out.
 // Outside the band the feet would slide, but a clip played at 0.5x or 2x reads as wrong
 // whatever the feet are doing, so the sliding is the cheaper error and it is bounded here.
 minPeriod:.72, maxPeriod:1.16,
 // Turning. A rate, not a spring: a spring covers most of a half-turn in three frames and
 // then crawls, which is exactly the instant snap this is meant to remove.
 turnRate:7.0,          // rad/s while moving
 pivotRate:3.6,         // rad/s while standing and catching up with the camera
 // How far the camera may swing before a standing body follows it, and how close it gets
 // before it stops. The gap is what keeps the body from twitching at every mouse movement;
 // once it does commit to turning it finishes the turn, rather than stopping ten degrees
 // short and leaving the character permanently askew.
 pivotStart:.95, pivotStop:.04,
 // A body leans into a turn. Small: this is a person, not a motorcycle.
 leanPerRadPerSecond:.035, maxLean:.17
});

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=(a,b,v)=>{const t=clamp((v-a)/(b-a||1),0,1);return t*t*(3-2*t);};
/** Shortest signed angle from `a` to `b`. */
export const turnTo=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

/**
 * Build the blend space from whatever locomotion clips an asset actually has.
 *
 * `gait` maps a clip name to the ground speed it was authored at; `detail` optionally adds the
 * measured stride and left-foot contact. Without `detail` the stride is derived from speed and
 * duration, which is the same number, and contacts default to zero -- the offline-baked figure
 * was authored with every clip's left contact at the same phase, so zero is correct for it.
 */
export function buildGaitSpace(clips,gait,detail=null){
 const ladder=[];
 for(const clip of clips){
  const speed=gait?.[clip.name];
  if(!speed||!/^(Walk|Run|Sprint)$/.test(clip.name))continue;
  const measured=detail?.clips?.[clip.name];
  ladder.push({
   name:clip.name,duration:clip.duration,speed,
   stride:measured?.stride??speed*clip.duration,
   // Phase within the clip at which the left foot plants.
   contact:measured?.leftContact??0,
   // 0.5 is a symmetric gait. Anything else limps when blended against a symmetric one, so
   // it is recorded and reported rather than silently averaged away.
   symmetry:measured?.contactOffset??.5
  });
 }
 ladder.sort((a,b)=>a.speed-b.speed);
 return ladder;
}

/**
 * The running state of one character's legs.
 *
 * `update` is called once per frame with the body's actual ground speed and returns the weight
 * every clip should have and where in its own cycle it should be. Nothing here touches three:
 * the figure applies the result, and the same numbers are testable without a renderer.
 */
export function createGaitBlend(ladder,{idleName='Idle'}={}){
 const weights=new Map();
 let phase=0,period=LOCOMOTION.maxPeriod,started=false;
 const empty=ladder.length===0;

 return {
  get phase(){return phase;},
  get period(){return period;},
  get cadence(){return 120/period;},
  get ladder(){return ladder;},

  /** Drop back to standing, ready to take the first step from the top of a cycle. */
  reset(){
   phase=0;started=false;period=LOCOMOTION.maxPeriod;weights.clear();
  },
  /**
   * Start somewhere else in the cycle.
   *
   * A pool of pedestrians all seeded from zero walks in step, which reads as choreography.
   * This is how each one gets its own footfall.
   */
  seed(value){phase=((value%1)+1)%1;started=true;},

  update(speed,dt){
   weights.clear();
   const moving=smoothstep(LOCOMOTION.idleSpeed,LOCOMOTION.moveSpeed,speed);
   if(moving<1)weights.set(idleName,1-moving);
   if(empty||moving<=0){started=false;return weights;}

   // Which two rungs of the ladder this speed sits between.
   let lower=ladder[0],upper=ladder[ladder.length-1],w=0;
   if(speed<=lower.speed){upper=lower;w=0;}
   else if(speed>=upper.speed){lower=upper;w=0;}
   else for(let i=1;i<ladder.length;i++){
    if(speed>ladder[i].speed)continue;
    lower=ladder[i-1];upper=ladder[i];
    w=(speed-lower.speed)/(upper.speed-lower.speed||1);
    break;
   }

   // The cycle takes exactly as long as the blended stride divided by the ground speed, so
   // the planted foot does not slide. The clamp is the only place that reintroduces sliding.
   const stride=lerp(lower.stride,upper.stride,w);
   period=clamp(stride/Math.max(speed,1e-3),LOCOMOTION.minPeriod,LOCOMOTION.maxPeriod);

   // The first step of a journey starts just before a contact rather than wherever the cycle
   // happened to be left, so a character does not set off mid-swing.
   if(!started){phase=.88;started=true;}
   phase=(phase+dt/period)%1;

   if(lower===upper)weights.set(lower.name,moving);
   else{
    if(1-w>1e-3)weights.set(lower.name,moving*(1-w));
    if(w>1e-3)weights.set(upper.name,moving*w);
   }
   return weights;
  },

  /**
   * Where a clip should be in its own timeline for the shared phase.
   *
   * Aligning on each clip's own left-foot contact is what stops a blend from putting one
   * clip's foot down while the other's is in the air.
   */
  timeFor(name){
   const rung=ladder.find(r=>r.name===name);
   if(!rung)return null;
   return ((phase+rung.contact)%1)*rung.duration;
  },
  /** Playback rate a clip is being asked to run at, for reporting and for tests. */
  rateFor(name){
   const rung=ladder.find(r=>r.name===name);
   return rung?rung.duration/period:1;
  }
 };
}

/**
 * Where the body is pointing.
 *
 * Two behaviours, because a third-person character has two. Moving, it faces where it is
 * going and gets there at a bounded rate, so a half-turn takes about half a second instead of
 * three frames. Standing, it ignores the camera until the camera has swung far enough to be
 * worth turning for, and then catches up -- which is the difference between a character that
 * stands still while the view orbits it and one that twitches at every mouse movement.
 */
export function createBodyFacing(initial=0){
 let heading=initial,lean=0,pivoting=false;
 return {
  get heading(){return heading;},
  get lean(){return lean;},
  get pivoting(){return pivoting;},
  reset(to=0){heading=to;lean=0;pivoting=false;},
  update(desired,speed,dt){
   const step=Math.max(0,Math.min(.1,dt));
   const error=turnTo(heading,desired);
   const moving=speed>LOCOMOTION.idleSpeed;
   if(moving)pivoting=false;
   else if(Math.abs(error)>LOCOMOTION.pivotStart)pivoting=true;
   else if(Math.abs(error)<LOCOMOTION.pivotStop)pivoting=false;
   const rate=moving?LOCOMOTION.turnRate:(pivoting?LOCOMOTION.pivotRate:0);
   const applied=clamp(error,-rate*step,rate*step);
   heading+=applied;
   // Lean comes from how fast the body is turning and how fast it is going: a turn at a
   // standstill does not throw anyone off balance.
   const target=clamp(-(applied/(step||1))*LOCOMOTION.leanPerRadPerSecond*clamp(speed/3,0,1),
    -LOCOMOTION.maxLean,LOCOMOTION.maxLean);
   lean+=(target-lean)*(1-Math.exp(-9*step));
   return heading;
  }
 };
}
