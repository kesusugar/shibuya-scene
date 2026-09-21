import {ARCHETYPES} from './config.mjs';
import {Group} from 'three';
import {createPlayerFigure,bakedAsset} from '../player/figure.mjs';

export const NEAR_LIMITS={high:32,medium:12,low:4};

/**
 * How many of those slots get the full humanoid rather than the offline-baked figure.
 *
 * RUN 6's point is not that two thousand people become high fidelity; it is that the handful
 * the camera is actually looking at stop being copies of one simple doll. So the pool is two
 * pools: the nearest few wear the 65-bone body the player wears, and the rest keep the baked
 * eleven-bone figure that has always been there.
 *
 * The numbers come from scripts/audit-near-pool.mjs. Per rig the humanoid is 4.1x the
 * triangles of the baked figure and HALF the draw calls -- three meshes against six -- so the
 * cost that scales here is skinning and bone matrices, not batches. At HIGH, eight humanoids
 * plus twenty-four baked figures is 190k triangles against the all-baked 121k, while the draw
 * calls fall from 192 to 168.
 */
export const HUMANOID_LIMITS={high:8,medium:4,low:0};

/**
 * How many near characters get foot IK, at most.
 *
 * RUN 5 measured the solver at 13 microseconds and 3.9 ground queries a frame. Eight of them
 * is 0.1 ms and 31 queries, which is affordable; thirty-two is not obviously so, and the brief
 * for this run says to bound it rather than find out. Only humanoid slots can have it at all:
 * the baked figure has eleven bones and none of the joint names the solver needs.
 */
export const NEAR_IK_LIMITS={high:8,medium:4,low:0};

/**
 * Sixteen ways to look like a different person, from one mesh and one material.
 *
 * The humanoid's garment mask carries skin, top, bottom, hair and shoes in four vertex-colour
 * channels, and recolouring is a uniform write -- no recompile, no second material, nothing
 * per-body on the GPU. Thirty-two unique assets is what the brief forbids and this is the
 * alternative: the same body, dressed differently, at slightly different heights.
 */
const WARDROBE=[
 {top:0x2f4858,bottom:0x23303a,hair:0x1b1a1c,shoe:0x14161a},
 {top:0x8c5a3c,bottom:0x2b2f38,hair:0x2e2320,shoe:0x1a1a1e},
 {top:0xe9e3d5,bottom:0x3c4654,hair:0x141215,shoe:0x2a2a30},
 {top:0x3f6d5a,bottom:0x2d3240,hair:0x3a2a1e,shoe:0x191a1d},
 {top:0xd9a441,bottom:0x35393f,hair:0x17161a,shoe:0x232329},
 {top:0x6b5b95,bottom:0x262b33,hair:0x241d1a,shoe:0x15171b},
 {top:0xc9c6bf,bottom:0x4a4f58,hair:0x120f12,shoe:0x26262c},
 {top:0x35506b,bottom:0x2a2e36,hair:0x2b211c,shoe:0x181a1e}
];
const SKIN=[0xdfb994,0xc79a72,0xa3764f,0x7a5334,0xecd0b0];

// The player wears WARDROBE.top (0xc94d38, a warm red) and has to stay findable in a crowd
// that now shares its body. No citizen top is allowed near it -- a test asserts the distance,
// because "they look different to me" is not a property a palette has.


/** Deterministic per-citizen so a body keeps its identity across pool reuse. */
function wardrobe(id){
 const n=Math.abs(id);
 return {...WARDROBE[n%WARDROBE.length],skin:SKIN[(n>>3)%SKIN.length]};
}

