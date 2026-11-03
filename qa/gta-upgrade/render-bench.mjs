// Crowd performance: what the GPU is asked to do per frame in the real scene, counted at the WebGL
// calls (so it holds on a software renderer, where time does not): draw calls, primitives
// (vertices submitted, triangles x3), bytes uploaded into buffers and textures, and memory.
//
//   npm run dev:local            (in another shell)
//   node qa/gta-upgrade/render-bench.mjs [out.json] [query]
//
// The player stands at the start (the scene-cost.mjs harness), then the game is drawn for a few
// frames in each view: 'player' (the follow camera as it starts), 'side' (the player turned a
// quarter round) and 'turned' (half round). Per view: the mean per
// frame of each count over the frames drawn. Time is NOT reported: on SwiftShader it says nothing.
import {spawn,execSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {findChrome} from '../../scripts/lib/headless-chrome.mjs';

const out=process.argv[2]??'evidence/crowd-perf/render.json',query=process.argv[3]??'qa=1&perf=1&tier=high&time=day&camera=scramble';
const base=process.env.SHIBUYA_URL??'http://127.0.0.1:5174/',FRAMES=+(process.env.FRAMES??6);
const dir=join(process.env.TMPDIR??'/tmp',`render-bench-${process.pid}`);
const chrome=spawn(findChrome(),['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info',
 '--remote-debugging-port=0',`--user-data-dir=${dir}`,'--window-size=960,540','about:blank'],{stdio:['ignore','ignore','pipe']});
const endpoint=await new Promise((resolve,reject)=>{let t='';chrome.stderr.on('data',d=>{t+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(t);if(m)resolve(m[1]);});chrome.on('exit',()=>reject(new Error('Chrome exited '+t.slice(-300))));});
const port=new URL(endpoint).port;
const page=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let n=0;const pending=new Map(),errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
 if(m.method==='Runtime.exceptionThrown')errors.push((m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).slice(0,400));});
