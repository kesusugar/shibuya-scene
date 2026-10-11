// Look 2c (docs/GTA-LOOK.md): everyday idles and walks from the 100STYLE motion capture dataset,
// retargeted onto the crowd skeleton, offline.
//
//   node scripts/mocap/style-clips.mjs <dir with the 100STYLE .bvh files and Frame_Cuts.csv>
//
// 100STYLE (Mason, Starke, Komura 2022), https://www.ianxmason.com/100style/ -- CC BY 4.0.
// One performer, a hundred styles of locomotion, each with an idle (ID) and walks (FW etc.), at
// 60 fps. What is used here: a person checking a phone, arms folded, hands in pockets, hands
// behind the back, standing about, an old man, someone impatient; and the walks to match.
//
// Method (the same rest correction as scripts/cmu/retarget.mjs, which RUN 5.6 established):
//  - 100STYLE's zero-rotation pose is a T-pose facing +Z with its left on +X, as the crowd
//    skeleton's rest is, so a source joint's world rotation IS its turn from rest. The target
//    joint gets that turn applied to its own rest.
//  - In place: the travel is taken out (the hips' heading, smoothed over a second, is turned back
//    to +Z, and the horizontal translation dropped). The crowd's controller owns where people go.
//  - A loop: within the dataset's own cut for the clip (Frame_Cuts.csv), the start and end frames
//    whose poses match best, for a length in the clip's range; the seam is cross-faded.
//  - Grounded once, with the lowest sole of the loop on the floor.
// Out: public/data/character/citizen-moves.json -- quaternion tracks per bone and a pelvis track,
// base64 Float32, at 30 fps. Read by src/life/citizen-moves.mjs.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Quaternion,Vector3,Matrix4} from 'three';
import {parseBVH,forward} from '../cmu/bvh.mjs';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

const DIR=process.argv[2];
if(!DIR)throw new Error('usage: node scripts/mocap/style-clips.mjs <100STYLE dir>');
const OUT='public/data/character/citizen-moves.json';
const FPS=30;

/** 100STYLE joint -> crowd skeleton bone. Chest4 has no counterpart; its turn is in Neck's world. */
const MAP={Hips:'pelvis',Chest:'spine_01',Chest2:'spine_02',Chest3:'spine_03',Neck:'neck_01',Head:'Head',
 LeftCollar:'clavicle_l',LeftShoulder:'upperarm_l',LeftElbow:'lowerarm_l',LeftWrist:'hand_l',
 RightCollar:'clavicle_r',RightShoulder:'upperarm_r',RightElbow:'lowerarm_r',RightWrist:'hand_r',
 LeftHip:'thigh_l',LeftKnee:'calf_l',LeftAnkle:'foot_l',LeftToe:'ball_l',
 RightHip:'thigh_r',RightKnee:'calf_r',RightAnkle:'foot_r',RightToe:'ball_r'};

/**
 * The clips. `kind` idle: a loop of `len` seconds (range); walk: one stride cycle. `cut` is the
 * Frame_Cuts column pair. Names are `<base>.<style>`: the crowd plays them for Idle and Walk.
 */
const CLIPS=[
 {name:'Idle.stand',  file:'Neutral_ID',       cut:'ID',kind:'idle',len:[5,9]},
 {name:'Idle.phone',  file:'OnPhoneRight_ID',  cut:'ID',kind:'idle',len:[5,9]},
 {name:'Idle.phoneL', file:'OnPhoneLeft_ID',   cut:'ID',kind:'idle',len:[5,9]},
 {name:'Idle.folded', file:'ArmsFolded_ID',    cut:'ID',kind:'idle',len:[5,9]},
 {name:'Idle.pockets',file:'HandsInPockets_ID',cut:'ID',kind:'idle',len:[5,9]},
 {name:'Idle.behind', file:'ArmsBehindBack_ID',cut:'ID',kind:'idle',len:[5,9]},
 {name:'Idle.akimbo', file:'Akimbo_ID',        cut:'ID',kind:'idle',len:[5,9]},
 {name:'Idle.old',    file:'Old_ID',           cut:'ID',kind:'idle',len:[5,9]},
 {name:'Idle.restless',file:'Rushed_ID',       cut:'ID',kind:'idle',len:[3,7]},
 {name:'Walk.neutral',file:'Neutral_FW',       cut:'FW',kind:'walk',len:[.85,1.6]},
 {name:'Walk.old',    file:'Old_FW',           cut:'FW',kind:'walk',len:[1.0,2.2]},
 {name:'Walk.rushed', file:'Rushed_FW',        cut:'FW',kind:'walk',len:[.7,1.4]},
 {name:'Walk.heavy',  file:'Heavyset_FW',      cut:'FW',kind:'walk',len:[.9,1.8]},
 {name:'Walk.phone',  file:'OnPhoneRight_FW',  cut:'FW',kind:'walk',len:[.85,1.8]},
 {name:'Walk.pockets',file:'HandsInPockets_FW',cut:'FW',kind:'walk',len:[.85,1.6]},
 {name:'Walk.hips',   file:'WiggleHips_FW',    cut:'FW',kind:'walk',len:[.85,1.8]}
];

