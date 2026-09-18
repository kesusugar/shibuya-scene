// Small, local melee state machine. It reuses pooled pedestrians and never allocates a
// second NPC population. Combat is intentionally restricted to nearby adults on safe
// pavement so it cannot steal a pedestrian crossing reservation or deadlock traffic.
export const COMBAT=Object.freeze({range:1.75,notice:4.5,playerDamage:34,npcDamage:14,
 attackSeconds:.42,npcWindup:.55,npcCooldown:1.05,hostileSeconds:14});

const nearby=(crowd,x,z,r)=>{const out=[],ix=Math.floor(x/2),iz=Math.floor(z/2),cells=Math.ceil(r/2);
 for(let i=ix-cells;i<=ix+cells;i++)for(let j=iz-cells;j<=iz+cells;j++)
  for(const p of crowd?.grid?.get(i+','+j)??[])if(!out.includes(p))out.push(p);
 return out;};
const angleTo=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z);
const turn=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

export function createMeleeCombat(){
 let pending=false,target=null,disposed=false,stats={swings:0,hits:0,npcHits:0,npcDeaths:0};
 const eligible=(p,crowd)=>p.active&&!p.controlled&&!p.choreographed&&p.struck===undefined&&!p.combatDead&&
  p.archetype!=='kid'&&!p.crossing&&crowd.network.ctx.safe(p.x,p.z,.28);
 function choose(crowd,state){let best=null,score=Infinity;
  for(const p of nearby(crowd,state.x,state.z,COMBAT.range)){
   if(!eligible(p,crowd))continue;const d=Math.hypot(p.x-state.x,p.z-state.z),a=Math.abs(turn(state.heading,angleTo(state,p)));
   if(a>1.25)continue;const s=d+a*.65;if(s<score){score=s;best=p;}
  }return best;}
 function engage(crowd,p,state){
  crowd.leave(p);p.combatHealth??=100;p.combatTarget='player';p.combatUntil=crowd.time+COMBAT.hostileSeconds;
  p.combatNext=Math.max(p.combatNext??0,crowd.time+COMBAT.npcWindup);p.state='fighting';p.speed=0;
  p.heading=angleTo(p,state);crowd.say?.(p,'alert',.75);target=p;
 }
 function kill(crowd,p,state){p.combatDead=true;p.combatTarget=null;p.combatAction=-1;stats.npcDeaths++;
  const dx=p.x-state.x,dz=p.z-state.z;crowd.strike(p,dx,dz,2.4);p.fatal=true;
 }
 return {
  request(){if(!disposed)pending=true;},
  update(dt,crowd,player){if(disposed||!crowd||!player?.state)return stats;const state=player.state;
   state.attackTime=Math.max(0,(state.attackTime??0)-dt);state.hurtTime=Math.max(0,(state.hurtTime??0)-dt);
   if(pending){pending=false;if(!state.alive)return stats;stats.swings++;player.startAttack?.(COMBAT.attackSeconds);
    const p=choose(crowd,state);if(p){engage(crowd,p,state);p.combatAction=1;p.combatHealth-=COMBAT.playerDamage;
     stats.hits++;if(p.combatHealth<=0)kill(crowd,p,state);}}
   const hostiles=nearby(crowd,state.x,state.z,COMBAT.notice).filter(p=>eligible(p,crowd)&&p.combatTarget==='player'&&p.combatUntil>crowd.time);
   for(const p of hostiles){const d=Math.hypot(state.x-p.x,state.z-p.z);p.heading=angleTo(p,state);p.state='fighting';p.speed=0;
    p.combatAction=Math.max(0,(p.combatAction??0)-dt*4);
    if(d>COMBAT.range*.82){const step=Math.min(.95*dt,d-COMBAT.range*.72),dx=(state.x-p.x)/d,dz=(state.z-p.z)/d,nx=p.x+dx*step,nz=p.z+dz*step;
     if(crowd.network.ctx.safe(nx,nz,.28)&&!crowd.vehicleOverlap(nx,nz,.35)&&!crowd.blocked?.(nx,nz,p,.52,false)){const old=crowd.cell(p.x,p.z);p.x=nx;p.z=nz;p.renderX=nx;p.renderZ=nz;
      if(crowd.cell(nx,nz)!==old){const b=crowd.grid.get(old),i=b?.indexOf(p);if(i>=0)b.splice(i,1);crowd.insert(p);}}}
    else if(crowd.time>=(p.combatNext??0)&&state.alive){p.combatNext=crowd.time+COMBAT.npcCooldown+(p.id%4)*.12;p.combatAction=1;
     if(player.hurt?.(COMBAT.npcDamage+(p.id%3)*2,'fight'))stats.npcHits++;}
   }
   if(target&&(!target.active||target.combatDead||target.combatUntil<=crowd.time))target=null;
   return stats;
  },
  snapshot(){return {...stats,target:target?.id??null};},
  reset(){pending=false;target=null;},dispose(){disposed=true;pending=false;target=null;}
 };
}
