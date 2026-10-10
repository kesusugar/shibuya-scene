// Crowd performance trial: the same spot in the crowd with full detail (L0) uncapped, and capped
//
//   npm run dev:local            (in another shell)
//   node qa/gta-upgrade/scene-stills.mjs [outDir] [query]
//
// A software renderer draws this scene at about one frame in five seconds, and the game advances
// one clamped step (0.1 s) per frame, so waiting for it to play is hopeless. The QA hook turns
// drawing off (`__SHIBUYA_QA__.render(false)`): the game then runs its own loop at full speed and
// only the stills are drawn. Every step is driven by game state through the ?qa=1 globals.
//
// Steps: the crossing; on foot with the katana drawn and walking; the pistol aimed; on the
// motorbike, riding and leaning into a turn; in a car with the radio's banner; a parked car shot
// through its windows and dented; the same car driven into a wall. A still of each, the game
// state beside it, and every console error in <outDir>/scene.json.
//
//   node qa/gta-upgrade/l0cap-stills.mjs [outDir] [query]
//
// The player stands in the densest part of the crowd by the crossing, with the light red so the
// kerbs are full; the camera looks over the shoulder into the crowd. One still with no cap, then
// the cap is set live (__SHIBUYA_QA__.l0cap, which reviews everyone's LOD at once) to 48 and to
// 24, a still of each from the same camera 0.3 s later, then uncapped again. Beside each: how many
// people are at each LOD and how many crowd triangles the camera draws.
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {findChrome} from '../../scripts/lib/headless-chrome.mjs';

