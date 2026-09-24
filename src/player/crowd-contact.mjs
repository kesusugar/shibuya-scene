// The player's body against the crowd's bodies.
//
// Walls are `advance()`'s business (controller.mjs); this is the other half: the people. It is
// capsule-against-capsule with steering, the way walking contact is resolved in games that have
// a crowd this size, and not a physics engine -- a rigid body for each of ~2,000 people would not
// run on a phone, and a solver pushing the choreographed Scramble cast would stall the signals.
//
// Pure: no DOM and no three.js, so it is tested headless against the real network.
//
// What it does, per frame, in this order:
//  1. an overlap that already exists (someone walked into the player) is pushed apart, the
//     player taking at most a third of it -- the person gives way through `flee`;
//  2. the part of the player's step that would press into a body is removed, so the player
//     slides past a shoulder the way `advance()` slides along a wall;
//  3. a step blocked head-on is tried a little to either side before giving up;
//  4. if every way is blocked the player still moves at `shove` along the input, and the people
//     in front get out of the way. A full scramble must never trap the player.
//
// Bounded: every query reads the simulation's own 2 m grid, 3x3 cells round the player.
import {RADIUS} from '../life/config.mjs';

export const CONTACT=Object.freeze({
 playerRadius:.35,       // PLAYER.radius (not imported: controller.mjs imports this module)
 bodyRadius:RADIUS,      // a pedestrian's body
 gap:.35+RADIUS,         // the two together: closest the centres may come
 level:1.2,              // m: people further above or below (decks, bridges) are not in the way
 shove:.45,              // m/s: the least the player still makes when fully boxed in
 depenetrate:.8,         // m/s: how fast an existing overlap is opened
 cooldown:.6,            // s: per person, so one body is bumped once and not every frame
 knockDown:false,        // a sprint bump never knocks anyone down (see the plan, section 2)
 // RUN "player crowd contact": the part of a bump that turns into a fight, drawn once per bump
 // from the simulation's own seeded rng.
 fightChance:.3,
 sprint:3.7              // m/s: a bump at or above this is a hard one (Step C)
});

// Tried in this order when the straight step is blocked: small turns first, then wider ones.
const TURNS=[.45,.9,1.35];
const EMPTY=[];

/**
 * The pedestrians who can be in the player's way, into `out` (reused, never reallocated).
 * Not the player's own slot, not anyone down or dead (the player steps over a body), and not
 * anyone on another level.
 */
export function bodiesNear(crowd,x,z,y,r=1.4,out=[]){
 out.length=0;
 const grid=crowd?.grid;if(!grid)return out;
 const ix=Math.floor(x/2),iz=Math.floor(z/2),r2=r*r;
 for(let i=ix-1;i<=ix+1;i++)for(let j=iz-1;j<=iz+1;j++)for(const p of grid.get(i+','+j)??EMPTY){
  if(!p.active||p.controlled||p.struck!==undefined||p.combatDead)continue;
  if(Math.abs((p.height??0)-(y??0))>CONTACT.level)continue;
  if((p.x-x)**2+(p.z-z)**2>r2)continue;
  out.push(p);
 }
 return out;
}

/**
 * Take out of `dx,dz` whatever would bring the player's circle inside a body's. The part of
 * the step that goes past a body is kept, which is what makes it a slide. A few passes, so a
 * correction against one person cannot push the step into the next.
 */
function constrain(x,z,dx,dz,bodies,out){
 const g=CONTACT.gap;let rx=dx,rz=dz,checks=0;
 for(let pass=0;pass<3;pass++){
  let changed=false;
  for(const b of bodies){
   const vx=b.x-x,vz=b.z-z,d=Math.hypot(vx,vz);checks++;
   if(d<1e-6)continue;
   const mx=vx/d,mz=vz/d,along=rx*mx+rz*mz;
   if(along<=0)continue;                  // moving away from them, or past them
   const room=Math.max(0,d-g);
   if(along>room){rx-=(along-room)*mx;rz-=(along-room)*mz;changed=true;}
  }
  if(!changed)break;
 }
 out.dx=rx;out.dz=rz;return checks;
}