// Shared baked geometry/materials; only a bounded pool has individual skeletons/mixers.
export function createNearCharacters(tier='high',{ctx=null}={}){
 const root=new Group(),slots=[],selected=new Set(),palette=[];root.name='near-character-pool';
 let asset=null,human=null,disposed=false,trianglesPerRig=0,humanTrianglesPerRig=0;
 const stats={humanoids:0,baked:0,ik:0};
 function clear(){selected.clear();for(const s of slots){s.id=null;s.figure.hide();}}
 const limitFor=table=>table[tier]??0;
 function measure(a){let n=0;a.template.traverse(o=>{if(o.isMesh)
  n+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return n;}
 return {root,selected,
  /**
   * Hand the pool the humanoid once it has finished loading.
   *
   * Late, exactly like the player's: the scene must not wait on it, and a session that never
   * loads it keeps working with baked figures throughout. Existing slots are dropped so they
   * rebuild on the next frame with the right asset rather than being converted in place.
   */
  setHumanAsset(value){
   if(disposed||human===value)return;
   human=value;
   if(human&&!humanTrianglesPerRig)humanTrianglesPerRig=measure(human);
   for(const s of slots.splice(0))s.figure.dispose();
   selected.clear();
  },
  update(people,focus,dt,clock=0){
   if(disposed)return selected;
   if(!focus){clear();return selected;}
   const limit=NEAR_LIMITS[tier]??4;
   const candidates=people.filter(p=>p.active&&!p.controlled&&p.archetype!=='kid'&&p.struck===undefined&&Math.hypot(p.x-focus.x,p.z-focus.z)<(selected.has(p.id)?30:25))
    .map(p=>({p,score:Math.hypot(p.x-focus.x,p.z-focus.z)-(selected.has(p.id)?3:0)-(p.combatTarget?40:0)-(p.reactionUntil>clock?20:0)})).sort((a,b)=>a.score-b.score||a.p.id-b.p.id).slice(0,limit);
   // The priority order is untouched by any of this: a combat target or a reacting pedestrian
   // still outranks someone merely closer, and only then does body quality follow rank.

   // Grow by one slot per frame, only while player mode needs a visible rig. No scene-startup
   // work, and never more slots than the tier allows.
   //
   // A slot's kind comes from the POOL'S OWN QUOTA, not from the rank of whichever candidate
   // happens to be asking. That distinction is the whole of this block, and getting it wrong
   // is not hypothetical: the first version of this code chose the kind from the asking
   // candidate's rank, and a citizen who had been rank 3 kept its humanoid while drifting to
   // rank 20, so the new rank 3 found no free humanoid and built another one. Under a crowd
   // dense enough to churn the near radius -- 300 people, which is what a scramble crossing
   // actually is -- that converged on 27 humanoid slots against a budget of 8. The earlier
   // tests used 40 people and never reached the density where it shows. qa/gta-upgrade/
   // poolprobe.mjs is the measurement, and tests/near-humanoid.test.mjs now pins it at 300.
   //
   // Filling the humanoid quota first is what makes the bound structural: the count can only
   // go up by one at a time and stops at the quota, so no assignment policy below can inflate
   // it.
   const humanSlotCount=slots.filter(s=>s.human).length;
   if(slots.length<limit&&slots.length<candidates.length){
    const wantHuman=!!human&&humanSlotCount<limitFor(HUMANOID_LIMITS);
    if(!asset){asset=bakedAsset();palette.push(...new Set(Object.values(ARCHETYPES).flatMap(a=>a.colors)));
     trianglesPerRig=measure(asset);}
    const source=wantHuman?human:asset;
    // Foot IK only for humanoid slots inside the budget, and only when a ground query exists.
    // RUN 5's solver is not changed for this; it is given or not given a context.
    const wantsIK=wantHuman&&!!ctx&&slots.filter(s=>s.ik).length<limitFor(NEAR_IK_LIMITS);
    const figure=createPlayerFigure(source,undefined,wantsIK?{ctx}:{});
    root.add(figure.root);slots.push({figure,id:null,elapsed:0,human:wantHuman,ik:wantsIK});
   }

   const wanted=new Set(candidates.map(c=>c.p.id));
   for(const s of slots)if(!wanted.has(s.id)){s.id=null;s.figure.hide();}

   // One swap per frame, so the good bodies drift toward the camera instead of sticking to
   // whoever reached the radius first.
   //
   // Holding a slot for as long as its citizen stays near is what keeps the pool quiet, but on
   // its own it aims badly: measured over 900 frames of a churning crowd, only 18-35% of the
   // nearest eight were the ones wearing a humanoid, because the humanoids had been claimed by
   // people who have since walked away. So each frame the furthest-fallen humanoid holder and
   // the highest-ranked citizen stuck on a baked figure both release their slots, and the
   // assignment pass below -- humanoid slots first, candidates already in score order -- puts
   // them back the right way round.
   //
   // HOLD is hysteresis. Without it a citizen sitting on the quota boundary would be demoted
   // and promoted on alternate frames, which is a body swapping its clothes twice a frame.
   const HOLD=4,quota=limitFor(HUMANOID_LIMITS);
   if(quota>0){
    const rank=new Map();for(let i=0;i<candidates.length;i++)rank.set(candidates[i].p.id,i);
    let promote=null,demote=null;
    for(const c of candidates){
     if(rank.get(c.p.id)>=quota)break;
     if(slots.some(x=>x.id===c.p.id&&!x.human)){promote=c.p.id;break;}
    }
    if(promote!==null)for(const x of slots){
     if(!x.human||x.id===null)continue;
     const r=rank.get(x.id)??Infinity;
     if(r>=quota+HOLD&&(!demote||r>(rank.get(demote.id)??Infinity)))demote=x;
    }
    if(demote){
     demote.id=null;demote.figure.hide();
     const held=slots.find(x=>x.id===promote);
     if(held){held.id=null;held.figure.hide();}
    }
   }

   // Free humanoid slots go to the nearest candidates who do not already have a body. Held
   // slots are never taken away mid-stride: swapping a citizen between a humanoid and a baked
   // figure changes its wardrobe and its height, which is a pop, and the radius churns fast
   // enough that a humanoid frees up within a second or so anyway. `freeSlots` is humanoid
   // first and `candidates` is already score-ordered, so this hands the better bodies to the
   // nearest without a second sort of the people.
   const freeSlots=slots.filter(s=>s.id===null).sort((a,b)=>(b.human?1:0)-(a.human?1:0));
   let nextFree=0;

   selected.clear();
   stats.humanoids=0;stats.baked=0;stats.ik=0;
   for(const {p} of candidates){
    let slot=slots.find(s=>s.id===p.id);
    if(!slot){
     slot=freeSlots[nextFree++];
     if(!slot)continue;
     slot.id=p.id;slot.figure.reset();
     if(slot.human){
      // A different person, not a recoloured copy of the same one.
      slot.figure.recolour(wardrobe(p.id));
     }else slot.figure.recolour({top:palette[Math.abs(p.id)%palette.length]});
     // Height varies by archetype and then a little per body, so a row of citizens is not a
     // row of one citizen.
     const base=ARCHETYPES[p.archetype]?.height??1.76;
     slot.figure.setHeight(base*(.965+(Math.abs(p.id)%7)*.011));
     slot.elapsed=.1;
    }
    selected.add(p.id);slot.elapsed+=Math.max(0,dt);
    if(slot.human)stats.humanoids++;else stats.baked++;
    if(slot.ik)stats.ik++;
    const distance=Math.hypot(p.x-focus.x,p.z-focus.z),interval=distance<12?0:1/30;
    const reaction=p.reactionUntil>clock?p.trafficReaction:p.reactionUntil+.6>clock?'recover':null;
    const state={trafficReaction:reaction,threatHeading:p.threatHeading,x:p.renderX??p.x,y:p.height??0,z:p.renderZ??p.z,heading:p.heading,speed:p.speed,alive:true,animationPhase:Math.abs(p.id)*.137,attackTime:p.combatAction>0?Math.min(.42,p.combatAction*.42):0};
    if(slot.elapsed>=interval){slot.figure.update(state,Math.min(.1,slot.elapsed));slot.elapsed=0;}
    else slot.figure.root.position.set(state.x,state.y,state.z);
   }
   return selected;
  },
  /** Which body a citizen currently wears, or null if the pool is not holding them. */
  bodyOf(id){const s=slots.find(x=>x.id===id);return s?(s.human?'humanoid':'baked'):null;},
  setTier(value){
   tier=value;clear();
   // Dropping to a tier with a smaller humanoid quota has to drop humanoids, not just slots:
   // LOW allows none at all, and popping off the end would keep whichever kind happened to be
   // last. Humanoids over quota go first, then any slot over the pool limit.
   let overHuman=slots.filter(s=>s.human).length-limitFor(HUMANOID_LIMITS);
   for(let i=slots.length-1;i>=0&&overHuman>0;i--)
    if(slots[i].human){slots.splice(i,1)[0].figure.dispose();overHuman--;}
   while(slots.length>(NEAR_LIMITS[tier]??4))slots.pop().figure.dispose();
  },
  inspect(){
   const humanSlots=slots.filter(s=>s.human).length;
   return {active:selected.size,capacity:slots.length,limit:NEAR_LIMITS[tier]??4,
    humanoidLimit:limitFor(HUMANOID_LIMITS),ikLimit:limitFor(NEAR_IK_LIMITS),
    humanoidSlots:humanSlots,humanoidsActive:stats.humanoids,bakedActive:stats.baked,
    footIK:stats.ik,humanAssetReady:!!human,
    sharedGeometry:true,
    // Three meshes a humanoid, six a baked figure.
    drawCallsUpperBound:stats.humanoids*3+stats.baked*6,
    triangles:stats.humanoids*humanTrianglesPerRig+stats.baked*trianglesPerRig};
  },
  dispose(){if(disposed)return;disposed=true;for(const s of slots)s.figure.dispose();slots.length=0;selected.clear();root.removeFromParent();root.clear();}
 };
}