const out=process.argv[2]??'evidence/crowd-perf/l0cap',query=process.argv[3]??'qa=1&tier=high&time=day&camera=scramble';
const base=process.env.SHIBUYA_URL??'http://127.0.0.1:5174/',W=+(process.env.W??1280),H=+(process.env.H??720);
const only=(process.env.ONLY??'').split(',').filter(Boolean);
mkdirSync(out,{recursive:true});
const dir=join(process.env.TMPDIR??'/tmp',`scene-stills-${process.pid}`);
const chrome=spawn(findChrome(),['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required',
 '--remote-debugging-port=0',`--user-data-dir=${dir}`,`--window-size=${W},${H}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
const endpoint=await new Promise((resolve,reject)=>{let t='';chrome.stderr.on('data',d=>{t+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(t);if(m)resolve(m[1]);});chrome.on('exit',()=>reject(new Error('Chrome exited '+t.slice(-300))));});
const port=new URL(endpoint).port;
const page=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let n=0;const pending=new Map(),log=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
 if(m.method==='Runtime.consoleAPICalled'&&/error|warn/.test(m.params.type))log.push({type:m.params.type,text:m.params.args.map(a=>a.value??a.description).join(' ').slice(0,500)});
 if(m.method==='Runtime.exceptionThrown')log.push({type:'exception',text:(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).slice(0,800)});});
const call=(method,params={})=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
const js=async expression=>{const m=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(m.result?.exceptionDetails)throw new Error(m.result.exceptionDetails.exception?.description??'evaluate failed');return m.result.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(expr,seconds,label)=>{for(let i=0;i<seconds*4;i++){if(await js(`(()=>{try{return !!(${expr})}catch{return false}})()`))return true;await sleep(250);}
 console.log(`  timed out: ${label}`);return false;};
/** Let the game run `seconds` of its own time, drawing nothing. */
const run=async(seconds,{each=null}={})=>{await js('window.__SHIBUYA_QA__.render(false)');
 const t0=await js('window.__SHIBUYA_LIFE__?.sim?.time??0');
 // By game time, not by polls: headless Chrome can stall for seconds with no frame at all (§9ay).
 const wall=Date.now()+90000;
 while(Date.now()<wall){if(each)await js(each);const t=await js('window.__SHIBUYA_LIFE__?.sim?.time??0');if(t-t0>=seconds)break;await sleep(25);}};
/** Run the game, drawing nothing, until `expr` holds or `seconds` of game time pass. */
const runUntil=async(expr,seconds,label)=>{await js('window.__SHIBUYA_QA__.render(false)');const t0=await js('window.__SHIBUYA_LIFE__?.sim?.time??0');
 for(let i=0;i<seconds*80;i++){if(await js(`(()=>{try{return !!(${expr})}catch{return false}})()`))return true;const t=await js('window.__SHIBUYA_LIFE__?.sim?.time??0');if(t-t0>seconds)break;await sleep(25);}
 console.log(`  not reached: ${label}`);return false;};
const steps=[];
/** Draw two frames and keep the second (the first after a state change can be a frame behind). */
async function still(name,note,{view=null,hud=false}={}){
 // A placed camera (see __SHIBUYA_QA__.view) and, unless the HUD is the point, the panels hidden.
 await js(`window.__SHIBUYA_QA__.view(${JSON.stringify(view)})`);
 await js(`(()=>{let s=document.getElementById('qa-hide');if(!s){s=document.createElement('style');s.id='qa-hide';document.head.appendChild(s);}
  s.textContent=${JSON.stringify(hud?'':HIDE)};})()`);
 await js('window.__SHIBUYA_QA__.render(true)');
 const f0=await js('window.__SHIBUYA_QA__.frames');await until(`window.__SHIBUYA_QA__.frames>=${f0+2}`,90,'two drawn frames');
 const r=await call('Page.captureScreenshot',{format:'jpeg',quality:86});writeFileSync(join(out,name+'.jpg'),Buffer.from(r.result.data,'base64'));
 const state=await js(`(()=>{const p=window.__SHIBUYA_PLAYER__?.state,c=window.__SHIBUYA_CAR__?.state,m=window.__SHIBUYA_QA__.metrics;
  return {player:p&&{x:+p.x.toFixed(1),z:+p.z.toFixed(1),weapon:p.weapon,health:p.health},car:c&&{active:c.active,type:c.type,speed:+(c.speed??0).toFixed(1),damage:+(c.damage??0).toFixed(2),wear:c.slot?.wear?{dents:c.slot.wear.dents.length,panes:c.slot.wear.panes}:null},
   radio:document.querySelector('.play-radio')?.hidden===false?document.querySelector('.play-radio').textContent:null,fps:m.fps,drawCalls:m.drawCalls,triangles:m.triangles};})()`);
 steps.push({name,note,state});await js('window.__SHIBUYA_QA__.view(null)');console.log(`  ${name}: ${note} ${JSON.stringify(state).slice(0,240)}`);
}
const HIDE='.play-dashboard,.play-mission,.play-map,.tc{visibility:hidden!important}';
const want=k=>!only.length||only.includes(k);

await call('Runtime.enable');await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
console.log('opening',base+'?'+query);await call('Page.navigate',{url:base+'?'+query});
await until('window.__SHIBUYA_QA__?.ready',600,'the scene');
await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='プレイヤー')?.click()`);
await until('window.__SHIBUYA_PLAYER__&&window.__SHIBUYA_LIFE__',120,'player mode');
await run(20);
// The densest pavement spot within 60 m of the crossing: most people within 7 m.
const spot=await js(`(()=>{const ctx=window.__SHIBUYA_CTX__,sim=window.__SHIBUYA_LIFE__.sim,p=window.__SHIBUYA_PLAYER__;
 let best=null;for(let x=-60;x<=60;x+=3)for(let z=-60;z<=60;z+=3){if(!ctx.safe(x,z)||ctx.onRoad?.(x,z))continue;let k=0;for(const q of sim.pool)if(q.active&&Math.hypot(q.x-x,q.z-z)<7)k++;if(!best||k>best.k)best={x,z,k};}
 let cx=0,cz=0;if(best){p.place(best.x,best.z,Math.atan2(cx-best.x,cz-best.z));}return best;})()`);
console.log('  standing at',JSON.stringify(spot));
await run(1);
const view={yaw:3.14,dist:6.5,height:2.4,target:1.4};
const crowdNow=()=>js(`(()=>{const h=window.__SHIBUYA_QA__.hqStats?.();return h&&{byLod:h.byLod,visible:h.visible,population:h.population,l0Cap:window.__SHIBUYA_QA__.l0cap?.(window.__L0__??0)};})()`);
const result=[];
// Set the cap and review everyone's LOD at once (no per-frame limit), then only 0.3 s of game
// time before the still: the crowd is where it was, only how it is drawn changes. The last
// still is the uncapped one again, to show the crowd did not move on meanwhile.
for(const [cap,name] of [[0,'l0cap-off'],[48,'l0cap-48'],[24,'l0cap-24'],[0,'l0cap-off-again']]){
 await js(`window.__L0__=${cap};window.__SHIBUYA_QA__.l0cap(${cap})`);
 await run(.3);
 await still(name,cap?`at most ${cap} people at full detail`:'no cap (as today)',{view});
 result.push({cap,crowd:await crowdNow(),state:steps.at(-1)?.state});
 console.log('  ',cap,JSON.stringify(result.at(-1).crowd));
}
writeFileSync(join(out,'l0cap.json'),JSON.stringify({query,spot,result},null,1)+'\n');
ws.close();chrome.kill();process.exit(0);