/**
 * One frame of the player's step against the bodies near them. Returns `out`:
 * `{dx, dz, shoved, contacts}`. `contacts` is a reused list of `{p, d, into}` for everyone
 * touching the player after the step: `d` the centre distance, `into` whether the player was
 * moving into them (a bump) rather than them into the player.
 *
 * `pushing` is whether there is movement input; without it there is no shove.
 */
export function resolveStep(state,dx,dz,bodies,dt,pushing=false,out={dx:0,dz:0,shoved:false,contacts:[],checks:0}){
 const g=CONTACT.gap,contacts=out.contacts??=[],records=out.records??=[];
 out.shoved=false;out.checks=0;
 let used=0;
 const note=(p,d,into)=>{const c=records[used]??={p:null,d:0,into:false};c.p=p;c.d=d;c.into=into;contacts[used++]=c;};
 if(!bodies.length){out.dx=dx;out.dz=dz;contacts.length=0;return out;}

 // 1. An overlap that is already there. The player takes a third of it at most.
 let pushX=0,pushZ=0;
 const k=Math.min(1,CONTACT.depenetrate*dt);
 for(const b of bodies){
  const ox=state.x-b.x,oz=state.z-b.z,d=Math.hypot(ox,oz);out.checks++;
  if(d>=g)continue;
  // Exactly on top of each other (a teleport): a side by id, so it is the same every time.
  const nx=d>1e-6?ox/d:(b.id%2?1:-1),nz=d>1e-6?oz/d:0;
  const amount=Math.min(g-d,k)/3;
  pushX+=nx*amount;pushZ+=nz*amount;
 }

 // 2. The step, with what would press into a body removed.
 const want=Math.hypot(dx,dz);
 out.checks+=constrain(state.x,state.z,dx,dz,bodies,out);
 let rx=out.dx,rz=out.dz;

 // 3. Blocked more or less head-on: try the step turned a little either side, the side away
 // from whoever is most in the way first.
 if(pushing&&want>1e-6&&Math.hypot(rx,rz)<want*.35){
  let lean=0;
  for(const b of bodies){const vx=b.x-state.x,vz=b.z-state.z,d=Math.hypot(vx,vz);
   if(d<g+want+.05)lean+=(dx*vz-dz*vx)/(d||1);}   // >0: the crowd is to the step's right
  const first=lean>0?1:-1;
  let best=Math.hypot(rx,rz);
  for(const t of TURNS)for(const side of [first,-first]){
   const a=t*side,c=Math.cos(a),s=Math.sin(a),tx=dx*c+dz*s,tz=-dx*s+dz*c;
   out.checks+=constrain(state.x,state.z,tx,tz,bodies,out);
   const got=Math.hypot(out.dx,out.dz);
   if(got>best+1e-9){best=got;rx=out.dx;rz=out.dz;}
  }
 }

 // 4. Boxed in: the step never goes to nothing while there is input.
 const floor=CONTACT.shove*dt;
 if(pushing&&want>1e-6&&Math.hypot(rx,rz)<floor){
  const ux=dx/want,uz=dz/want,f=Math.min(floor,want);
  rx=ux*f;rz=uz*f;out.shoved=true;
  // The push-out does not undo the shove; it may only move the player sideways.
  const back=pushX*ux+pushZ*uz;
  if(back<0){pushX-=back*ux;pushZ-=back*uz;}
 }
 out.dx=rx+pushX;out.dz=rz+pushZ;

 // Who is touching the player after the step, and whether the player walked into them.
 const ax=state.x+out.dx,az=state.z+out.dz;
 for(const b of bodies){
  const d=Math.hypot(b.x-ax,b.z-az);
  if(d>g+.05)continue;
  const into=want>1e-6&&((b.x-state.x)*dx+(b.z-state.z)*dz)>0;
  note(b,d,into);
 }
 contacts.length=used;
 return out;
}

/**
 * The contact system the controller owns: the reused buffers, and the numbers the QA hook shows.
 * `onBump(p, bump)` is told about each bump, once per person per cooldown, after the person's
 * own reaction here has been applied.
 */