// ---- the target skeleton ---------------------------------------------------------------
const bytes=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
let rig=null;gltf.scene.traverse(o=>{if(!rig&&o.userData?.rig==='m')rig=o;});
rig.updateMatrixWorld(true);
const bones=new Map();rig.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
const tgtRest=new Map(),tgtParentRest=new Map();
for(const ue of Object.values(MAP)){const b=bones.get(ue);
 tgtRest.set(ue,new Quaternion().setFromRotationMatrix(b.matrixWorld));
 tgtParentRest.set(ue,new Quaternion().setFromRotationMatrix(b.parent.matrixWorld));}
const pelvis=bones.get('pelvis'),bindPelvis=pelvis.position.clone();
const pelvisParentInv=new Quaternion(),pelvisParentScale=new Vector3();
pelvis.parent.matrixWorld.decompose(new Vector3(),pelvisParentInv,pelvisParentScale);pelvisParentInv.invert();
const legOf=b=>bones.get('calf_r').getWorldPosition(new Vector3()).distanceTo(bones.get('thigh_r').getWorldPosition(new Vector3()))
 +bones.get('foot_r').getWorldPosition(new Vector3()).distanceTo(bones.get('calf_r').getWorldPosition(new Vector3()));
const targetLeg=legOf();

// ---- helpers ----------------------------------------------------------------------------
const cuts=Object.fromEntries(readFileSync(join(DIR,'Frame_Cuts.csv'),'utf8').trim().split(/\r?\n/).slice(1).map(l=>{const c=l.split(',');return [c[0],c];}));
const header=readFileSync(join(DIR,'Frame_Cuts.csv'),'utf8').split(/\r?\n/)[0].split(',');
const Y=new Vector3(0,1,0);
function yawOf(q){const f=new Vector3(0,0,1).applyQuaternion(q);return Math.atan2(f.x,f.z);}
function unwrap(a){const o=a.slice();for(let i=1;i<o.length;i++){while(o[i]-o[i-1]>Math.PI)o[i]-=2*Math.PI;while(o[i]-o[i-1]<-Math.PI)o[i]+=2*Math.PI;}return o;}
function smooth(a,w){const o=new Float64Array(a.length);for(let i=0;i<a.length;i++){let s=0,n=0;for(let k=Math.max(0,i-w);k<=Math.min(a.length-1,i+w);k++){s+=a[k];n++;}o[i]=s/n;}return o;}

