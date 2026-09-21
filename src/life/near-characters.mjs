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
   // The nearest by score get the humanoid; the priority order itself is untouched, so a
   // combat target or a reacting pedestrian still outranks someone merely closer.
   const humanLimit=human?Math.min(limitFor(HUMANOID_LIMITS),candidates.length):0;
   const ikLimit=Math.min(limitFor(NEAR_IK_LIMITS),humanLimit);
   for(let i=0;i<candidates.length;i++)candidates[i].wantsHuman=i<humanLimit;

   // Grow by one per frame, only while player mode needs a visible rig. No scene-startup work.
   //
   // Two reasons to add a slot: there are fewer slots than candidates, or a candidate wants a
   // humanoid and every free slot is baked. The second exists because a slot's kind is fixed
   // when it is built.
   //
   // `slots.length < limit` is a hard invariant rather than a fix for an observed leak. It was
   // added on the suspicion that the second condition could run away, and then measured: with
   // a real humanoid asset and a crowd churning through the near radius for five hundred
   // frames, capacity converges to the candidate count and stops, with or without the bound,
   // because free slots are reused by kind. The bound stays because the pool promises a
   // ceiling and a promise should not rest on a convergence argument -- but it is insurance,
   // and saying otherwise would be inventing a bug to have fixed.
   const needed=candidates.find(c=>!slots.some(s=>s.id===c.p.id&&s.human===c.wantsHuman));
   if(slots.length<limit&&
      (slots.length<candidates.length||(needed&&!slots.some(s=>s.id===null&&s.human===needed.wantsHuman)))){
    const wantHuman=needed?.wantsHuman??false;
    if(!asset){asset=bakedAsset();palette.push(...new Set(Object.values(ARCHETYPES).flatMap(a=>a.colors)));
     trianglesPerRig=measure(asset);}
    if(!wantHuman||human){
     const source=wantHuman?human:asset;
     // Foot IK only for the humanoid slots that are inside the budget, and only when the
     // ground query exists. RUN 5's solver is not changed for this; it is simply given or
     // not given a context.
     const wantsIK=wantHuman&&ctx&&slots.filter(s=>s.ik).length<ikLimit;
     const figure=createPlayerFigure(source,undefined,wantsIK?{ctx}:{});
     root.add(figure.root);slots.push({figure,id:null,elapsed:0,human:wantHuman,ik:!!wantsIK});
    }
   }
   const wanted=new Set(candidates.map(c=>c.p.id));
   for(const s of slots)if(!wanted.has(s.id)){s.id=null;s.figure.hide();}
   selected.clear();
   stats.humanoids=0;stats.baked=0;stats.ik=0;
   for(const {p,wantsHuman} of candidates){
    let slot=slots.find(s=>s.id===p.id);
    if(!slot){
     slot=slots.find(s=>s.id===null&&s.human===wantsHuman)??slots.find(s=>s.id===null);
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
    if(slot.ik&&slot.id!==null)stats.ik++;
    const distance=Math.hypot(p.x-focus.x,p.z-focus.z),interval=distance<12?0:1/30;
    const reaction=p.reactionUntil>clock?p.trafficReaction:p.reactionUntil+.6>clock?'recover':null;
    const state={trafficReaction:reaction,threatHeading:p.threatHeading,x:p.renderX??p.x,y:p.height??0,z:p.renderZ??p.z,heading:p.heading,speed:p.speed,alive:true,animationPhase:Math.abs(p.id)*.137,attackTime:p.combatAction>0?Math.min(.42,p.combatAction*.42):0};
    if(slot.elapsed>=interval){slot.figure.update(state,Math.min(.1,slot.elapsed));slot.elapsed=0;}
    else slot.figure.root.position.set(state.x,state.y,state.z);
   }
   return selected;
  },
  setTier(value){tier=value;clear();while(slots.length>(NEAR_LIMITS[tier]??4))slots.pop().figure.dispose();},
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
