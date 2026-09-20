import {ARCHETYPES} from './config.mjs';
import {Group} from 'three';
import {createPlayerFigure} from '../player/figure.mjs';
export const NEAR_LIMITS={high:32,medium:12,low:4};
// Shared baked geometry/materials; only a bounded pool has individual skeletons/mixers.
export function createNearCharacters(tier='high'){
 const root=new Group(),slots=[],selected=new Set(),palette=[];root.name='near-character-pool';
 let seed=null,disposed=false,trianglesPerRig=0;
 function clear(){selected.clear();for(const s of slots){s.id=null;s.figure.hide();}}
 return {root,selected,
  update(people,focus,dt,clock=0){
   if(disposed)return selected;
   if(!focus){clear();return selected;}
   const limit=NEAR_LIMITS[tier]??4;
   const candidates=people.filter(p=>p.active&&!p.controlled&&p.archetype!=='kid'&&p.struck===undefined&&Math.hypot(p.x-focus.x,p.z-focus.z)<(selected.has(p.id)?30:25))
    .map(p=>({p,score:Math.hypot(p.x-focus.x,p.z-focus.z)-(selected.has(p.id)?3:0)-(p.combatTarget?40:0)-(p.reactionUntil>clock?20:0)})).sort((a,b)=>a.score-b.score||a.p.id-b.p.id).slice(0,limit);
   // Grow by one per frame, only while player mode needs a visible rig. No scene-startup work.
   if(slots.length<candidates.length){if(!seed){seed=createPlayerFigure();seed.hide();seed.root.traverse(o=>{if(o.isMesh)trianglesPerRig+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});for(const color of [...new Set(Object.values(ARCHETYPES).flatMap(a=>a.colors))]){const material=seed.root.getObjectByName('HeroMaterial0').material.clone();material.color.setHex(color);palette.push(material);}}const figure=createPlayerFigure(seed.root);root.add(figure.root);slots.push({figure,id:null,elapsed:0});}
   const wanted=new Set(candidates.map(c=>c.p.id));
   for(const s of slots)if(!wanted.has(s.id)){s.id=null;s.figure.hide();}
   selected.clear();
   for(const {p} of candidates){let slot=slots.find(s=>s.id===p.id);if(!slot){slot=slots.find(s=>s.id===null);if(!slot)continue;slot.id=p.id;slot.figure.reset();slot.figure.root.getObjectByName('HeroMaterial0').material=palette[Math.abs(p.id)%palette.length];slot.figure.root.scale.setScalar((ARCHETYPES[p.archetype]?.height??1.76)/1.76);slot.elapsed=.1;}
    selected.add(p.id);slot.elapsed+=Math.max(0,dt);
    const distance=Math.hypot(p.x-focus.x,p.z-focus.z),interval=distance<12?0:1/30;
    const reaction=p.reactionUntil>clock?p.trafficReaction:p.reactionUntil+.6>clock?'recover':null;
    const state={trafficReaction:reaction,threatHeading:p.threatHeading,x:p.renderX??p.x,y:p.height??0,z:p.renderZ??p.z,heading:p.heading,speed:p.speed,alive:true,animationPhase:Math.abs(p.id)*.137,attackTime:p.combatAction>0?Math.min(.42,p.combatAction*.42):0};
    if(slot.elapsed>=interval){slot.figure.update(state,Math.min(.1,slot.elapsed));slot.elapsed=0;}
    else slot.figure.root.position.set(state.x,state.y,state.z);
   }
   return selected;
  },setTier(value){tier=value;clear();while(slots.length>(NEAR_LIMITS[tier]??4))slots.pop().figure.dispose();},
  inspect(){return {active:selected.size,capacity:slots.length,limit:NEAR_LIMITS[tier]??4,sharedGeometry:true,drawCallsUpperBound:selected.size*6,triangles:selected.size*trianglesPerRig};},
  dispose(){if(disposed)return;disposed=true;for(const s of slots)s.figure.dispose();seed?.dispose();palette.forEach(m=>m.dispose());slots.length=0;selected.clear();root.removeFromParent();root.clear();}
 };
}
