// Look 2 (docs/GTA-LOOK.md): bake the MakeHuman CC0 citizens for the crowd.
//
//   node scripts/bake-crowd-citizens.mjs <buildDir>     (npm run bake:citizens -- <buildDir>)
//
// <buildDir> is what scripts/blender/build-citizens.py wrote: per citizen a .glb (one mesh skinned
// to the crowd's Quaternius skeleton), a .webp atlas and a .json (tint means). Out:
//   public/data/crowd/citizens.json + citizens.bin   the same layout as hq-crowd.json/.bin, so the
//                                                     crowd and its bone atlas work unchanged
//   public/data/crowd/citizens/<id>.webp              each citizen's texture atlas
//
// The bone atlas and clip table are copied from hq-crowd.json/.bin: the citizens are skinned to
// that skeleton, in its bind pose, so every baked row drives them as it is.
//
// Per citizen there is one vertex buffer and four index lists (meshoptimizer, keeping the UV seams
// and the region borders): L0 for the nearest people, L1, L2 and L3 for the far crowd. A vertex
// carries position, normal, skin index and weight (fingers folded into the hand, as the old bake
// does) and `crowdUV` -- atlas u, v and region, in one 16-bit attribute slot where the old crowd
// had its colour mask, because the crowd shader already uses every slot WebGL guarantees.
import {mkdirSync,writeFileSync,readFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptSimplifier} from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import {AnimationMixer,Matrix4,Vector3,DataUtils} from 'three';
import {citizenClips,DERIVED,PHONE_BONE,PHONE_CLIPS} from '../src/life/citizen-pose.mjs';
import {movesClips,decodeBase64} from '../src/life/citizen-moves.mjs';
import {MOVES} from '../src/life/appearance.mjs';
globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

const SRC=process.argv[2];
if(!SRC)throw new Error('usage: node scripts/bake-crowd-citizens.mjs <buildDir>');
const OUT='public/data/crowd';
const SPEC=JSON.parse(readFileSync('scripts/blender/citizens.json','utf8'));
// Triangle targets. L0 is drawn for at most the 48 nearest (L0_CAP_DEFAULT); L3 beyond 70 m.
const LODS=[{name:'L0',tris:16000,error:.004},{name:'L1',tris:5200,error:.02},{name:'L2',tris:1900,error:.06},{name:'L3',tris:650,error:.2}];

const hq=JSON.parse(readFileSync(`${OUT}/hq-crowd.json`,'utf8'));
const hqBin=readFileSync(`${OUT}/hq-crowd.bin`);
const boneIndex=new Map(hq.boneNames.map((n,i)=>[n,i]));
await MeshoptSimplifier.ready;

const buffers=[];let offset=0;
const push=typed=>{
 const view=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength),pad=(4-(view.length%4))%4;
 buffers.push(view);if(pad)buffers.push(Buffer.alloc(pad));
 const at=offset;offset+=view.length+pad;return {byteOffset:at,byteLength:view.length,count:typed.length};
};
// The crowd skeleton's bone atlas, byte for byte (each citizen also gets its own, below).
const atlas=push(new Float32Array(hqBin.buffer.slice(hqBin.byteOffset+hq.atlas.byteOffset,hqBin.byteOffset+hq.atlas.byteOffset+hq.atlas.byteLength)));