const call=(method,params={})=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
const js=async expression=>{const m=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(m.result?.exceptionDetails)throw new Error(m.result.exceptionDetails.exception?.description??'evaluate failed');return m.result.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(expr,seconds)=>{for(let i=0;i<seconds*4;i++){if(await js(`(()=>{try{return !!(${expr})}catch{return false}})()`))return true;await sleep(250);}return false;};

// The counters: every draw and upload, per animation frame.
await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
 const S={frames:0,draws:0,prims:0,upload:0,tex:0};window.__GL__=S;
 const bytes=a=>a==null?0:typeof a==='number'?0:(a.byteLength??((a.width??0)*(a.height??0)*4));
 for(const P of [WebGL2RenderingContext.prototype]){
  const wrap=(name,fn)=>{const o=P[name];P[name]=function(...a){fn(a);return o.apply(this,a);};};
  wrap('drawElements',a=>{S.draws++;S.prims+=a[1];});wrap('drawArrays',a=>{S.draws++;S.prims+=a[2];});
  wrap('drawElementsInstanced',a=>{S.draws++;S.prims+=a[1]*a[4];});wrap('drawArraysInstanced',a=>{S.draws++;S.prims+=a[2]*a[3];});
  wrap('bufferData',a=>{S.upload+=typeof a[1]==='number'?0:bytes(a[1]);});
  wrap('bufferSubData',a=>{const src=a[2];if(!src)return;const len=a[4]!==undefined&&a[4]!==0?a[4]*(src.BYTES_PER_ELEMENT??1):src.byteLength-(a[3]??0)*(src.BYTES_PER_ELEMENT??1);S.upload+=Math.max(0,len);});
  wrap('texImage2D',a=>{S.tex+=a.length>=9?bytes(a[8]):bytes(a[5]);});wrap('texSubImage2D',a=>{S.tex+=a.length>=9?bytes(a[8]):bytes(a[6]);});
  wrap('texImage3D',a=>{S.tex+=bytes(a[9]);});wrap('texSubImage3D',a=>{S.tex+=bytes(a[10]);});
 }
 // Each animation frame's own counts, so a frame the game skipped (its frame gate) or one that
 // drew only part of the scene can be told apart from a whole one.
 S.history=[];let last={draws:0,prims:0,upload:0,tex:0};
 const raf=window.requestAnimationFrame;window.requestAnimationFrame=function(cb){return raf.call(window,t=>{S.frames++;
  S.history.push({draws:S.draws-last.draws,prims:S.prims-last.prims,upload:S.upload-last.upload,tex:S.tex-last.tex});if(S.history.length>64)S.history.shift();
  last={draws:S.draws,prims:S.prims,upload:S.upload,tex:S.tex};cb(t);});};
})();`});
await call('Runtime.enable');await call('Page.enable');
await call('Page.navigate',{url:base+'?'+query});
if(!await until('window.__SHIBUYA_QA__?.ready',600))throw new Error('scene not ready');
await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='プレイヤー')?.click()`);
await until('window.__SHIBUYA_PLAYER__&&window.__SHIBUYA_PERF__',120);
await js('window.__SHIBUYA_QA__.render(false)');
const gameTime=()=>js('window.__SHIBUYA_LIFE__?.sim?.time??0');
const run=async seconds=>{const t0=await gameTime();for(let i=0;i<seconds*100&&await gameTime()-t0<seconds;i++)await sleep(20);};
await run(4);
const snap=()=>js('({...window.__GL__,history:window.__GL__.history.slice()})');
async function measure(view,setup){
 await js('window.__SHIBUYA_QA__.render(false)');
 if(setup)await js(setup);
 await run(1);
 await js('window.__SHIBUYA_QA__.render(true)');
 // Two frames to settle (render targets resized, lazy uploads), then the measured ones.
 let s=await snap();const settle=s.frames+2;for(let i=0;i<600&&(await snap()).frames<settle;i++)await sleep(100);
 const a=await snap();for(let i=0;i<1200&&(await snap()).frames<a.frames+FRAMES;i++)await sleep(100);
 const b=await snap(),f=b.frames-a.frames;
 const hq=await js('window.__SHIBUYA_QA__.metrics?.hqCrowd??null');
 // The median over the measured frames that drew the whole scene (the most draws seen, less 20%).
 const hist=b.history.slice(-f),most=Math.max(...hist.map(h=>h.draws)),whole=hist.filter(h=>h.draws>=most*.8);
 const med=k=>{const v=whole.map(h=>h[k]).sort((x,y)=>x-y);return v[Math.floor(v.length/2)];};
 return {view,frames:f,wholeFrames:whole.length,draws:med('draws'),kPrims:Math.round(med('prims')/1000),
  uploadKB:Math.round(med('upload')/1024),textureUploadKB:Math.round(med('tex')/1024),
  hqPopulation:hq?.population??null,hqVisible:hq?.visible?.citizens??null};
}
const views=[];
views.push(await measure('player',null));
views.push(await measure('side',`(()=>{const p=window.__SHIBUYA_PLAYER__.state;p.heading+=Math.PI/2;})()`));
views.push(await measure('turned',`(()=>{const p=window.__SHIBUYA_PLAYER__.state;p.heading+=Math.PI/2;})()`));
await js('window.__SHIBUYA_QA__.render(false)');
const heapMB=await js('performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null');
const procs=execSync('ps -eo rss,args').toString().split('\n').filter(l=>l.includes(dir));
const memory={heapMB,processMB:Math.round(procs.reduce((s,l)=>s+(+l.trim().split(/\s+/)[0]||0),0)/1024)};
const result={query,views,memory,errors};
console.log(JSON.stringify(result,null,1));
writeFileSync(out,JSON.stringify(result,null,1)+'\n');
ws.close();chrome.kill();process.exit(0);