function build(spec){
 const bvh=parseBVH(readFileSync(join(DIR,spec.file+'.bvh'),'utf8'));
 const by=n=>bvh.joints.find(j=>j.name===n),len=o=>Math.hypot(...o);
 const scale=targetLeg/(len(by('RightKnee').offset)+len(by('RightAnkle').offset));
 const row=cuts[spec.file.split('_')[0]];
 const from=+row[header.indexOf(spec.cut+'_START')],to=Math.min(bvh.frames-1,+row[header.indexOf(spec.cut+'_STOP')]);
 // World rotations and positions for the whole cut, once.
 const worlds=[],hips=[];
 for(let f=from;f<=to;f++){const w=forward(bvh,f,scale),m=new Map();for(const n of Object.keys(MAP))m.set(n,new Quaternion().setFromRotationMatrix(w.get(n)));
  worlds.push({rot:m,pos:Object.fromEntries(['Hips','LeftWrist','RightWrist','LeftAnkle','RightAnkle','Head'].map(n=>[n,new Vector3().setFromMatrixPosition(w.get(n))]))});
  hips.push(worlds.at(-1).pos.Hips);}
 // Heading: the hips' yaw, unwrapped and smoothed over a second, so sway stays and travel goes.
 const heading=smooth(unwrap(worlds.map(w=>yawOf(w.rot.get('Hips')))),Math.round(.5/bvh.frameTime));
 // Pose signature for loop matching: limbs relative to the hips, in the heading frame, plus hip height.
 const sig=i=>{const w=worlds[i],h=new Quaternion().setFromAxisAngle(Y,-heading[i]),o=[];
  for(const n of ['LeftWrist','RightWrist','LeftAnkle','RightAnkle','Head']){const v=w.pos[n].clone().sub(w.pos.Hips).applyQuaternion(h);o.push(v.x,v.y,v.z);}
  o.push(w.pos.Hips.y);return o;};
 const sigs=worlds.map((_,i)=>sig(i)),dist=(a,b)=>{let s=0;for(let k=0;k<a.length;k++)s+=(a[k]-b[k])**2;return s;};
 const minL=Math.round(spec.len[0]/bvh.frameTime),maxL=Math.round(spec.len[1]/bvh.frameTime);
 // A walk loop is taken at the clip's own cruising speed: the median hip speed over the cut,
 // measured a stride apart, so a loop cannot land on a turn, a start or a stop.
 const speedAt=(a,b)=>Math.hypot(hips[b].x-hips[a].x,hips[b].z-hips[a].z)/((b-a)*bvh.frameTime);
 let cruise=0;
 if(spec.kind==='walk'){const w=Math.round(1/bvh.frameTime),v=[];for(let i=0;i+w<hips.length;i+=4)v.push(speedAt(i,i+w));v.sort((x,y)=>x-y);cruise=v[Math.floor(v.length*.6)];}
 let best={d:Infinity,s:0,e:minL};
 const step=spec.kind==='idle'?6:1;
 for(let s=Math.round(worlds.length*.1);s+minL<worlds.length;s+=step)for(let L=minL;L<=maxL&&s+L<worlds.length;L+=step){
  let d=dist(sigs[s],sigs[s+L]);
  // A walk loop must also turn little.
  if(spec.kind==='walk'){d+=Math.abs(heading[s+L]-heading[s])*.5;const v=speedAt(s,s+L);d+=Math.abs(v-cruise)/cruise*.5;}
  if(d<best.d)best={d,s,e:s+L};
 }
 // Idles are slow: 15 keys a second is plenty and halves the file.
 const fps=spec.kind==='idle'?15:FPS;
 const {s,e}=best,duration=(e-s)*bvh.frameTime,steps=Math.max(2,Math.round(duration*fps));
 const restHipY=new Vector3().setFromMatrixPosition(forwardZero(bvh,scale).get('Hips')).y;
 const tracks=Object.fromEntries(Object.values(MAP).map(n=>[n,[]])),root=[],times=[];
 const fade=Math.min(steps>>2,Math.max(2,Math.round(.25*fps)));
 const solveAt=t=>{
  const fi=s+t/bvh.frameTime,f0=Math.floor(fi),f1=Math.min(e,f0+1),a=fi-f0;
  const H=new Quaternion().setFromAxisAngle(Y,-(heading[f0]*(1-a)+heading[f1]*a));
  const world=new Map();
  for(const [src,ue] of Object.entries(MAP)){
   const q=worlds[f0].rot.get(src).clone().slerp(worlds[f1].rot.get(src),a);
   world.set(ue,H.clone().multiply(q).multiply(tgtRest.get(ue)));
  }
  const local=new Map();
  for(const [ue,w] of world){const parent=bones.get(ue).parent.name;const pw=world.get(parent)??tgtParentRest.get(ue);local.set(ue,pw.clone().invert().multiply(w));}
  const hy=hips[f0].y*(1-a)+hips[f1].y*a;
  return {local,hy};
 };
 for(let k=0;k<steps;k++){
  const t=k/(steps-1)*duration;times.push(t);
  let {local,hy}=solveAt(t);
  // The seam: the last quarter second blends towards the first frame.
  if(k>=steps-fade){const w=(k-(steps-fade)+1)/fade,start=solveAt(0);
   for(const [ue,q] of local)q.slerp(start.local.get(ue),w*w*(3-2*w));hy=hy+(start.hy-hy)*w;}
  for(const [ue,q] of local)tracks[ue].push(q.x,q.y,q.z,q.w);
  const d=new Vector3(0,hy-restHipY,0).applyQuaternion(pelvisParentInv);
  root.push(bindPelvis.x+d.x/pelvisParentScale.x,bindPelvis.y+d.y/pelvisParentScale.y,bindPelvis.z+d.z/pelvisParentScale.z);
 }
 // Ground once: the lowest sole of the loop on the floor (the RUN 5.6 rule).
 const BALL_TO_SOLE=.0215;let lowest=Infinity;
 for(let k=0;k<steps;k++){
  for(const [ue,v] of Object.entries(tracks))bones.get(ue).quaternion.fromArray(v,k*4);
  pelvis.position.fromArray(root,k*3);rig.updateMatrixWorld(true);
  for(const n of ['ball_l','ball_r'])lowest=Math.min(lowest,bones.get(n).getWorldPosition(new Vector3()).y-BALL_TO_SOLE);
 }
 const lift=new Vector3(0,-lowest,0).applyQuaternion(pelvisParentInv);
 for(let k=0;k<steps;k++){root[k*3]+=lift.x/pelvisParentScale.x;root[k*3+1]+=lift.y/pelvisParentScale.y;root[k*3+2]+=lift.z/pelvisParentScale.z;}
 for(const b of bones.values()){b.position.copy(b.userData.restPos??b.position);}
 // Stride: hips travel over the loop, for the crowd's cadence.
 const stride=spec.kind==='walk'?Math.hypot(hips[e].x-hips[s].x,hips[e].z-hips[s].z):0;
 console.log(`${spec.name.padEnd(14)} ${spec.file.padEnd(18)} frames ${from+s}-${from+e} ${duration.toFixed(2)} s`+(stride?` stride ${stride.toFixed(2)} m (${(stride/duration).toFixed(2)} m/s)`:'')+(cruise?` cruise ${cruise.toFixed(2)}`:'')+` match ${best.d.toFixed(4)}`);
 return {name:spec.name,source:`100STYLE ${spec.file}.bvh frames ${from+s}-${from+e}`,duration,stride,kind:spec.kind,times,pelvis:root,tracks};
}
/** World matrices of the zero-rotation pose (100STYLE's T-pose rest). */
function forwardZero(bvh,scale){
 const out=new Map(),walk=(j,p)=>{const m=new Matrix4().makeTranslation(j.offset[0]*scale,j.offset[1]*scale,j.offset[2]*scale);const w=p?p.clone().multiply(m):m;out.set(j.name,w);for(const c of j.children)if(!c.end)walk(c,w);};
 walk(bvh.root,null);return out;
}