// Look 2b: each citizen has its own skeleton (build-citizens.py, natural fit) and so its own bone
// atlas -- the same rows and clips as hq-crowd, computed from the crowd's clips handed over as
// rotations, with a natural stance (src/life/citizen-pose.mjs).
const load=async file=>{const b=readFileSync(file);return new Promise((res,rej)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',res,rej));};
const fingers=new Map();
for(const [name,i] of boneIndex)if(/^(index|middle|pinky|ring|thumb)_/.test(name))fingers.set(i,boneIndex.get(name.endsWith('_l')?'hand_l':'hand_r'));

const Q=await load('public/data/character/citizen.glb');
let qPelvis=0;{let rig=null;Q.scene.traverse(o=>{if(!rig&&o.userData?.rig==='m')rig=o;});rig.updateMatrixWorld(true);
 rig.traverse(o=>{if(o.isBone&&o.name==='pelvis')qPelvis=o.getWorldPosition(new Vector3()).y;});}
// Look 2c: the motion-captured idles and walks (scripts/mocap/style-clips.mjs). Each citizen
// bakes only its own (MOVES), after the shared table's rows: idles at 10 fps, walks at 24.
const MOVE_CLIPS=movesClips(JSON.parse(readFileSync('public/data/character/citizen-moves.json','utf8')),decodeBase64);
function clipTable(id){
 const m=MOVES[id],names=m?[...new Set([...m.idles,...m.walks,m.hurry].filter(Boolean))]:[];
 const table=hq.clips.map(c=>({...c}));let row=hq.atlas.rows;
 for(const n of names){const c=MOVE_CLIPS.find(x=>x.name===(DERIVED[n]?.from??n));if(!c)throw new Error(`no move ${n}`);
  const fps=c.userData.kind==='idle'?10:24,frames=Math.max(2,Math.round(c.duration*fps));
  table.push({name:n,source:n,row,frames,duration:+c.duration.toFixed(4),fps,loop:true,...(c.userData.stride?{stride:c.userData.stride}:{})});row+=frames;}
 return {table,rows:row};
}
function boneAtlas(scene,mesh,female,id,weight){
 const bones=hq.boneNames.map(n=>mesh.skeleton.bones.find(b=>b.name===n));
 const inverse=hq.boneNames.map(n=>mesh.skeleton.boneInverses[mesh.skeleton.bones.findIndex(b=>b.name===n)]);
 scene.updateMatrixWorld(true);
 const pelvisY=bones[hq.boneNames.indexOf('pelvis')].getWorldPosition(new Vector3()).y;
 const clips=citizenClips([...Q.animations,...MOVE_CLIPS],scene,{pelvisScale:pelvisY/qPelvis,female,weight});
 const {table,rows}=clipTable(id);
 const out=new Float32Array(rows*hq.bones*12),m=new Matrix4(),mixer=new AnimationMixer(scene);
 const phoneBone=hq.boneNames.indexOf(PHONE_BONE),handR=hq.boneNames.indexOf('hand_r');let phone=null;
 for(const spec of table){
  const holds=PHONE_CLIPS.includes(spec.source);
  const clip=clips.find(c=>c.name===spec.source);if(!clip)throw new Error(`no clip ${spec.source}`);
  const action=mixer.clipAction(clip);action.reset().play();
  for(let f=0;f<spec.frames;f++){
   mixer.setTime(0);action.time=(f/spec.frames)*clip.duration;mixer.update(0);scene.updateMatrixWorld(true);
   if(spec.source==='Idle.text'&&f===0)phone=phonePlacement(bones,inverse[handR]);
   for(let b=0;b<bones.length;b++){
    const own=b===phoneBone?(holds?handR:-1):b;
    if(own<0)continue;   // no phone in this clip: a zero matrix
    m.multiplyMatrices(bones[own].matrixWorld,inverse[own]);const e=m.elements,o=((spec.row+f)*hq.bones+b)*12;
    out[o]=e[0];out[o+1]=e[4];out[o+2]=e[8];out[o+3]=e[12];out[o+4]=e[1];out[o+5]=e[5];out[o+6]=e[9];out[o+7]=e[13];out[o+8]=e[2];out[o+9]=e[6];out[o+10]=e[10];out[o+11]=e[14];
   }
  }
  action.stop();
 }
 mixer.uncacheRoot(scene);
 // The rest pose, for the near pool: each bone's local position in the atlas order.
 const rest=new Float32Array(bones.length*3);bones.forEach((b,i)=>rest.set([b.position.x,b.position.y,b.position.z],i*3));
 // Strides on this citizen's legs (citizenClips scaled them).
 for(const spec of table)if(spec.stride){const c=clips.find(x=>x.name===spec.source);spec.stride=+(c.userData.stride??spec.stride).toFixed(4);}
 return {atlas:out,rest,pelvisScale:pelvisY/qPelvis,table,rows,phone};
}
/**
 * Look 2d: where the phone sits, from the texting pose: between the two hands and a little past
 * the wrists, screen tipped up towards the face. Returned as phone box -> bind space through the
 * right hand (its bind matrix times its posed inverse), so the hand's matrix carries it.
 */
const PHONE={width:.07,length:.145,depth:.009};
function phonePlacement(bones,handInverse){
 const at=n=>bones[hq.boneNames.indexOf(n)].getWorldPosition(new Vector3());
 const lateral=at('thigh_l').sub(at('thigh_r')).setY(0).normalize(),up=new Vector3(0,1,0);
 const forward=new Vector3().crossVectors(lateral,up).normalize();
 const centre=at('hand_l').add(at('hand_r')).multiplyScalar(.5).addScaledVector(forward,.09).addScaledVector(up,.03);
 // The screen faces between straight up and the eyes.
 const screen=at('Head').sub(centre).normalize().add(up).normalize();
 const along=forward.clone().addScaledVector(screen,-forward.dot(screen)).normalize();
 const across=new Vector3().crossVectors(along,screen).normalize();
 const placed=new Matrix4().makeBasis(across,along,screen).setPosition(centre);
 const hand=bones[hq.boneNames.indexOf('hand_r')].matrixWorld;
 return new Matrix4().copy(handInverse).invert().multiply(hand.clone().invert()).multiply(placed);
}
/** A box's 24 vertices (flat faces) and 12 triangles; the +z face is the screen. */
function phoneBox(){
 const {width:w,length:l,depth:d}=PHONE,pos=[],nor=[],screen=[],idx=[];
 const faces=[[[1,0,0],[0,1,0],[0,0,1]],[[1,0,0],[0,-1,0],[0,0,-1]],[[0,0,1],[0,1,0],[1,0,0]],[[0,0,-1],[0,1,0],[-1,0,0]],[[1,0,0],[0,0,-1],[0,1,0]],[[1,0,0],[0,0,1],[0,-1,0]]];
 for(const [u,v,n] of faces){const base=pos.length/3;
  for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]])for(let k=0;k<3;k++)pos.push((u[k]*a+v[k]*b+n[k])*[w,l,d][k]/2);
  for(let i=0;i<4;i++){nor.push(...n);screen.push(n[2]>0?1:0);}
  idx.push(base,base+1,base+2,base,base+2,base+3);}
 return {pos,nor,screen,idx};
}

