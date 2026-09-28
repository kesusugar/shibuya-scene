// Backlog ③ evidence: the underground passage in the real scene, headless -- the harness of
// scene-stills.mjs.
//
//   npm run dev:local            (in another shell)
//   node qa/gta-upgrade/tunnel-scene.mjs [outDir] [query]
//
// The player is put by the A3 entrance on Dogenzaka with ☆3 (a police car taken), walks down the
// stairs and runs the passage (steered along it) to A0, and comes up there. On the way: the
// layer, the floor, what the police see, where their cars and officers are, how many went down,
// and the escape clock; at the end, whether (and when) the level cleared.
//
// (The notes below are scene-stills.mjs's, and hold here too.)
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
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {findChrome} from '../../scripts/lib/headless-chrome.mjs';

const out=process.argv[2]??'evidence/tunnel/scene',query=process.argv[3]??'qa=1&tier=low&time=day&camera=scramble';
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
await call('Runtime.enable');await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
console.log('opening',base+'?'+query);await call('Page.navigate',{url:base+'?'+query});
await until('window.__SHIBUYA_QA__?.ready',600,'the scene');
await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='プレイヤー')?.click()`);
await until('window.__SHIBUYA_PLAYER__&&window.__SHIBUYA_TUNNEL__&&window.__SHIBUYA_POLICE__',120,'player mode');
await run(1);
// By the A3 entrance, facing it.
await js(`(()=>{const T=window.__SHIBUYA_TUNNEL__,e=T.ends[0],p=window.__SHIBUYA_PLAYER__;p.transitionTo(e.entry.x+e.out.x*2.5,e.entry.z+e.out.z*2.5,e.heading,0);p.state.heading=e.heading;})()`);
await run(1);
const probe=()=>js(`(()=>{const P=window.__SHIBUYA_POLICE__,st=window.__SHIBUYA_PLAYER__.state,T=window.__SHIBUYA_TUNNEL__,w=P.wanted.state,u=P.units;
 const officers=[...u.officers].filter(o=>o.active),cars=[...u.cars].filter(v=>v.active),e=T.ends[st.tunnelEnd??0];
 return {layer:st.layer,s:st.tunnelS==null?null:+st.tunnelS.toFixed(1),y:+st.y.toFixed(2),stars:w.stars,seen:w.seen,escape:+w.escape.toFixed(1),
  officers:officers.length,below:officers.filter(o=>o.tunnelS!=null).length,
  nearestCarToStairs:cars.length?+Math.min(...cars.map(v=>Math.hypot(v.x-e.entry.x,v.z-e.entry.z))).toFixed(1):null,
  nearestOfficerBelow:officers.filter(o=>o.tunnelS!=null&&st.tunnelS!=null).map(o=>+Math.abs(o.tunnelS-st.tunnelS).toFixed(1)).sort((a,b)=>a-b)[0]??null,
  // Officers above: how near the stairs the player took, and whether they are held or moving.
  toStairs:officers.filter(o=>o.tunnelS==null).map(o=>({d:+Math.hypot(o.x-e.entry.x,o.z-e.entry.z).toFixed(1),hold:!!o.gunHold,speed:+(o.speed??0).toFixed(1),state:o.state})).sort((a,b)=>a.d-b.d).slice(0,4),
  descended:u.stats.descended??0,trail:!!P.trail};})()`);
await still('01-a3-entrance','by the A3 entrance on Dogenzaka',{view:{yaw:0,dist:4.5,height:2.3,target:1.1}});
// ☆3, and the police come for the player standing at the stairs.
await js(`(()=>{const P=window.__SHIBUYA_POLICE__,s=window.__SHIBUYA_PLAYER__.state;for(let i=0;i<1;i++)P.wanted.crime('policeCarTaken',{x:s.x,z:s.z,t:0});})()`);
// The police close in: wait at the top until a unit sees the player or an officer is 12 m off.
await runUntil(`(()=>{const P=window.__SHIBUYA_POLICE__,st=window.__SHIBUYA_PLAYER__.state;return P.wanted.state.seen||[...P.units.officers].some(o=>o.active&&Math.hypot(o.x-st.x,o.z-st.z)<12);})()`,60,'the police close');
const checks={atTop:await probe()};
await still('02-police-coming','☆3: the police close in on the player at the stairs',{view:{yaw:3.14,dist:9,height:4,target:1}});
// Down the stairs, then along the passage, steered at a point 4 m ahead on it, running.
const steer=`(()=>{const T=window.__SHIBUYA_TUNNEL__,p=window.__SHIBUYA_PLAYER__,st=p.state;const s=st.layer==='tunnel'?st.tunnelS:0;
 const q=st.layer==='tunnel'?T.pointAt(Math.min(T.length+2,s+3.5)):T.ends[0].top;st.heading=Math.atan2(q.x-st.x,q.z-st.z);p.setTouch({forward:1,running:true});})()`;
const along=async(until,seconds,label)=>{await js('window.__SHIBUYA_QA__.render(false)');const t0=await js('window.__SHIBUYA_LIFE__.sim.time');const wall=Date.now()+180000;
 while(Date.now()<wall){await js(steer);if(await js(`(()=>{try{return !!(${until})}catch{return false}})()`))return true;if((await js('window.__SHIBUYA_LIFE__.sim.time'))-t0>seconds)break;await sleep(25);}
 console.log('  not reached: '+label);return false;};
await along(`window.__SHIBUYA_PLAYER__.state.layer==='tunnel'&&window.__SHIBUYA_PLAYER__.state.y<-4`,30,'down the stairs');
checks.downStairs=await probe();
await still('03-down-the-stairs','down the A3 stairs',{});
await along(`(window.__SHIBUYA_PLAYER__.state.tunnelS??0)>60`,40,'60 m along');
checks.midway=await probe();
await still('04-passage','running the passage, 60 m along',{});
// Officers following below.
await along(`[...window.__SHIBUYA_POLICE__.units.officers].some(o=>o.active&&o.tunnelS!=null)||(window.__SHIBUYA_PLAYER__.state.tunnelS??0)>100`,30,'an officer below');
checks.chased=await probe();
await still('05-followed-below','officers following below',{view:{yaw:3.14,dist:5,height:1.9,target:1.1}});
await along(`window.__SHIBUYA_PLAYER__.state.layer==='surface'`,40,'out at A0');
await js('window.__SHIBUYA_PLAYER__.setTouch({forward:0})');
checks.outAtA0=await probe();
await run(1);
await still('06-a0-exit','up and out at A0',{view:{yaw:3.14,dist:6,height:2.6,target:1}});
// Wait for the level to clear (or 60 s of game time).
{const t0=await js('window.__SHIBUYA_LIFE__.sim.time');
 const cleared=await runUntil('window.__SHIBUYA_POLICE__.wanted.state.stars===0',60,'the level clears');
 checks.cleared={cleared,after:+((await js('window.__SHIBUYA_LIFE__.sim.time'))-t0).toFixed(1),reason:await js('window.__SHIBUYA_POLICE__.wanted.state.cleared'),final:await probe()};}
const errors=log.filter(l=>l.type==='error'||l.type==='exception');
writeFileSync(join(out,'tunnel-scene.json'),JSON.stringify({query,checks,steps,console:log,errors:errors.length},null,1)+'\n');
console.log(JSON.stringify(checks,null,1),`\n${errors.length} errors`);
ws.close();chrome.kill();process.exit(0);
