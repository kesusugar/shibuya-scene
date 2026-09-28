// Backlog ② evidence: photo mode in the real scene, headless -- the harness of scene-stills.mjs.
//
//   npm run dev:local            (in another shell)
//   node qa/gta-upgrade/photo-mode-stills.mjs [outDir] [query]
//
// Play; photo mode entered (the HUD gone, the world stopped); the free camera flown up and back,
// tilted and zoomed; the time of day turned to night; the world's time run at 1/4 and stopped
// again (checked on the crowd's clock); a still saved through the page's own download; and back
// to play, where it was.
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

const out=process.argv[2]??'evidence/photo-mode',query=process.argv[3]??'qa=1&tier=low&time=day&camera=scramble';
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
const HIDE='';
await call('Runtime.enable');await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
console.log('opening',base+'?'+query);await call('Page.navigate',{url:base+'?'+query});
await until('window.__SHIBUYA_QA__?.ready',600,'the scene');
await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='プレイヤー')?.click()`);
await until('window.__SHIBUYA_PLAYER__&&window.__SHIBUYA_PHOTO__',120,'player mode');
await run(2);
await still('01-play','playing, the game camera and the HUD',{hud:true});
const clockNow=()=>js('window.__SHIBUYA_LIFE__?.sim?.time??0');
/** Over `frames` frames of photo mode (polled, so headless Chrome keeps drawing them): how far the crowd's clock moved, and how much real time the frames covered. */
const overFrames=async frames=>{await js('window.__SHIBUYA_QA__.render(false)');
 const a=await js('({t:window.__SHIBUYA_LIFE__?.sim?.time??0,k:window.__SHIBUYA_PHOTO__.ticks,r:window.__SHIBUYA_PHOTO__.real})');const wall=Date.now()+180000;let b=a;
 while(Date.now()<wall){b=await js('({t:window.__SHIBUYA_LIFE__?.sim?.time??0,k:window.__SHIBUYA_PHOTO__.ticks,r:window.__SHIBUYA_PHOTO__.real})');if(b.k-a.k>=frames)break;await sleep(25);}
 return {frames:b.k-a.k,clock:+(b.t-a.t).toFixed(3),real:+(b.r-a.r).toFixed(3)};};
const hud=()=>js(`(()=>{const h=document.querySelector('.play-hud');return {hud:!!h&&getComputedStyle(h).display!=='none'&&!h.hidden,help:!document.querySelector('.photo-help')?.hidden,photo:document.body.classList.contains('photo-mode')};})()`);
const player0=await js('({x:window.__SHIBUYA_PLAYER__.state.x,z:window.__SHIBUYA_PLAYER__.state.z,heading:window.__SHIBUYA_PLAYER__.state.heading})');
await js('window.__SHIBUYA_PHOTO__.enter()');
const checks={entered:await js('window.__SHIBUYA_PHOTO__.active'),hudInPhoto:await hud()};
// Stopped: the crowd's clock stands still over 60 frames.
await js('window.__SHIBUYA_QA__.render(false)');checks.stopped=await overFrames(60);
await still('02-photo','photo mode entered: the HUD gone, the help shown, the world stopped',{hud:true});
// Up and back, looking down on the player.
await js('window.__SHIBUYA_PHOTO__.fly({up:1},1.2)');await js('window.__SHIBUYA_PHOTO__.fly({forward:-1},1)');await js('window.__SHIBUYA_PHOTO__.look(0,160)');
await still('03-photo-high','flown up and back, looking down',{hud:true});
// Low and tilted, zoomed in.
await js('window.__SHIBUYA_PHOTO__.fly({up:-1},1.4)');await js('window.__SHIBUYA_PHOTO__.look(0,-200)');await js('window.__SHIBUYA_PHOTO__.zoom(-6)');await js('window.__SHIBUYA_PHOTO__.fly({roll:1},.4)');
await still('04-photo-tilt','low, zoomed in and tilted',{hud:true});
// Night: the sky turns over its own five seconds even with the world stopped.
for(let i=0;i<4&&!(await js(`document.querySelector('.photo-status')?.textContent.includes('· 夜')`));i++)await js('window.__SHIBUYA_PHOTO__.timeOfDay()');
{await js('window.__SHIBUYA_QA__.render(false)');const r0=await js('window.__SHIBUYA_PHOTO__.real'),wall=Date.now()+180000;
 while(Date.now()<wall&&(await js('window.__SHIBUYA_PHOTO__.real'))-r0<6)await sleep(25);}
await still('05-photo-night','the time of day turned to night in photo mode',{hud:true});
// 1/4 speed and running: the crowd's clock moves a quarter of the real time, then all of it; then stopped again.
await js('window.__SHIBUYA_PHOTO__.cycleTime()');await js('window.__SHIBUYA_QA__.render(false)');checks.quarter=await overFrames(60);checks.quarterScale=await js('window.__SHIBUYA_PHOTO__.timeScale');
await js('window.__SHIBUYA_PHOTO__.cycleTime()');checks.running=await overFrames(60);
await js('window.__SHIBUYA_PHOTO__.cycleTime()');checks.timeScaleBack=await js('window.__SHIBUYA_PHOTO__.timeScale');
// A still, saved by the page itself.
// The page's own download link is watched: its file is read back (size, and how much of it is not
// blank) and written next to the stills -- the headless browser's download folder is not relied on.
await js(`(()=>{window.__photoSaved=[];const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){
 if(this.download){const name=this.download;fetch(this.href).then(r=>r.blob()).then(async b=>{const bmp=await createImageBitmap(b),c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.drawImage(bmp,0,0);
  const d=g.getImageData(0,0,bmp.width,bmp.height).data;let lit=0;for(let i=0;i<d.length;i+=16)if(d[i]+d[i+1]+d[i+2]>60)lit++;
  const url=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b);});
  window.__photoSaved.push({name,bytes:b.size,width:bmp.width,height:bmp.height,lit:+(lit/(d.length/16)).toFixed(3),url});});return;}
 return click.call(this);};})()`);
await js('window.__SHIBUYA_PHOTO__.capture()');await js('window.__SHIBUYA_QA__.render(true)');
await until('window.__photoSaved?.length>=1',120,'the still');
const saved=await js('window.__photoSaved??[]');
checks.saved=saved.map(({url,...rest})=>rest);
for(const f of saved)writeFileSync(join(out,'07-saved-'+f.name),Buffer.from(f.url.split(',')[1],'base64'));
await js('window.__SHIBUYA_PHOTO__.leave()');
checks.left=!(await js('window.__SHIBUYA_PHOTO__.active'));checks.hudAfter=await hud();
checks.playerUnmoved=await js(`(()=>{const s=window.__SHIBUYA_PLAYER__.state,a=${JSON.stringify(player0)};return Math.hypot(s.x-a.x,s.z-a.z)<.5;})()`);
await run(1);
await still('06-back','back in play: the game camera and the HUD',{hud:true});
const errors=log.filter(l=>l.type==='error'||l.type==='exception');
writeFileSync(join(out,'photo-mode.json'),JSON.stringify({query,checks,steps,console:log,errors:errors.length},null,1)+'\n');
console.log(JSON.stringify(checks,null,1),`\n${errors.length} errors`);
ws.close();chrome.kill();process.exit(0);
