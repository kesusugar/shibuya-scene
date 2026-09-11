import {QUALITY,ARCHETYPES} from './config.mjs';
// The existing actor/mesh pool and vehicle signal locks are shared with ambient life.
// Only the Scramble cast uses fixed, reversible tracks and ignores pedestrian occupancy.
export class ScrambleChoreography {
 constructor(sim){this.sim=sim;this.occupied=new Set();this.candidates=new Map();this.cursor=0;this.inactiveCursor=0;this.cast=0;}
 slot(node,serial){const n=this.sim.network;
  const cacheKey=node.id??node.x+','+node.z;let candidates=this.candidates.get(cacheKey);if(!candidates){candidates=[];for(let i=0;i<360;i++){const angle=i*2.399963,radius=.3+(i%60)*.095,x=node.x+Math.cos(angle)*radius,z=node.z+Math.sin(angle)*radius;if(n.ctx.safe(x,z,.29)&&n.segmentSafe({x,z},node,false))candidates.push([x,z,Math.round(x/.32)+','+Math.round(z/.32)]);}this.candidates.set(cacheKey,candidates);}
  for(const unique of [true,false])for(let i=0;i<candidates.length;i++){const candidate=candidates[(serial+i)%candidates.length],occupied=this.occupied.has(candidate[2]);if(unique&&occupied||this.sim.vehicleOverlap(candidate[0],candidate[1],.35))continue;if(!occupied)this.occupied.add(candidate[2]);return [candidate[0],candidate[1],occupied?null:candidate[2]];}return null;
 }
 refill(initial){const s=this.sim,q=QUALITY[s.tier],target=Math.round(q.total*.85);let active=s.pool.filter(p=>p.active),cast=active.filter(p=>p.choreographed).length;this.cast=cast;
  if(!active.length){this.occupied.clear();this.cursor=0;this.inactiveCursor=0;}
  for(let attempts=0;cast<target&&active.length<q.total&&attempts<q.total*2;attempts++){
   let p=null;for(let i=0;i<s.pool.length;i++){const candidate=s.pool[this.inactiveCursor++%s.pool.length];if(!candidate.active){p=candidate;break;}}const e=s.crossCandidates[this.cursor++%s.crossCandidates.length];if(!p||!e)break;
   const reverse=s.crossCandidates.find(r=>r.crossingId===e.crossingId&&r.direction===-e.direction);if(!reverse)continue;
   const a=this.slot(s.network.nodes[e.from],p.id),b=this.slot(s.network.nodes[e.to],p.id+500);if(!a||!b){if(a)this.occupied.delete(a[2]);if(b)this.occupied.delete(b[2]);continue;}
   const points=[a,...e.points,b],lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
   const types=Object.keys(ARCHETYPES).filter(k=>k!=='kid'),type=types[p.id%types.length];
   Object.assign(p,{active:true,choreographed:true,mode:'scramble',state:'waiting',x:a[0],z:a[1],renderX:a[0],renderZ:a[1],previousX:a[0],previousZ:a[1],height:s.network.ctx.height(...a),archetype:type,color:p.id%ARCHETYPES[type].colors.length,heading:Math.atan2(b[0]-a[0],b[1]-a[1]),group:-1,leader:-1,route:[e.id],routeIndex:0,edge:e.id,node:e.from,destination:e.to,progress:0,age:0,stuck:0,speed:0,baseSpeed:1.75+(p.id%11)*.055,crossing:null,queueKey:null,lod:'near',elapsed:0,phase:s.rng()*6.28,animationTime:0,travelled:0,region:s.network.nodes[e.from].district,track:{points,lengths,length:lengths.at(-1),forward:true,distance:0,e,reverse,lastCycle:-1,cooldown:0}});
   s.insert(p);s.stats.spawned++;active.push(p);cast++;this.cast=cast;
  }
  // A small fixed supporting cast keeps station, Hachiko and Center-gai visible.
  const regions=['hachiko','station','center-gai'];for(let i=0;i<q.total&&active.length<q.total;i++){const region=regions[i%3],p=s.spawn('idle',region);if(p){p.choreographed=false;active.push(p);}}
 }
 move(p,dt){const s=this.sim,t=p.track,e=p.edge>=0?s.network.edges[p.edge]:t.e;p.animationTime+=dt;p.age+=dt;p.speed=0;
  if(!p.crossing){if(t.cooldown>0){t.cooldown-=dt;p.state=t.cooldown>.7?'exiting':'recycle';return;}p.state='waiting';const cycle=Math.floor((s.signals?.time??0)/108);if(t.lastCycle===cycle||!s.beginCrossing(p,e))return;t.lastCycle=cycle;}
  const next=Math.min(t.length,t.distance+p.baseSpeed*dt),at=t.forward?next:t.length-next;let lo=0,hi=t.lengths.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(t.lengths[mid]<=at)lo=mid;else hi=mid;}
  const a=t.points[lo],b=t.points[hi],blend=(at-t.lengths[lo])/(t.lengths[hi]-t.lengths[lo]||1),x=a[0]+(b[0]-a[0])*blend,z=a[1]+(b[1]-a[1])*blend;
  if(s.vehicleOverlap(x,z,.35))return; // Pedestrian contacts deliberately do not affect speed.
  p.previousX=p.x;p.previousZ=p.z;p.x=x;p.z=z;p.heading=Math.atan2(x-p.previousX,z-p.previousZ);p.speed=p.baseSpeed;p.travelled+=next-t.distance;p.height=s.network.ctx.height(x,z);p.state='crossing';t.distance=next;p.progress=next/t.length*e.length;
  if(next>=t.length){const key=e.crossingId+':'+e.direction;s.stats.completed[key]=(s.stats.completed[key]??0)+1;s.stats.routeCompletions++;s.leave(p);t.forward=!t.forward;t.distance=0;t.cooldown=1+(p.id%7)*.15;p.state='exiting';const back=t.forward?t.e:t.reverse;p.edge=back.id;p.route=[back.id];p.node=back.from;p.destination=back.to;p.progress=0;if(this.cast>Math.round(QUALITY[s.tier].total*.85)){this.cast--;s.despawn(p,'profile');}}
 }
}
