// Melee that happens when the fist arrives, not when the button is pressed.
//
// RUN 8. The previous version applied damage in the same tick as the input: `request()` set a
// flag, the next `update` chose a target and subtracted health immediately, and `attackTime`
// was only a countdown for the renderer. A punch could therefore land before the arm moved,
// and could not miss -- if anyone was in range at the press, they were hit.
//
// Now a swing is an object with a clock, and the hit test runs inside the clip's own active
// window. That makes three things true that were not before: you can miss, you can start a
// swing at nobody and connect because they walked into it, and the damage lands when the hand
// is out.
//
// AUTHORITY. The simulation decides who was hit, how much health they lost, and whether they
// go down. The high-fidelity crowd renderer only shows it. Nothing here reaches into the HQ
// crowd, and the HQ crowd never decides combat -- it reads `struck` and `combatDead` off the
// pedestrian, exactly as it already reads them for a car.
import {ATTACKS,attackOf} from './attack-timing.mjs';

export const COMBAT=Object.freeze({range:1.75,notice:4.5,playerDamage:34,npcDamage:14,
 attackSeconds:.42,npcWindup:.55,npcCooldown:1.05,hostileSeconds:14,
 // How wide a swing reaches, in radians either side of where the body is facing. A punch is
 // not a radius: something directly behind you cannot be hit.
 arc:1.05,
 // What a punch does to the people who see it, and how far that carries. Bounded on purpose:
 // one punch must not empty the crossing.
 witnessRadius:11,witnessSeverity:.72});

export const PHASE=Object.freeze({IDLE:'idle',WINDUP:'windup',ACTIVE:'active',RECOVERY:'recovery'});

const nearby=(crowd,x,z,r)=>{const out=[],ix=Math.floor(x/2),iz=Math.floor(z/2),cells=Math.ceil(r/2);
 for(let i=ix-cells;i<=ix+cells;i++)for(let j=iz-cells;j<=iz+cells;j++)
  for(const p of crowd?.grid?.get(i+','+j)??[])if(!out.includes(p))out.push(p);
 return out;};
const angleTo=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z);
const turn=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

/**
 * @param {object} [options]
 * @param {null|((event:{x:number,z:number,severity:number,radius:number,
 *   attacker:string,victim:number|null,time:number})=>number)} [options.onWitness]
 *   Called when a punch is thrown, with where and how bad. Returns how many people reacted.
 *   The listener owns the bounding; this module does not scan the crowd itself.
 */