for(const b of bones.values())b.userData.restPos=b.position.clone(),b.userData.restQ=b.quaternion.clone();
const clips=[];
for(const spec of CLIPS){
 if(!existsSync(join(DIR,spec.file+'.bvh'))){console.warn('missing',spec.file);continue;}
 clips.push(build(spec));
 for(const b of bones.values()){b.position.copy(b.userData.restPos);b.quaternion.copy(b.userData.restQ);}
}
// ---- blends: the ordinary walk leaned towards a style, phase-aligned ------------------
//
// 100STYLE's Old is a very old person's shuffle (0.24 m/s) and WiggleHips a catwalk; a crowd of
// either is a caricature. Blended into the neutral walk at matching phase -- every walk loop
// rolled to start as the left foot is lowest -- they give an older walk and a softer one with
// some hip sway, at speeds a crossing actually moves at.
function pose(clip,k){
 for(const [ue,v] of Object.entries(clip.tracks))bones.get(ue).quaternion.fromArray(v,k*4);
 pelvis.position.fromArray(clip.pelvis,k*3);rig.updateMatrixWorld(true);
}
function alignLeft(clip){
 const n=clip.times.length-1;let best=0,low=Infinity;   // the last key repeats the first
 for(let k=0;k<n;k++){pose(clip,k);const y=bones.get('foot_l').getWorldPosition(new Vector3()).y;if(y<low){low=y;best=k;}}
 const roll=(a,w)=>{const o=[];for(let k=0;k<=n;k++){const j=(best+k)%n;for(let c=0;c<w;c++)o.push(a[j*w+c]);}return o;};
 return {...clip,pelvis:roll(clip.pelvis,3),tracks:Object.fromEntries(Object.entries(clip.tracks).map(([b,v])=>[b,roll(v,4)]))};
}
function sampleAt(clip,phase,ue){
 const n=clip.times.length-1,x=phase*n,k=Math.min(n-1,Math.floor(x)),a=x-k,v=clip.tracks[ue];
 return new Quaternion().fromArray(v,k*4).slerp(new Quaternion().fromArray(v,(k+1)*4),a);
}
function pelvisAt(clip,phase){const n=clip.times.length-1,x=phase*n,k=Math.min(n-1,Math.floor(x)),a=x-k;
 return new Vector3().fromArray(clip.pelvis,k*3).lerp(new Vector3().fromArray(clip.pelvis,(k+1)*3),a);}
