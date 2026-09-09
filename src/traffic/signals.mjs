import {pose} from './path.mjs';
function near(p,points){let best=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],x=b[0]-a[0],z=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*x+(p.z-a[1])*z)/(x*x+z*z||1)));best=Math.min(best,Math.hypot(p.x-a[0]-t*x,p.z-a[1]-t*z));}return best;}
export function buildSignals(graph,street){const groups=new Map(),crossings=new Map();for(const c of graph.ground.crossings){const p=c.points[Math.floor(c.points.length/2)],central=c.kind!=='normal'||Math.hypot(...p)<55,id=central?'scramble':`junction:${Math.round(p[0]/45)}:${Math.round(p[1]/45)}`;if(!groups.has(id))groups.set(id,{id,central,crossingIds:[],signalIds:[],locks:new Set()});groups.get(id).crossingIds.push(c.id);crossings.set(c.id,{...c,group:id});}for(const f of [...(street?.fixtures??[]),...graph.data.signals.map(s=>({category:'signal',point:s.point,signal:{signalId:s.id}}))]){if(f.category!=='signal')continue;let best=null,d=Infinity;for(const c of crossings.values()){const n=near({x:f.point[0],z:f.point[1]},c.points);if(n<d){d=n;best=c;}}if(best&&d<35){const ids=groups.get(best.group).signalIds;if(!ids.includes(f.signal.signalId))ids.push(f.signal.signalId);};}
 function controls(path,axis){const out=[];for(const c of crossings.values()){let first=Infinity,last=-Infinity;const p={};for(let d=0;d<=path.length;d+=1){pose(path,d,p);if(near(p,c.points)<c.width/2+1.5){first=Math.min(first,d);last=d;}}if(first<Infinity)out.push({group:c.group,crossingId:c.id,start:first,end:last,axis});}return out.sort((a,b)=>a.start-b.start);}
 for(const lane of graph.lanes)lane.controls=controls(lane.path,lane.axis);for(const t of graph.transitions){t.controls=controls(t.path,graph.lanes[t.from].axis);const from=graph.lanes[t.from];}
 return new SignalController(groups,crossings);
}
export class SignalController{
 constructor(groups,crossings){this.groups=groups;this.crossings=crossings;this.time=0;this.override=null;}
 update(dt){this.time+=dt;}
 phase(){const t=this.time%108;return t<35?['NS','GREEN',35-t]:t<39?['NS','YELLOW',39-t]:t<44?['ALL','RED',44-t]:t<79?['EW','GREEN',79-t]:t<83?['EW','YELLOW',83-t]:t<88?['ALL','RED',88-t]:['PEDESTRIAN','RED',108-t];}
 getSignalState(groupId,axis='NS'){if(!this.groups.has(groupId))return 'RED';if(this.override)return this.override;const [active,color]=this.phase();return active===axis?color:'RED';}
 remainingGreen(groupId,axis){if(this.override==='GREEN')return Infinity;const [a,c,left]=this.phase();return this.groups.has(groupId)&&a===axis&&c==='GREEN'?left:0;}
 getPedestrianPhase(groupId){const g=this.groups.get(groupId);return g&&this.phase()[0]==='PEDESTRIAN'&&g.locks.size===0?'WALK':'DONT_WALK';}
 getCrossingTrafficState(id){const c=this.crossings.get(id);if(!c)return {known:false,vehicleClear:false,pedestrian:'DONT_WALK'};const g=this.groups.get(c.group);return {known:true,groupId:c.group,vehicleClear:g.locks.size===0,pedestrian:this.getPedestrianPhase(c.group),NS:this.getSignalState(c.group,'NS'),EW:this.getSignalState(c.group,'EW')};}
}
