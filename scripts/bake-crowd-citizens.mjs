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
// The bone atlas first, byte for byte.
const atlas=push(new Float32Array(hqBin.buffer.slice(hqBin.byteOffset+hq.atlas.byteOffset,hqBin.byteOffset+hq.atlas.byteOffset+hq.atlas.byteLength)));

const load=async file=>{const b=readFileSync(file);return new Promise((res,rej)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',res,rej));};
const fingers=new Map();
for(const [name,i] of boneIndex)if(/^(index|middle|pinky|ring|thumb)_/.test(name))fingers.set(i,boneIndex.get(name.endsWith('_l')?'hand_l':'hand_r'));

mkdirSync(`${OUT}/citizens`,{recursive:true});
const archetypes=[];
for(const c of SPEC.citizens){
 const gltf=await load(join(SRC,c.id+'.glb'));
 const meta=JSON.parse(readFileSync(join(SRC,c.id+'.json'),'utf8'));
 let mesh=null;gltf.scene.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o;});
 if(!mesh)throw new Error(`${c.id}: no skinned mesh`);
 const g=mesh.geometry,n=g.attributes.position.count;
 for(const k of ['position','normal','skinIndex','skinWeight','uv','color'])if(!g.attributes[k])throw new Error(`${c.id}: no ${k}`);
 // Skin indices of this file's skeleton -> the canonical bone order of the atlas.
 const remap=mesh.skeleton.bones.map(b=>{const i=boneIndex.get(b.name);if(i===undefined)throw new Error(`${c.id}: bone ${b.name} not in the atlas`);return i;});
 const pos=new Float32Array(n*3),nor=new Float32Array(n*3),si=new Uint8Array(n*4),sw=new Uint8Array(n*4),cuv=new Uint16Array(n*4);
 const attrs=new Float32Array(n*6);
 const regions=[0,0,0,0,0,0];
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
  const typed=n>65535?new Uint32Array(idx):new Uint16Array(idx);
  levels.push({name:lod.name,vertices:n,triangles:idx.length/3,indexType:typed.BYTES_PER_ELEMENT===4?'u32':'u16',...entries,index:push(typed)});
 }
 copyFileSync(join(SRC,c.id+'.webp'),`${OUT}/citizens/${c.id}.webp`);
 archetypes.push({id:c.id,texture:`/data/crowd/citizens/${c.id}.webp`,means:meta.means,macro:c.macro,outfit:c.outfit,shoes:c.shoes,hair:c.hair,
  skin:c.skin,naturalHeight:hq.archetypes[0].naturalHeight,scaleToGame:hq.archetypes[0].scaleToGame,meshHeight:+(bbox[4]-bbox[1]).toFixed(4),
  regions:Object.fromEntries(['skin','top','bottom','hair','shoe','keep'].map((k,i)=>[k,regions[i]])),levels});
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