function blend(name,A,B,w){
 const a=alignLeft(A),b=alignLeft(B),n=a.times.length-1,duration=A.duration+(B.duration-A.duration)*w;
 const times=[],tracks=Object.fromEntries(Object.keys(a.tracks).map(k=>[k,[]])),root=[];
 for(let k=0;k<=n;k++){const ph=k/n;times.push(ph*duration);
  for(const ue of Object.keys(tracks)){const q=sampleAt(a,ph,ue).slerp(sampleAt(b,ph,ue),w);tracks[ue].push(q.x,q.y,q.z,q.w);}
  const p=pelvisAt(a,ph).lerp(pelvisAt(b,ph),w);root.push(p.x,p.y,p.z);}
 const stride=A.stride+(B.stride-A.stride)*w;
 console.log(`${name.padEnd(14)} blend ${A.name} + ${(w*100).toFixed(0)}% ${B.name}: ${duration.toFixed(2)} s, stride ${stride.toFixed(2)} m (${(stride/duration).toFixed(2)} m/s)`);
 return {name,source:`blend: ${A.source} + ${(w*100).toFixed(0)}% ${B.source}`,duration,stride,kind:'walk',times,pelvis:root,tracks};
}
const named=n=>clips.find(c=>c.name===n);
if(named('Walk.neutral')&&named('Walk.old'))clips.push(blend('Walk.elder',named('Walk.neutral'),named('Walk.old'),.3));
if(named('Walk.neutral')&&named('Walk.hips'))clips.push(blend('Walk.female',named('Walk.neutral'),named('Walk.hips'),.25));
// Every walk starts as its left foot is lowest, so a walk's left contact is at phase 0 wherever
// it is played (the near pool's gait blend reads that as `leftContact`).
for(let k=0;k<clips.length;k++)if(clips[k].kind==='walk')clips[k]={...alignLeft(clips[k]),leftContact:0};
for(const b of bones.values()){b.position.copy(b.userData.restPos);b.quaternion.copy(b.userData.restQ);}
const b64=a=>Buffer.from(new Float32Array(a).buffer).toString('base64');
const encoded=clips.map(c=>({...c,duration:+c.duration.toFixed(4),stride:+c.stride.toFixed(4),times:b64(c.times),pelvis:b64(c.pelvis),
 tracks:Object.fromEntries(Object.entries(c.tracks).map(([k,v])=>[k,b64(v)]))}));
writeFileSync(OUT,JSON.stringify({generated:new Date().toISOString().slice(0,10),
 source:'100STYLE dataset (Ian Mason, Sebastian Starke, Taku Komura, 2022), https://www.ianxmason.com/100style/',
 license:'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) -- retargeted, looped and grounded by scripts/mocap/style-clips.mjs',
 fps:FPS,clips:encoded})+'\n');
console.log(`${OUT}: ${clips.length} clips`);