export function createMeleeCombat({onWitness=null}={}){
 let pending=false,target=null,disposed=false,swingIndex=0;
 let swing=null;                       // the attack in flight, or null
 const stats={swings:0,hits:0,misses:0,npcHits:0,npcDeaths:0,witnessEvents:0,witnesses:0};

 /**
  * Who may be punched.
  *
  * A pedestrian on a crossing IS a valid target -- excluding them made the middle of a
  * scramble crossing, which is most of this map, a place where combat silently did nothing.
  * What protects the signals is not refusing to hit them; it is refusing to take them off
  * their route for anything short of going down. See `engage`.
  */
 const eligible=(p,crowd)=>p.active&&!p.controlled&&!p.choreographed&&p.struck===undefined&&
  !p.combatDead&&p.archetype!=='kid'&&crowd.network.ctx.safe(p.x,p.z,.28);

 /** The best target for a swing landing right now, or null. Range and arc, not nearest. */
 function choose(crowd,state){
  let best=null,score=Infinity;
  for(const p of nearby(crowd,state.x,state.z,COMBAT.range)){
   if(!eligible(p,crowd))continue;
   const d=Math.hypot(p.x-state.x,p.z-state.z);
   if(d>COMBAT.range)continue;
   const facing=state.bodyHeading??state.heading;
   const a=Math.abs(turn(facing,angleTo(state,p)));
   if(a>COMBAT.arc)continue;                       // behind, or off to the side
   const s=d+a*.65;
   if(s<score){score=s;best=p;}
  }
  return best;
 }

 /**
  * Make a pedestrian hostile.
  *
  * A pedestrian who is mid-crossing is NOT pulled off their route to fight. Stopping them
  * where they stand would hold their signal group while the controller waits for the crossing
  * to clear, and eight of those is what froze every signal on the map once before. They take
  * the damage and the reaction and keep walking; only going down takes them off the route,
  * and that happens through `crowd.strike`, which releases the group properly.
  */
 function engage(crowd,p,state){
  p.combatHealth??=100;
  p.combatTarget='player';
  p.combatUntil=crowd.time+COMBAT.hostileSeconds;
  if(!p.crossing){
   crowd.leave(p);
   p.combatNext=Math.max(p.combatNext??0,crowd.time+COMBAT.npcWindup);
   p.state='fighting';p.speed=0;p.heading=angleTo(p,state);
   target=p;
  }
  crowd.say?.(p,'alert',.75);
 }

 function kill(crowd,p,state){
  p.combatDead=true;p.combatTarget=null;p.combatAction=-1;stats.npcDeaths++;
  const dx=p.x-state.x,dz=p.z-state.z;
  // `strike` is the simulation's own knock-down: it calls `leave` first, so a crossing is
  // released rather than abandoned, and the HQ crowd picks the body up from `struck`.
  crowd.strike(p,dx,dz,2.4);p.fatal=true;
 }

 /** Tell whoever is listening that a punch was thrown here. Bounded by the listener. */
 function witness(crowd,state,victim,severity){
  if(!onWitness)return;
  const n=onWitness({x:state.x,z:state.z,severity,radius:COMBAT.witnessRadius,
   attacker:'player',victim:victim?.id??null,time:crowd.time??0})|0;
  stats.witnessEvents++;stats.witnesses+=n;
 }

 /** One swing's worth of state. The clip decides its own timing; see attack-timing.mjs. */
 function start(player){
  const name=ATTACKS[swingIndex%ATTACKS.length].name;
  swingIndex++;
  const timing=attackOf(name);
  swing={id:swingIndex,name,timing,elapsed:0,phase:PHASE.WINDUP,hitConsumed:false};
  stats.swings++;
  // The renderer plays the clip for as long as the clip lasts, not for a fixed 0.42 s.
  player.startAttack?.(timing.duration,name);
  return swing;
 }

 return {
  request(){if(!disposed)pending=true;},
  get phase(){return swing?swing.phase:PHASE.IDLE;},
  get swing(){return swing&&{id:swing.id,name:swing.name,phase:swing.phase,
   elapsed:Number(swing.elapsed.toFixed(3)),hitConsumed:swing.hitConsumed};},

  update(dt,crowd,player){
   if(disposed||!crowd||!player?.state)return stats;
   const state=player.state;
   state.attackTime=Math.max(0,(state.attackTime??0)-dt);
   state.hurtTime=Math.max(0,(state.hurtTime??0)-dt);

   // A new swing only starts when the last one has finished. Holding the button does not
   // stack punches, and a press during recovery is dropped rather than queued.
   if(pending){
    pending=false;
    if(state.alive&&!swing)start(player);
   }

   if(swing){
    const before=swing.elapsed;
    swing.elapsed+=Math.max(0,dt);
    const {windup,activeEnd,duration}=swing.timing;
    const was=swing.phase;
    swing.phase=swing.elapsed<windup?PHASE.WINDUP
     :swing.elapsed<activeEnd?PHASE.ACTIVE
     :swing.elapsed<duration?PHASE.RECOVERY:PHASE.IDLE;

    // THE HIT TEST RUNS HERE, inside the active window, and at most once per swing. Choosing
    // the target at input time is what made a miss impossible.
    //
    // The test is whether this STEP crossed the window, not whether it landed inside it. A
    // frame long enough to step over a 180 ms window would otherwise skip the punch
    // entirely -- at 60 Hz that never happens, but a stall, a background tab or a test using
    // coarse steps all produce it, and a punch that silently does nothing when the frame
    // rate dips is worse than one that lands a frame late.
    const crossed=swing.elapsed>=windup&&before<activeEnd;
    if(crossed&&!swing.hitConsumed&&state.alive){
     const p=choose(crowd,state);
     if(p){
      swing.hitConsumed=true;
      engage(crowd,p,state);
      p.combatAction=1;
      p.combatHealth-=COMBAT.playerDamage;
      p.hurtUntil=crowd.time+.34;
      stats.hits++;
      if(p.combatHealth<=0)kill(crowd,p,state);
      witness(crowd,state,p,COMBAT.witnessSeverity);
     }
    }
    if(was!==PHASE.IDLE&&swing.phase===PHASE.IDLE){
     if(!swing.hitConsumed){stats.misses++;witness(crowd,state,null,COMBAT.witnessSeverity*.55);}
     swing=null;
    }
   }

   const hostiles=nearby(crowd,state.x,state.z,COMBAT.notice)
    .filter(p=>eligible(p,crowd)&&p.combatTarget==='player'&&p.combatUntil>crowd.time&&!p.crossing);
   for(const p of hostiles){
    const d=Math.hypot(state.x-p.x,state.z-p.z);
    p.heading=angleTo(p,state);p.state='fighting';p.speed=0;
    p.combatAction=Math.max(0,(p.combatAction??0)-dt*4);
    if(d>COMBAT.range*.82){
     const step=Math.min(.95*dt,d-COMBAT.range*.72),dx=(state.x-p.x)/d,dz=(state.z-p.z)/d,
      nx=p.x+dx*step,nz=p.z+dz*step;
     if(crowd.network.ctx.safe(nx,nz,.28)&&!crowd.vehicleOverlap(nx,nz,.35)&&!crowd.blocked?.(nx,nz,p,.52,false)){
      const old=crowd.cell(p.x,p.z);p.x=nx;p.z=nz;p.renderX=nx;p.renderZ=nz;
      if(crowd.cell(nx,nz)!==old){const b=crowd.grid.get(old),i=b?.indexOf(p);if(i>=0)b.splice(i,1);crowd.insert(p);}
     }
     p.npcSwing=null;
    }else if(state.alive){
     // The NPC swings on the same model the player does: a wind-up, then damage when the arm
     // is out. A player who has to respect a hit window while the crowd lands instantly is
     // not fighting, they are being audited.
     if(!p.npcSwing&&crowd.time>=(p.combatNext??0)){
      p.npcSwing={elapsed:0,timing:attackOf(ATTACKS[p.id%ATTACKS.length].name),hitConsumed:false};
      p.combatAction=1;
     }
     if(p.npcSwing){
      const before=p.npcSwing.elapsed;
      p.npcSwing.elapsed+=dt;
      const {windup,activeEnd,duration}=p.npcSwing.timing;
      // Crossing the window, not landing inside it -- the same rule the player's swing uses.
      // Having one and not the other meant a long frame silently disarmed the crowd while
      // the player kept punching, which is a difficulty setting nobody asked for.
      if(p.npcSwing.elapsed>=windup&&before<activeEnd&&!p.npcSwing.hitConsumed){
       p.npcSwing.hitConsumed=true;
       if(Math.hypot(state.x-p.x,state.z-p.z)<=COMBAT.range&&
          player.hurt?.(COMBAT.npcDamage+(p.id%3)*2,'fight'))stats.npcHits++;
      }
      if(p.npcSwing.elapsed>=duration){
       p.npcSwing=null;p.combatNext=crowd.time+COMBAT.npcCooldown+(p.id%4)*.12;
      }
     }
    }
   }
   if(target&&(!target.active||target.combatDead||target.combatUntil<=crowd.time))target=null;
   return stats;
  },
  snapshot(){return {...stats,target:target?.id??null,
   phase:swing?swing.phase:PHASE.IDLE,clip:swing?swing.name:null};},
  reset(){pending=false;target=null;swing=null;},
  dispose(){disposed=true;pending=false;target=null;swing=null;}
 };
}
