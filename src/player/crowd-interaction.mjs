// Bounded local reactions: no scans over the full population or changes to signal ownership.
export function reactToRunner(crowd,state){
 if(!crowd||!state.alive||state.speed<2.5)return 0;
 const sx=Math.sin(state.heading),sz=Math.cos(state.heading);let count=0;
 for(let x=Math.floor((state.x-3)/2);x<=Math.floor((state.x+3)/2);x++)for(let z=Math.floor((state.z-3)/2);z<=Math.floor((state.z+3)/2);z++){
  for(const p of crowd.grid.get(x+','+z)??[]){
   if(!p.active||p.controlled||p.struck!==undefined)continue;
   const dx=p.x-state.x,dz=p.z-state.z,along=dx*sx+dz*sz,side=dx*sz-dz*sx;
   if(along<0||along>2.8||Math.abs(side)>.85)continue;
   if((p.runnerUntil??0)>crowd.time)continue;
   p.runnerUntil=crowd.time+1.2;
   if(crowd.scatter(p,sz*(side>=0?1:-1),-sx*(side>=0?1:-1),.12))count++;
  }
 }
 return count;
}

// Small, deterministic adjustments within the pavement make waiters less regimented.
// Every step checks neighbours, vehicles and walkable ground; crossings are never moved here.
export function settleNearbyWaiters(crowd,state,dt){
 if(!crowd||dt<=0)return 0;let moved=0;
 const candidates=[];
 for(let x=Math.floor((state.x-15)/2);x<=Math.floor((state.x+15)/2);x++)for(let z=Math.floor((state.z-15)/2);z<=Math.floor((state.z+15)/2);z++)candidates.push(...(crowd.grid.get(x+','+z)??[]));
 for(const p of candidates){
  if(!p.active||p.controlled||p.crossing||p.struck!==undefined||p.state!=='waiting'){p.waitAnchor=null;continue;}
  if(!p.waitAnchor)p.waitAnchor={x:p.x,z:p.z};
  const jitter=Math.sin(p.id*13.17),back=.2+(Math.sin(p.id*7.1)*.5+.5)*.7;
  let tx=p.waitAnchor.x+Math.cos(p.heading)*jitter*.45-Math.sin(p.heading)*back;
  let tz=p.waitAnchor.z-Math.sin(p.heading)*jitter*.45-Math.cos(p.heading)*back;
  if(p.scatterUntil>crowd.time){tx=p.x+p.scatterX;tz=p.z+p.scatterZ;}
  const distance=Math.hypot(tx-p.x,tz-p.z);if(distance<.04)continue;
  const step=Math.min(distance,dt*(p.scatterUntil>crowd.time?1.2:.24));
  const x=p.x+(tx-p.x)/distance*step,z=p.z+(tz-p.z)/distance*step;
  if(!crowd.network.ctx.safe(x,z,.32)||crowd.vehicleOverlap(x,z,.35))continue;
  let blocked=false;
  for(let gx=Math.floor((x-.6)/2);gx<=Math.floor((x+.6)/2);gx++)for(let gz=Math.floor((z-.6)/2);gz<=Math.floor((z+.6)/2);gz++)for(const other of crowd.grid.get(gx+','+gz)??[]){if(other!==p&&other.active&&Math.hypot(other.x-x,other.z-z)<.55)blocked=true;}
  if(blocked)continue;
  const bucket=crowd.grid.get(crowd.cell(p.x,p.z)),index=bucket?.indexOf(p);if(index>=0)bucket.splice(index,1);
  p.previousX=p.x;p.previousZ=p.z;p.x=x;p.z=z;p.height=crowd.network.ctx.height(x,z);crowd.insert(p);moved++;
 }
 return moved;
}