mkdirSync(`${OUT}/citizens`,{recursive:true});
const archetypes=[];
for(const c of SPEC.citizens){
 const gltf=await load(join(SRC,c.id+'.glb'));
 const meta=JSON.parse(readFileSync(join(SRC,c.id+'.json'),'utf8'));
 let mesh=null;gltf.scene.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o;});
 if(!mesh)throw new Error(`${c.id}: no skinned mesh`);
 const g=mesh.geometry,n=g.attributes.position.count;
 // The bone atlas first: the phone's place comes from the texting pose.
 const baked=boneAtlas(gltf.scene,mesh,c.macro.gender<.5,c.id,c.macro.weight);
 // Look 2d: a texter's phone, 24 more vertices, drawn at L0 and L1 (regions 6 case, 7 screen).
 const box=baked.phone?phoneBox():null,N=n+(box?box.pos.length/3:0);
 for(const k of ['position','normal','skinIndex','skinWeight','uv','color'])if(!g.attributes[k])throw new Error(`${c.id}: no ${k}`);
 // Skin indices of this file's skeleton -> the canonical bone order of the atlas.
 const remap=mesh.skeleton.bones.map(b=>{const i=boneIndex.get(b.name);if(i===undefined)throw new Error(`${c.id}: bone ${b.name} not in the atlas`);return i;});
 const pos=new Float32Array(N*3),nor=new Float32Array(N*3),si=new Uint8Array(N*4),sw=new Uint8Array(N*4),cuv=new Uint16Array(N*4);
 const attrs=new Float32Array(N*6);
 const regions=[0,0,0,0,0,0,0,0];
 for(let v=0;v<n;v++){
  for(let k=0;k<3;k++){pos[v*3+k]=g.attributes.position.getComponent(v,k);nor[v*3+k]=g.attributes.normal.getComponent(v,k);}
  const acc=new Map();
  for(let k=0;k<4;k++){const w=g.attributes.skinWeight.getComponent(v,k);if(w<=0)continue;let b=remap[g.attributes.skinIndex.getComponent(v,k)];b=fingers.get(b)??b;acc.set(b,(acc.get(b)??0)+w);}
  const sorted=[...acc.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4),total=sorted.reduce((s,[,w])=>s+w,0)||1;
  // Weights to bytes that still sum to exactly 255.
  let left=255;
  for(let k=0;k<4;k++){const e=sorted[k];si[v*4+k]=e?e[0]:0;const q=e?(k===sorted.length-1?left:Math.min(left,Math.round(e[1]/total*255))):0;sw[v*4+k]=q;left-=q;}
  const u=g.attributes.uv.getX(v),w=g.attributes.uv.getY(v),r=Math.round(g.attributes.color.getX(v)*8);
  regions[r]++;
  cuv[v*4]=Math.round(Math.min(1,Math.max(0,u))*65535);cuv[v*4+1]=Math.round(Math.min(1,Math.max(0,w))*65535);cuv[v*4+2]=Math.round(r/8*65535);
  attrs.set([nor[v*3],nor[v*3+1],nor[v*3+2],u,w,r],v*6);
 }
 const index=new Uint32Array(g.index.array);
 let phoneIndex=[];
 if(box){
  const normal=new Matrix4().copy(baked.phone).invert().transpose(),p=new Vector3(),q=new Vector3(),bone=boneIndex.get(PHONE_BONE);
  for(let i=0;i<box.pos.length/3;i++){const v=n+i,r=box.screen[i]?7:6;
   p.fromArray(box.pos,i*3).applyMatrix4(baked.phone).toArray(pos,v*3);
   q.fromArray(box.nor,i*3).transformDirection(normal).toArray(nor,v*3);
   si[v*4]=bone;sw[v*4]=255;cuv[v*4+2]=Math.round(r/8*65535);regions[r]++;}
  phoneIndex=box.idx.map(i=>n+i);
 }
 const entries={position:push(pos),normal:push(nor),skinIndex:push(si),skinWeight:push(sw),crowdUV:push(cuv)};
 const levels=[];
 let bbox=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
 for(let v=0;v<n;v++)for(let k=0;k<3;k++){bbox[k]=Math.min(bbox[k],pos[v*3+k]);bbox[k+3]=Math.max(bbox[k+3],pos[v*3+k]);}
 for(const lod of LODS){
  let idx=index;
  if(index.length/3>lod.tris){
   // Seams: the UV and the region carry weight, so a collapse never crosses a tile or a garment edge.
   const [s]=MeshoptSimplifier.simplifyWithAttributes(index,pos,3,attrs,6,[.4,.4,.4,2,2,8],null,lod.tris*3,lod.error,[]);
   idx=s;
  }
  if(lod.name==='L0'||lod.name==='L1')idx=[...idx,...phoneIndex];
  const typed=N>65535?new Uint32Array(idx):new Uint16Array(idx);
  levels.push({name:lod.name,vertices:N,triangles:idx.length/3,indexType:typed.BYTES_PER_ELEMENT===4?'u32':'u16',...entries,index:push(typed)});
 }
 // Half floats: a bone matrix entry is a rotation (|v| <= 1) or a translation of a metre or two,
 // and 16 bits keep those to about a millimetre -- for half the download.
 const half=new Uint16Array(baked.atlas.length);for(let i=0;i<half.length;i++)half[i]=DataUtils.toHalfFloat(baked.atlas[i]);
 const boneAtlasEntry=push(half),restEntry=push(baked.rest);
 copyFileSync(join(SRC,c.id+'.webp'),`${OUT}/citizens/${c.id}.webp`);
 archetypes.push({id:c.id,texture:`/data/crowd/citizens/${c.id}.webp`,means:meta.means,macro:c.macro,outfit:c.outfit,shoes:c.shoes,hair:c.hair,
  skin:c.skin,naturalHeight:+(bbox[4]-bbox[1]).toFixed(4),scaleToGame:hq.archetypes[0].scaleToGame,meshHeight:+(bbox[4]-bbox[1]).toFixed(4),
  female:c.macro.gender<.5,pelvisScale:+baked.pelvisScale.toFixed(4),
  boneAtlas:{...boneAtlasEntry,rows:baked.rows,width:hq.atlas.width,height:baked.rows,format:'RGBA16F'},rest:restEntry,
  clips:baked.table,
  regions:Object.fromEntries(['skin','top','bottom','hair','shoe','keep','phone','screen'].map((k,i)=>[k,regions[i]])),levels});
 console.log(`  ${c.id.padEnd(13)} ${n}v  `+levels.map(l=>`${l.name} ${l.triangles}t`).join('  ')+`  h ${(bbox[4]-bbox[1]).toFixed(3)}`);
}
const bin=Buffer.concat(buffers);
writeFileSync(`${OUT}/citizens.bin`,bin);
const manifest={generated:new Date().toISOString().slice(0,10),
 source:'MakeHuman CC0 assets via MPFB 2 (scripts/blender/build-citizens.py, scripts/blender/citizens.json), skinned to public/data/character/citizen.glb',
 architecture:hq.architecture+'; textured atlas per archetype, crowdUV (u, v, region) in place of the colour mask',
 bones:hq.bones,boneNames:hq.boneNames,atlas:{...hq.atlas,...atlas},clips:hq.clips,archetypes,
 output:{file:`${OUT}/citizens.bin`,bytes:bin.length,sha256:createHash('sha256').update(bin).digest('hex')}};
writeFileSync(`${OUT}/citizens.json`,JSON.stringify(manifest,null,1)+'\n');
console.log(`citizens.bin ${(bin.length/1048576).toFixed(2)} MiB, ${archetypes.length} citizens`);
