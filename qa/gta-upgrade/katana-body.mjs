// Katana C: the cut's body mechanics, measured on a baked clip JSON (scripts/cmu/weapon-clip.mjs
// output) posed on the game's rig: per key, the pelvis, chest and head yaw (degrees, + is the
// body's left), the pelvis height and travel, each foot's position, and the blade tip's speed.
// Reports when the hips and the chest turn fastest (the hips should lead), whether the tip is
// fastest at the cut, how far each foot slides while planted, and the hold at the end (zanshin).
//
//   node qa/gta-upgrade/katana-body.mjs [clip.json=assets/character/cmu-weapons/katana-cut.json] [--rows]
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Quaternion,Vector3,Matrix4} from 'three';
import {GRIP,SHAPE} from '../../src/player/weapons.mjs';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

export async function bodyMechanics(file='assets/character/cmu-weapons/katana-cut.json'){
 const clip=JSON.parse(readFileSync(file,'utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((r,j)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',r,j));
 const root=gltf.scene,bones=new Map();root.traverse(o=>{if(o.isBone&&!bones.has(o.name))bones.set(o.name,o);});
 const pos=n=>{const b=bones.get(n);b.updateWorldMatrix(true,false);return new Vector3().setFromMatrixPosition(b.matrixWorld);};
 const yawOf=n=>{const b=bones.get(n);b.updateWorldMatrix(true,false);
  const q=new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(b.matrixWorld));
  const f=new Vector3(0,0,1).applyQuaternion(q.multiply(rest.get(n).clone().invert()));return Math.atan2(f.x,f.z)*180/Math.PI;};
 // Yaw is measured as each bone's turn from its bind pose, carried onto +Z.
 const rest=new Map();for(const n of ['pelvis','spine_03','Head']){const b=bones.get(n);b.updateWorldMatrix(true,false);
  rest.set(n,new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(b.matrixWorld)));}
 const g=GRIP.katana,tipLocal=new Vector3(...g.at).addScaledVector(new Vector3(...g.forward).normalize(),SHAPE.katana.tip);
 const rows=[];
 for(let s=0;s<clip.times.length;s++){
  for(const [n,v] of Object.entries(clip.tracks))bones.get(n)?.quaternion.fromArray(v,s*4);
  bones.get('pelvis').position.fromArray(clip.rootPos,s*3);root.updateMatrixWorld(true);
  const tip=tipLocal.clone().applyMatrix4(bones.get('hand_r').matrixWorld);
  rows.push({t:clip.times[s],pelvis:yawOf('pelvis'),chest:yawOf('spine_03'),head:yawOf('Head'),hip:pos('pelvis'),
   footL:pos('foot_l'),footR:pos('foot_r'),ballL:pos('ball_l'),ballR:pos('ball_r'),tip});
 }
 const d=(a,b,k)=>(b[k]-a[k])/(b.t-a.t);
 for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];
  b.tipSpeed=b.tip.distanceTo(a.tip)/(b.t-a.t);b.pelvisRate=d(a,b,'pelvis');b.chestRate=d(a,b,'chest');}
 rows[0].tipSpeed=0;rows[0].pelvisRate=rows[0].chestRate=0;
 const argmax=f=>rows.reduce((m,r)=>f(r)>f(m)?r:m,rows[0]);
 const tipPeak=argmax(r=>r.tipSpeed);
 // The release: the fastest turn toward the right (negative yaw rate) of the hips and the chest.
 const hipsPeak=argmax(r=>-r.pelvisRate),chestPeak=argmax(r=>-r.chestRate);
 // A planted foot: the ball below 4 cm off its lowest; its slide is how far it moves while so.
 // A planted foot: the ball below 4 cm off its lowest; its slide is how far it moves while so,
 // outside the moves the bake plans for it (clip.body: the step in, the draw-up, the way back).
 const B=clip.body?.step?clip.body:null,planned=(k,t)=>!!B&&([B.step,B.draw].some(m=>m?.foot===k&&t>=m.at[0]-.02&&t<=m.at[1]+.02)||t>=B.back[0]-.02);
 const slide=k=>{const key=k==='l'?'ballL':'ballR',low=Math.min(...rows.map(r=>r[key].y));let max=0,ref=null;
  for(const r of rows){if(r[key].y<low+.04&&!planned(k,r.t)){ref??=r[key].clone();max=Math.max(max,Math.hypot(r[key].x-ref.x,r[key].z-ref.z));}else ref=null;}return max;};
 // The hold: the longest run with the tip slower than 0.6 m/s after the cut.
 let hold=0,run=0;
 for(const r of rows)if(r.t>tipPeak.t){if(r.tipSpeed<.6){run+=clip.times[1]-clip.times[0];if(run>hold){hold=run;}}else run=0;}
 const lowest=Math.min(...rows.map(r=>r.hip.y)),first=rows[0].hip;
 return {file,duration:clip.duration,
  tipPeak:{t:+tipPeak.t.toFixed(3),ms:+tipPeak.tipSpeed.toFixed(1)},
  hipsLead:{hipsAt:+hipsPeak.t.toFixed(3),chestAt:+chestPeak.t.toFixed(3),leadMs:Math.round((chestPeak.t-hipsPeak.t)*1000),
   hipsDegS:Math.round(-hipsPeak.pelvisRate),chestDegS:Math.round(-chestPeak.chestRate)},
  yawRange:Object.fromEntries(['pelvis','chest','head'].map(k=>[k,[Math.round(Math.min(...rows.map(r=>r[k]))),Math.round(Math.max(...rows.map(r=>r[k])))]])),
  hipDropCm:Math.round((first.y-lowest)*100),hipTravelCm:Math.round(Math.max(...rows.map(r=>r.hip.z-first.z))*100),
  footSlideCm:{left:+(slide('l')*100).toFixed(1),right:+(slide('r')*100).toFixed(1)},
  frontFootForwardCm:Math.round((Math.max(...rows.map(r=>r.ballR.z))-rows[0].ballR.z)*100),
  holdS:+hold.toFixed(2),rows};
}

if(process.argv[1]?.endsWith('katana-body.mjs')){
 const file=process.argv.slice(2).find(a=>!a.startsWith('--'));
 const r=await bodyMechanics(file);
 if(process.argv.includes('--rows'))for(const x of r.rows)console.log([x.t.toFixed(3),x.pelvis.toFixed(0),x.chest.toFixed(0),x.head.toFixed(0),
  x.hip.y.toFixed(3),x.hip.z.toFixed(3),`L(${x.ballL.x.toFixed(2)},${x.ballL.y.toFixed(2)},${x.ballL.z.toFixed(2)})`,`R(${x.ballR.x.toFixed(2)},${x.ballR.y.toFixed(2)},${x.ballR.z.toFixed(2)})`,x.tipSpeed.toFixed(1)].join('\t'));
 const {rows,...summary}=r;console.log(JSON.stringify(summary,null,1));
}
