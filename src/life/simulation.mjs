import {ScrambleChoreography} from './choreography.mjs';
import {seededRandom} from '../geo/core.mjs';
import {VEHICLES} from '../traffic/config.mjs';
import {QUALITY,ARCHETYPES,POOL_SIZE,RADIUS,district} from './config.mjs';
import {route,edgePose,inCrossing} from './network.mjs';

// Fixed actor objects and spatial buckets. Routes allocate only on destination changes.
export class CrowdSimulation{
 constructor(network,{traffic=null,tier='medium',seed='shibuya-s10',choreography=false}={}){
  this.network=network;this.traffic=traffic;this.signals=traffic?.signals??null;this.rng=seededRandom(seed);this.tier=tier;this.time=0;this.accumulator=0;this.camera={x:55,z:65};this.grid=new Map();this.queue=new Map();this.exits=new Map();this.groups=[];this.temp={};this.next={};this.lodClock=0;this.refillClock=0;
  this.stats={spawned:0,despawned:0,reasons:{},recoveries:0,stuck:0,routeCompletions:0,signalViolations:0,entries:{},completed:{},neighborChecks:0,avoidanceChecks:0,updateMs:0,throttled:0,spawnDeferred:0};
  this.pool=Array.from({length:POOL_SIZE},(_,id)=>({id,active:false,x:0,z:0,heading:0,height:0,archetype:'casual',mode:'ambient',state:'walking',group:-1,leader:-1,route:[],routeIndex:0,edge:-1,progress:0,destination:-1,node:-1,speed:0,baseSpeed:1.3,age:0,stuck:0,pause:0,crossing:null,queueKey:null,lod:'near',elapsed:0,phase:0,color:0,animationTime:0,renderX:0,renderZ:0,previousX:0,previousZ:0,travelled:0,lastHeading:0,region:'commercial'}));
  this.candidates=network.eligible;this.byRegion=Object.fromEntries(['hachiko','center-gai','station','commercial'].map(k=>[k,this.candidates.filter(n=>n.district===k)]));this.crossCandidates=network.crossings.filter(e=>e.kind!=='normal'&&network.nodes[e.from].component===network.nodes[e.to].component);const lanes=new Map();for(const e of this.crossCandidates){const key=e.crossingId+':'+e.direction;if(!lanes.has(key))lanes.set(key,[]);lanes.get(key).push(e);}const groups=[...lanes.values()];this.crossCandidates=[];for(let row=0;row<Math.max(0,...groups.map(g=>g.length));row++)for(const group of groups)if(group[row])this.crossCandidates.push(group[row]);this.crossCursor=0;this.choreography=choreography?new ScrambleChoreography(this):null;this.refill(true);
 }
 cell(x,z){return Math.floor(x/2)+','+Math.floor(z/2);}
 insert(p){const k=this.cell(p.x,p.z);if(!this.grid.has(k))this.grid.set(k,[]);this.grid.get(k).push(p);}
 rebuild(){for(const b of this.grid.values())b.length=0;for(const p of this.pool)if(p.active)this.insert(p);}
 blocked(x,z,p,r=RADIUS*2+.06,includeReservations=true){if(p?.choreographed)return false;if(includeReservations&&!p?.crossing)for(const [id,owners] of this.exits){const e=this.network.edges[p?.edge];if(owners.has(p?.id)||e?.crossingId&&e.to===id)continue;const n=this.network.nodes[id];const distance=Math.hypot(x-n.x,z-n.z);if(distance<.85&&(!p||distance<=Math.hypot(p.x-n.x,p.z-n.z)))return true;}const ix=Math.floor(x/2),iz=Math.floor(z/2);for(let i=ix-1;i<=ix+1;i++)for(let j=iz-1;j<=iz+1;j++)for(const q of this.grid.get(i+','+j)??[]){if(q===p||!q.active||q.choreographed)continue;this.stats.neighborChecks++;if((q.x-x)**2+(q.z-z)**2<r*r)return true;}return false;}
 vehicleOverlap(x,z,r=RADIUS+.1){if(!this.traffic)return false;const ix=Math.floor(x/15),iz=Math.floor(z/15);for(let i=ix-1;i<=ix+1;i++)for(let j=iz-1;j<=iz+1;j++)for(const v of this.traffic.grid.get(i+','+j)??[]){if(!v.active)continue;const def=VEHICLES[v.type],dx=x-v.x,dz=z-v.z,c=Math.cos(v.heading),s=Math.sin(v.heading);if(Math.abs(dx*c-dz*s)<def.width/2+r&&Math.abs(dx*s+dz*c)<def.length/2+r)return true;}return false;}
 leave(p){for(const [id,owners] of this.exits){owners.delete(p.id);if(!owners.size)this.exits.delete(id);}if(p.crossing){this.signals?.leavePedestrian(p.crossing,p.id);p.crossing=null;}if(p.queueKey){this.queue.get(p.queueKey)?.delete(p.id);p.queueKey=null;}}
 despawn(p,reason){if(!p.active)return;this.leave(p);p.active=false;this.stats.despawned++;this.stats.reasons[reason]=(this.stats.reasons[reason]??0)+1;if(reason==='stuck'){this.stats.stuck++;this.stats.recoveries++;}}
 setTier(tier){if(!QUALITY[tier])throw Error('Unknown crowd tier');if(tier===this.tier)return;this.tier=tier;this.choreography?.occupied.clear();for(const p of this.pool){if(p.active&&!p.crossing)this.despawn(p,'profile');else if(p.active){p.group=-1;p.leader=-1;p.mode='ambient';}}this.groups.length=0;this.refill(true);}
 setCamera(x,z){this.camera.x=x;this.camera.z=z;}
 chooseDestination(p,node,short=false){if(p.leader>=0&&this.pool[p.leader]?.active){const lead=this.pool[p.leader],dest=lead.destination,path=route(this.network,node.id,dest);if(path.length){p.route=path;p.routeIndex=0;p.edge=path[0];p.progress=0;p.node=node.id;p.destination=dest;return true;}}const region=short?node.district:this.rng()<.55?(node.district==='hachiko'?'center-gai':'hachiko'):node.district,candidates=this.byRegion[region]?.filter(n=>n.component===node.component&&Math.hypot(n.x-node.x,n.z-node.z)>(short?3:12)&&(!short||Math.hypot(n.x-node.x,n.z-node.z)<16));let list=candidates.length?candidates:this.candidates.filter(n=>n.component===node.component&&Math.hypot(n.x-node.x,n.z-node.z)>4);if(!list.length)return false;
  for(let i=0;i<5;i++){const dest=list[Math.floor(this.rng()*list.length)],path=route(this.network,node.id,dest.id);if(!path.length)continue;if(short&&(path.some(id=>this.network.edges[id].crossingId)||path.reduce((sum,id)=>sum+this.network.edges[id].length,0)>30))continue;const first=this.network.nodes[this.network.edges[path[0]].to],dot=Math.sin(p.heading)*(first.x-node.x)+Math.cos(p.heading)*(first.z-node.z);if(p.travelled>2&&dot<-.2&&i<4)continue;p.route=path;p.routeIndex=0;p.edge=path[0];p.progress=0;p.node=node.id;p.destination=dest.id;return true;}return false;
 }
 spawn(mode='ambient',region=null,leader=null,crossIndex=-1){const p=this.pool.find(p=>!p.active);if(!p)return false;const archetypes=Object.keys(ARCHETYPES).filter(k=>k!=='kid'||leader),type=leader&&p.id%2?'kid':archetypes[p.id%archetypes.length],def=ARCHETYPES[type];
  let nodes=region?this.byRegion[region]:this.candidates,cross=null;if(crossIndex>=0&&this.crossCandidates.length){cross=this.crossCandidates[crossIndex%this.crossCandidates.length];const endpoint=this.network.nodes[cross.from];nodes=this.candidates.filter(n=>n.component===endpoint.component&&Math.hypot(n.x-endpoint.x,n.z-endpoint.z)<10);}
  if(leader)nodes=this.candidates.filter(n=>n.component===this.network.nodes[leader.node].component&&Math.hypot(n.x-leader.x,n.z-leader.z)<4);
  for(let attempt=0;attempt<100;attempt++){const n=nodes[Math.floor(this.rng()*nodes.length)];if(!n||this.network.landingNodes.has(n.id)||this.blocked(n.x,n.z,null,.9)||this.vehicleOverlap(n.x,n.z,.6)||this.time>0&&Math.hypot(n.x-this.camera.x,n.z-this.camera.z)<12)continue;
   const jitter=this.rng()*.5-.25,jitterZ=this.rng()*.5-.25,sx=n.x+jitter,sz=n.z+jitterZ,valid=this.network.ctx.safe(sx,sz)&&!this.blocked(sx,sz,null,.65)&&!this.vehicleOverlap(sx,sz,.6),px=valid?sx:n.x,pz=valid?sz:n.z;
   Object.assign(p,{active:true,choreographed:false,x:px,z:pz,renderX:px,renderZ:pz,previousX:px,previousZ:pz,heading:this.rng()*Math.PI*2,height:this.network.ctx.height(n.x,n.z),archetype:type,mode,state:mode==='idle'?'idle':'walking',group:leader?.group??-1,leader:leader?.id??-1,route:[],routeIndex:0,edge:-1,progress:0,destination:n.id,node:n.id,speed:0,baseSpeed:leader?.baseSpeed??def.speed[0]+this.rng()*(def.speed[1]-def.speed[0]),age:0,stuck:0,pause:mode==='idle'?8+this.rng()*30:0,crossing:null,queueKey:null,lod:'near',elapsed:0,phase:this.rng()*Math.PI*2,color:Math.floor(this.rng()*def.colors.length),travelled:0,region:n.district});
   if(mode!=='idle'){
    if(cross){const approach=route(this.network,n.id,cross.from);if(n.id!==cross.from&&!approach.length){p.active=false;continue;}p.route=[...approach,cross.id];p.edge=p.route[0];p.destination=cross.to;}
    else if(!this.chooseDestination(p,n,mode==='milling')){p.active=false;continue;}
   }
   this.insert(p);this.stats.spawned++;return p;
  }this.stats.spawnDeferred++;return false;
 }
 refill(initial=false){if(this.choreography)return this.choreography.refill(initial);const q=QUALITY[this.tier];let count=this.pool.filter(p=>p.active).length;if(initial&&count===0){for(let i=0;i<q.idle;i++)if(this.spawn('idle',i%5===0?'station':i%3?'hachiko':'center-gai'))count++;for(let i=0;i<q.milling;i++)if(this.spawn('milling','hachiko'))count++;
   for(let i=0;i<q.groups;i++){const leader=this.spawn('group',i%2?'center-gai':'hachiko');if(!leader)continue;leader.group=this.groups.length;const group={id:leader.group,leader:leader.id,members:[leader.id]};this.groups.push(group);count++;for(let j=0;j<1+i%3;j++){const p=this.spawn('group',null,leader);if(p){group.members.push(p.id);count++;}}}
   const crossingCount=Math.round(q.total*.32);for(let i=0;i<crossingCount;i++)if(this.spawn('ambient',null,null,i))count++;
  }
  // Restore family/group membership after pooled actors expire, without growing the group pool.
  for(let gi=0;gi<q.groups&&count<q.total-1;gi++){
   let g=this.groups[gi];if(!g){g={id:gi,leader:-1,members:[]};this.groups[gi]=g;}
   g.members=g.members.filter(id=>this.pool[id].active&&this.pool[id].group===gi);
   if(!g.members.length){const leader=this.spawn('group',gi%2?'center-gai':'hachiko');if(!leader)continue;leader.group=gi;g.leader=leader.id;g.members=[leader.id];count++;}
   if(!g.members.includes(g.leader)){g.leader=g.members[0];const leader=this.pool[g.leader];leader.leader=-1;if(leader.archetype==='kid')leader.archetype='casual';}
   const leader=this.pool[g.leader];for(const id of g.members)this.pool[id].leader=id===g.leader?-1:g.leader;
   if(g.members.length<2&&count<q.total){const follower=this.spawn('group',null,leader);if(follower){g.members.push(follower.id);count++;}}
  }
  const budget=initial?q.total:12;for(let i=0;i<budget&&count<q.total;i++){const region=i%6===0?'center-gai':i%6===1?'hachiko':i%6===2?'station':null;const idle=this.pool.filter(p=>p.active&&p.mode==='idle').length,milling=this.pool.filter(p=>p.active&&p.mode==='milling').length;const mode=idle<q.idle?'idle':milling<q.milling?'milling':'ambient';const allocated=this.pool.filter(p=>p.active&&p.route.slice(p.routeIndex).some(id=>this.network.edges[id]?.kind!=='normal'&&this.network.edges[id]?.crossingId)).length;const cross=mode==='ambient'&&allocated<Math.round(q.total*.32)?this.crossCursor++:-1;if(this.spawn(mode,mode==='ambient'?region:'hachiko',null,cross))count++;}
 }
 beginCrossing(p,e){if(!this.signals)return false;const s=this.signals.getCrossingTrafficState(e.crossingId);if(!s.known||!s.vehicleClear||s.pedestrian!=='WALK'||this.signals.phase()[2]<5)return false;if((p.id%9)*.14>20-this.signals.phase()[2])return false;
  // Exit capacity is reserved by occupancy checks; no admission into a packed curb.
  const dest=this.network.nodes[e.to];if(this.blocked(dest.x,dest.z,p,.8)||this.vehicleOverlap(dest.x,dest.z,.6))return false;
  for(let d=0;d<e.length;d+=2){edgePose(this.network,e,d,this.temp);if(this.vehicleOverlap(this.temp.x,this.temp.z,.65))return false;}
  if(!this.exits.has(e.to))this.exits.set(e.to,new Set());this.exits.get(e.to).add(p.id);this.signals.enterPedestrian(s.groupId,p.id);p.crossing=s.groupId;p.state='crossing';if(p.queueKey)this.queue.get(p.queueKey)?.delete(p.id);p.queueKey=null;
  const key=e.crossingId+':'+e.direction;this.stats.entries[key]=(this.stats.entries[key]??0)+1;
  if(s.NS!=='RED'||s.EW!=='RED')this.stats.signalViolations++;return true;
 }
 allowed(x,z,p,e){if(this.vehicleOverlap(x,z))return false;if(!e.crossingId)return this.network.ctx.safe(x,z,.27);if(!p.crossing)return false;if(this.network.ctx.solid(x,z,.29)||this.network.ctx.onRoad(x,z)&&!inCrossing(x,z,e,.29))return false;
  // Lateral steering stays close to the mapped crossing track, never into another road.
  let dist=Infinity;const f=Math.floor(p.progress/e.length*(e.points.length-1));for(let i=Math.max(0,f-10);i<Math.min(e.points.length,f+11);i++)dist=Math.min(dist,Math.hypot(x-e.points[i][0],z-e.points[i][1]));return dist<.7;
 }
 move(p,dt){if(!p.active)return;if(p.choreographed)return this.choreography.move(p,dt);const n=this.network,oldCell=this.cell(p.x,p.z);p.age+=dt;p.animationTime+=dt;
  // Curb waiters and idle actors yield locally to occupied crossing exits.
  // They remain on walkable ground; no recycling or position snap clears a crossing.
  if(!p.crossing){for(const [id,owners] of this.exits){const end=n.nodes[id],dx=p.x-end.x,dz=p.z-end.z,d=Math.hypot(dx,dz);if(d>=3)continue;const owner=this.pool[owners.values().next().value],incoming=n.edges[owner.edge],start=n.nodes[incoming.from],angle=Math.atan2(end.z-start.z,end.x-start.x);for(const turn of [0,.6,-.6,1.2,-1.2]){const x=p.x+Math.cos(angle+turn)*.8*dt,z=p.z+Math.sin(angle+turn)*.8*dt;if(!n.ctx.safe(x,z)||this.vehicleOverlap(x,z)||this.blocked(x,z,p,.56,false))continue;p.previousX=p.x;p.previousZ=p.z;p.x=x;p.z=z;p.height=n.ctx.height(x,z);p.speed=.8;p.heading=Math.atan2(x-p.previousX,z-p.previousZ);if(this.cell(x,z)!==oldCell){const bucket=this.grid.get(oldCell),i=bucket?.indexOf(p);if(i>=0)bucket.splice(i,1);this.insert(p);}return;}}}
  if(p.mode==='idle'){p.state='idle';p.speed=0;if(p.age>240)this.despawn(p,'ttl');return;}
  if(p.pause>0){p.pause-=dt;p.state='milling';p.speed=0;return;}
  if(p.edge<0){if(!this.chooseDestination(p,n.nodes[p.node],p.mode==='milling'))this.despawn(p,'invalid-route');return;}
  const e=n.edges[p.edge];if(p.crossing&&p.progress<1&&n.ctx.safe(p.x,p.z)&&this.signals.phase()[0]!=='PEDESTRIAN'){this.leave(p);this.stats.cancelledCurbAdmissions=(this.stats.cancelledCurbAdmissions??0)+1;}if(e.crossingId&&!p.crossing){if(!this.beginCrossing(p,e)){p.state='waiting';p.speed=0;p.stuck=0;const key=e.crossingId+':'+e.direction;if(!this.queue.has(key))this.queue.set(key,new Set());this.queue.get(key).add(p.id);p.queueKey=key;return;}}
  p.state=p.crossing?'crossing':p.mode==='milling'?'milling':'walking';
  let speed=p.baseSpeed;
  if(p.group>=0&&!p.crossing){const g=this.groups[p.group],lead=this.pool[g?.leader];if(lead?.active){if(p.id===lead.id&&g.members.some(id=>this.pool[id].active&&Math.hypot(this.pool[id].x-p.x,this.pool[id].z-p.z)>5))speed*=.45;else if(p.id!==lead.id&&Math.hypot(lead.x-p.x,lead.z-p.z)>4)speed*=1.15;}}
  edgePose(n,e,Math.min(e.length,p.progress+.55),this.next);let dx=this.next.x-p.x,dz=this.next.z-p.z,dist=Math.hypot(dx,dz),step=Math.min(speed*dt,dist);if(dist>.0001){dx/=dist;dz/=dist;}
  let nx=p.x+dx*step,nz=p.z+dz*step,moved=false;
  if(this.allowed(nx,nz,p,e)&&!this.blocked(nx,nz,p)){moved=true;}else if(p.lod!=='far'||p.crossing||p.stuck>1){this.stats.avoidanceChecks++;
   // Deterministic right-side passing. Candidate boundary/collision checks override steering.
   for(const side of [1,-1]){const sx=dz*side,sz=-dx*side;nx=p.x+sx*step;nz=p.z+sz*step;if(this.allowed(nx,nz,p,e)&&!this.blocked(nx,nz,p)){moved=true;break;}}
  }
  if(moved){const travelled=Math.hypot(nx-p.x,nz-p.z);p.previousX=p.x;p.previousZ=p.z;p.x=nx;p.z=nz;p.speed=travelled/dt;p.travelled+=travelled;p.stuck=0;const target=Math.atan2(nx-p.previousX,nz-p.previousZ),diff=Math.atan2(Math.sin(target-p.heading),Math.cos(target-p.heading));p.heading+=Math.max(-3*dt,Math.min(3*dt,diff));
   // Project onto the local edge polyline. Steering never advances route distance for lateral motion.
   if(!e.points){const a=n.nodes[e.from],b=n.nodes[e.to];p.progress=Math.max(0,Math.min(e.length,((p.x-a.x)*(b.x-a.x)+(p.z-a.z)*(b.z-a.z))/e.length));}else{let best=Infinity,progress=p.progress;const f=Math.floor(p.progress/e.length*(e.points.length-1));for(let i=Math.max(0,f-8);i<Math.min(e.points.length-1,f+9);i++){const a=e.points[i],b=e.points[i+1],x=b[0]-a[0],z=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*x+(p.z-a[1])*z)/(x*x+z*z||1))),dist=(p.x-a[0]-t*x)**2+(p.z-a[1]-t*z)**2;if(dist<best){best=dist;progress=(i+t)/(e.points.length-1)*e.length;}}p.progress=progress;}
  }else{p.speed=0;p.stuck+=dt;}
  const end=n.nodes[e.to];if(p.progress>=e.length-.65&&Math.hypot(p.x-end.x,p.z-end.z)<.5&&n.ctx.safe(p.x,p.z)){p.node=e.to;p.progress=0;p.routeIndex++;
   if(e.crossingId){const key=e.crossingId+':'+e.direction;this.stats.completed[key]=(this.stats.completed[key]??0)+1;this.leave(p);}
   if(p.routeIndex<p.route.length)p.edge=p.route[p.routeIndex];else{this.stats.routeCompletions++;p.edge=-1;if(p.mode==='milling')p.pause=2+this.rng()*6;}
  }
  p.height=n.ctx.height(p.x,p.z);
  if(this.cell(p.x,p.z)!==oldCell){const b=this.grid.get(oldCell),i=b?.indexOf(p);if(i>=0)b.splice(i,1);this.insert(p);}
  if(p.stuck>35&&!p.crossing)this.despawn(p,'stuck');else if(p.age>240&&!p.crossing)this.despawn(p,'ttl');
 }
 step(dt){this.time+=dt;this.lodClock+=dt;this.refillClock+=dt;this.rebuild();if(this.lodClock>=1){this.lodClock=0;for(const p of this.pool)if(p.active){const d=Math.hypot(p.x-this.camera.x,p.z-this.camera.z);p.lod=d<65?'near':d<140?'mid':'far';}}
  // Rotate priority each fixed tick; ordering does not permanently privilege low IDs.
  const start=Math.floor(this.time*30)%this.pool.length;for(let j=0;j<this.pool.length;j++){const p=this.pool[(start+j)%this.pool.length];if(!p.active)continue;p.elapsed+=dt;const interval=p.crossing||p.choreographed?1/30:p.mode==='idle'?.5:p.lod==='near'?1/30:p.lod==='mid'?1/15:.2;if(p.elapsed+1e-8<interval){this.stats.throttled++;continue;}const elapsed=p.elapsed;p.elapsed=0;this.move(p,elapsed);}
  if(this.refillClock>=2){this.refillClock=0;this.refill();}
 }
 update(dt){const start=performance.now();this.accumulator+=Math.max(0,Math.min(.25,dt));while(this.accumulator>=1/30){this.step(1/30);this.accumulator-=1/30;}this.stats.updateMs=performance.now()-start;}
 snapshot(debug=false){const active=this.pool.filter(p=>p.active),counts=key=>Object.fromEntries([...new Set(active.map(p=>p[key]))].map(k=>[k,active.filter(p=>p[key]===k).length]));return {...this.stats,target:QUALITY[this.tier].total,choreographed:active.filter(p=>p.choreographed).length,waitingCells:this.network.stats.waitingCells??0,reasons:{...this.stats.reasons},entries:{...this.stats.entries},completed:{...this.stats.completed},total:active.length,tier:this.tier,archetypes:counts('archetype'),modes:counts('mode'),states:counts('state'),lod:counts('lod'),regions:counts('region'),hachiko:active.filter(p=>district(p.x,p.z)==='hachiko').length,centerGai:active.filter(p=>district(p.x,p.z)==='center-gai').length,groupCount:this.groups.filter(g=>g.members.filter(id=>this.pool[id].active&&this.pool[id].group===g.id).length>1).length,queueSizes:Object.fromEntries([...this.queue].map(([k,s])=>[k,s.size])),...(debug?{actors:active.map(p=>({id:p.id,archetype:p.archetype,edge:p.edge,destination:p.destination,state:p.state,queue:p.queueKey,group:p.group,lod:p.lod,stuck:p.stuck,radius:RADIUS,grid:this.cell(p.x,p.z),crossing:p.crossing})),signalPhase:this.signals?.phase()??'unbound'}:{})};}
 audit(){const findings=[],minor={groupSeparation:0,stuck:0};let maxStack=0;for(const p of this.pool){if(!p.active)continue;if(![p.x,p.z,p.heading,p.height].every(Number.isFinite))findings.push({id:p.id,kind:'finite'});if(p.edge>=0&&!this.network.edges[p.edge])findings.push({id:p.id,kind:'invalid-path'});if(this.network.ctx.solid(p.x,p.z,RADIUS-.01))findings.push({id:p.id,kind:'solid'});if(!p.crossing&&!this.network.ctx.safe(p.x,p.z,RADIUS-.01))findings.push({id:p.id,kind:'road-intrusion'});if(this.vehicleOverlap(p.x,p.z,RADIUS-.02))findings.push({id:p.id,kind:'vehicle-overlap'});if(this.blocked(p.x,p.z,p,RADIUS*2-.03,false))findings.push({id:p.id,kind:'pedestrian-overlap'});if(p.crossing&&this.network.ctx.onRoad(p.x,p.z)&&!inCrossing(p.x,p.z,this.network.edges[p.edge],.23))findings.push({id:p.id,kind:'crosswalk-boundary'});if(p.crossing&&!this.signals?.groups.has(p.crossing))findings.push({id:p.id,kind:'invalid-signal'});if(p.stuck>5)minor.stuck++;if(p.leader>=0&&this.pool[p.leader].active&&Math.hypot(p.x-this.pool[p.leader].x,p.z-this.pool[p.leader].z)>8)minor.groupSeparation++;}
  for(const s of this.queue.values())maxStack=Math.max(maxStack,s.size);return {major:findings.length,minor,findings,maxQueue:maxStack,signalViolations:this.stats.signalViolations};}
 dispose(){for(const p of this.pool)this.despawn(p,'dispose');this.grid.clear();this.queue.clear();this.exits.clear();}
}