export function createCrowdContact({onBump=null}={}){
 const bodies=[],result={dx:0,dz:0,shoved:false,contacts:[],checks:0};
 const stats={checks:0,contacts:0,bumps:0,dodges:0,fights:0,minGap:null,trappedSeconds:0,lastMs:0};
 const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
 let lastStart=0;
 const api={
  stats,
  get bodies(){return bodies;},
  /** Step 1-4 above for this frame's step. Returns `{dx, dz, shoved, contacts}`. */
  resolve(crowd,state,dx,dz,dt,pushing){
   lastStart=now();
   const reach=CONTACT.gap+Math.hypot(dx,dz)+.2;
   bodiesNear(crowd,state.x,state.z,state.y,reach,bodies);
   resolveStep(state,dx,dz,bodies,dt,pushing,result);
   stats.checks+=result.checks+bodies.length;
   if(result.shoved)stats.trappedSeconds+=dt;
   return result;
  },
  /**
   * The people's side, after the player has moved: whoever the player walked into gives way,
   * and whoever walked into the player is moved off them.
   */
  react(crowd,state,dt){
   for(const c of result.contacts){
    const p=c.p;
    const d=Math.hypot(p.x-state.x,p.z-state.z);
    stats.minGap=stats.minGap===null?d:Math.min(stats.minGap,d);
    stats.contacts++;
    if(c.into){const b=bump(crowd,p,state);if(b){stats.bumps++;if(b.dodged)stats.dodges++;if(b.fight)stats.fights++;onBump?.(p,b);}}
    else if(d<CONTACT.gap&&giveWay(crowd,p,state,d))stats.dodges++;
   }
   stats.lastMs=now()-lastStart;
  },
  reset(){Object.assign(stats,{checks:0,contacts:0,bumps:0,dodges:0,fights:0,minGap:null,trappedSeconds:0,lastMs:0});},
  snapshot(){return {...stats};}
 };
 return api;
}

/**
 * Which way a bumped person steps: off the player's line, on the side they are already on,
 * and a little onward. Straight away from the player would put them back in front of a player
 * who is still walking, to be bumped again when the cooldown runs out.
 */
function sideStep(p,state){
 const h=state.bodyHeading??state.heading??0,ux=Math.sin(h),uz=Math.cos(h);
 const ox=p.x-state.x,oz=p.z-state.z,lateral=ox*uz-oz*ux;
 const side=Math.abs(lateral)>.04?Math.sign(lateral):(p.id%2?1:-1);
 const d=Math.hypot(ox,oz)||1;
 return {x:uz*side+ox/d*.5,z:-ux*side+oz/d*.5};
}

/**
 * A person the player walked into. Once per person per `CONTACT.cooldown`, and never someone
 * already running from something. They step aside with the same `dodge` flight the slow player
 * car uses -- it moves the choreographed cast through their flee offset and brings them back to
 * their track, and it never calls `leave()`, so no signal group is ever held for a bump.
 */
export function bump(crowd,p,state){
 if((p.bumpUntil??-Infinity)>crowd.time||p.flee)return null;
 p.bumpUntil=crowd.time+CONTACT.cooldown;
 const speed=Math.max(0,state.speed??0),d=Math.hypot(p.x-state.x,p.z-state.z),away=sideStep(p,state);
 const dodged=!!crowd.flee?.(p,away.x,away.z,{urgency:0,dodge:true,from:state,speed:1.2+.3*speed,
  distance:CONTACT.gap-d+.35,voice:false});
 crowd.stats.bumped=(crowd.stats.bumped??0)+1;
 return {dodged,speed,fight:false,strong:false};
}

/** Someone who walked into the player: out of the way, no bump. Rate limited the same way. */
function giveWay(crowd,p,state,d){
 if((p.bumpUntil??-Infinity)>crowd.time||p.flee)return false;
 p.bumpUntil=crowd.time+CONTACT.cooldown;
 const ox=p.x-state.x,oz=p.z-state.z;
 return !!crowd.flee?.(p,ox,oz,{urgency:0,dodge:true,from:state,speed:1.2,distance:CONTACT.gap-d+.3,voice:false});
}
