import {PROFILES} from '../app/foundation.mjs';
export function renderRatio(tier,deviceDpr=1){const p=PROFILES[tier];if(!p)throw Error('Invalid quality tier');return Math.min(Number.isFinite(deviceDpr)&&deviceDpr>0?deviceDpr:1,p.dpr)*p.scale;}
// Skip complete scene ticks, preserving elapsed time for the existing simulations.
export class FrameGate{
 constructor(tier='medium'){this.tier=tier;this.last=null;}
 setTier(tier){if(!PROFILES[tier])throw Error('Invalid quality tier');this.tier=tier;this.last=null;}
 step(now){if(this.last===null){this.last=now;return 0;}const elapsed=now-this.last;if(elapsed+0.01<1000/PROFILES[this.tier].fps)return null;this.last=now;return Math.min(.1,Math.max(0,elapsed/1000));}
}
// Yield between expensive module builds; never drain all loaded modules in one microtask turn.
export function afterPaint(run){if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(run,0));else setTimeout(run,0);}
export const yieldFrame=()=>new Promise(afterPaint);
export function finishSteps(steps){let item;do{item=steps.next();}while(!item.done);return item.value;}
export async function finishStepsAsync(steps,pause=yieldFrame){let item;try{while(!(item=steps.next()).done)await pause();return item.value;}finally{steps.return?.();}}
export function createBuildQueue(schedule=afterPaint){
 const jobs=[];let running=false,closed=false;
 function next(){if(running||!jobs.length||closed)return;running=true;schedule(async()=>{const job=jobs.shift();if(!job){running=false;return;}try{job.resolve(closed?undefined:await job.run());}catch(e){job.reject(e);}finally{running=false;next();}});}
 return {enqueue(run){if(closed)return Promise.resolve();return new Promise((resolve,reject)=>{jobs.push({run,resolve,reject});next();});},dispose(){closed=true;for(const job of jobs.splice(0))job.resolve();}};
}
export function deferredLatest(apply,schedule=f=>setTimeout(f,150),cancel=clearTimeout){let handle=null,closed=false;return {set(value){if(closed)return;if(handle!==null)cancel(handle);handle=schedule(()=>{handle=null;if(!closed)apply(value);});},dispose(){closed=true;if(handle!==null)cancel(handle);}};}
