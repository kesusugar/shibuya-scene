// Convert the verified upstream humanoid into the single file Shibuya actually loads.
//
// The upstream packs are 20 MiB of general-purpose content: 43 animation clips, four UV
// channels, two constant vertex-colour channels, and 12 MiB of 4K superhero textures. A city
// that guards its startup time cannot ship any of that. This script keeps the clips the game
// has states for, drops every attribute nothing reads, dresses the body without a texture,
// and writes one GLB.
//
// It is also the seam the CharacterAsset abstraction sits on. The output is plain glTF with
// logical clip names ('Walk', 'Punch', 'Enter'), so replacing Quaternius with a more
// photorealistic body later means producing the same clip names on the same skeleton, not
// touching the game.
//
// Run: npm run convert:character   (after npm run fetch:character)
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// The exporter reaches for FileReader to turn its Blob into bytes, and three's FileLoader
// reports progress the same way for a data: URI as for a URL. Nothing else about either needs
// a browser, so two shims are cheaper than writing a glTF serialiser.
globalThis.FileReader??=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

const UP='assets/character/upstream';
const OUT='public/data/character';
const TARGET_HEIGHT=1.76;        // FIGURE.height; the pack is authored around 1.82 m
const BODY='SuperHero_Male';
const HAIR='Hair_SimpleParted';

// Logical name -> upstream clip. Everything the player state machine can ask for, and nothing
// else. 'Fall' and 'Death' are two views of one clip: the game scrubs Fall by hand while the
// body is still in the air and lets Death play out on the ground.
const CLIPS={
 Idle:'Idle_Loop', Walk:'Walk_Loop', Run:'Jog_Fwd_Loop', Sprint:'Sprint_Loop',
 Punch:'Punch_Jab', PunchCross:'Punch_Cross', Hit:'Hit_Chest', Startle:'Hit_Head',
 Guard:'Crouch_Idle_Loop', Enter:'Sitting_Enter', Exit:'Sitting_Exit', Drive:'Driving_Loop',
 Interact:'Interact', Fall:'Death01', Death:'Death01'
};

// Attributes nothing samples. Quaternius ships four UV sets for engine-side material layering
// we do not do, and two vertex-colour channels that are constant across the whole mesh --
// which is what frees COLOR_0 to carry the garment mask instead.
const DROP=['uv1','uv2','uv3','color','color_1','tangent'];

// Forty of the sixty-five bones are finger joints. Keyframing them costs two thirds of every
// clip and buys nothing at the distance a third-person camera holds. The bones stay, because
// the skin is weighted to them; they just hold one pose instead of carrying tracks.
const FINGER=/(^|\.)(index|middle|pinky|ring|thumb)_/;

// Which garment covers which bone.
//
// The body arrives naked: everything that made it a superhero was in a twelve-megabyte texture
// set, and a city of citizens cannot pay that. Rather than paint clothes into a texture, each
// bone is labelled with what covers it and every vertex inherits the labels of the bones it is
// skinned to, weighted exactly as the skin is. Joints therefore blend on their own, with no
// hem to author and no UV work; SHARPNESS then pulls that blend in to something like a seam,
// because skin weights spread a shirt hem over a third of the torso if you let them.
const SKIN=0,TOP=1,BOTTOM=2,HAIRMASK=3,SHOE=4;
const REGION=[
 [/^Head$|^neck_/,SKIN],[/^lowerarm_|^hand_|^(index|middle|pinky|ring|thumb)_/,SKIN],
 [/^spine_|^clavicle_|^upperarm_/,TOP],
 [/^pelvis$|^thigh_|^calf_/,BOTTOM],
 [/^foot_|^ball_/,SHOE]
];
const SHARPNESS=6;
const regionOf=name=>{for(const [pattern,id] of REGION)if(pattern.test(name))return id;return TOP;};

// Colours the two accessory meshes lose with their constant vertex-colour channel.
const FLAT={Eyebrows:0x0a0503,Eyes:0xf2efe8};

const sha=b=>createHash('sha256').update(b).digest('hex');
const loadGLB=file=>{const b=readFileSync(file);return new Promise((res,rej)=>
 new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',res,rej));};

/** Load a .gltf + .bin pair without touching its images: inline the buffer, cut the textures. */
function loadPair(base){
 const json=JSON.parse(readFileSync(base+'.gltf','utf8'));
 const bin=readFileSync(base+'.bin');
 json.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];
 delete json.images;delete json.textures;delete json.samplers;
 for(const m of json.materials??[]){
  delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;
  const p=m.pbrMetallicRoughness;if(p){delete p.baseColorTexture;delete p.metallicRoughnessTexture;}
 }
 return new Promise((res,rej)=>new GLTFLoader().parse(JSON.stringify(json),'',res,rej));
}

/**
 * Measure how fast each locomotion clip is authored to travel.
 *
 * The clips we ship have root motion disabled, which is what a simulation-driven character
 * wants -- the controller and the crowd own position, not the animation. But that also means a
 * clip carries no record of the speed its stride was drawn for, and playing a 5.4 m/s jog at
 * 3 m/s is what foot sliding actually is. The root-motion variant of the same library does
 * carry it, so the distance is read out of that file and shipped alongside the clips.
 */
async function measureGait(file){
 const g=await loadGLB(file),gait={};
 for(const [name,source] of Object.entries(CLIPS)){
  const clip=g.animations.find(c=>c.name===source);if(!clip)continue;
  const track=clip.tracks.find(t=>t.name==='root.position');if(!track)continue;
  const v=track.values,n=v.length/3;
  const distance=Math.hypot(v[(n-1)*3]-v[0],v[(n-1)*3+2]-v[2]);
  if(distance>.05)gait[name]=Number((distance/clip.duration).toFixed(4));
 }
 return gait;
}

/** Four skin weights as bytes, renormalised so a vertex still sums to one after rounding. */
function quantiseWeights(geometry){
 const weight=geometry.attributes.skinWeight;
 if(!weight||!(weight.array instanceof Float32Array))return;
 const bytes=new Uint8Array(weight.count*4);
 for(let i=0;i<weight.count;i++){
  const w=[0,1,2,3].map(k=>Math.round(weight.array[i*4+k]*255));
  const sum=w.reduce((a,b)=>a+b,0);
  if(sum!==255&&sum>0){let biggest=0;for(let k=1;k<4;k++)if(w[k]>w[biggest])biggest=k;w[biggest]+=255-sum;}
  for(let k=0;k<4;k++)bytes[i*4+k]=Math.max(0,Math.min(255,w[k]));
 }
 geometry.setAttribute('skinWeight',new T.BufferAttribute(bytes,4,true));
}

/**
 * Garment weights per vertex, in COLOR_0.
 *
 * Four channels for five garments: the weights sum to one, so the shoes are whatever the other
 * four leave over. `fixed` forces every vertex to one garment, which is how the hair mesh joins
 * the body mesh without needing bones of its own to say what it is.
 */
function garmentMask(geometry,bones,fixed=null){
 const index=geometry.attributes.skinIndex,weight=geometry.attributes.skinWeight;
 const mask=new Uint8Array(index.count*4);
 for(let i=0;i<index.count;i++){
  const part=[0,0,0,0,0];
  if(fixed!==null)part[fixed]=1;
  else for(let k=0;k<4;k++){
   const bone=bones[index.getComponent(i,k)];if(!bone)continue;
   part[regionOf(bone.name)]+=weight.getComponent(i,k);
  }
  // Pull the blend in. A raw skin-weight mix spreads a hem over a third of the torso; raising
  // each weight to a power and renormalising keeps the boundary where it was and narrows it,
  // without ever producing the hard staircase a nearest-bone assignment would.
  let sum=0;for(let k=0;k<5;k++){part[k]=part[k]**SHARPNESS;sum+=part[k];}
  for(let k=0;k<4;k++)mask[i*4+k]=sum>0?Math.max(0,Math.min(255,Math.round(part[k]/sum*255))):0;
 }
 geometry.setAttribute('color',new T.BufferAttribute(mask,4,true));
}

const animations=await loadGLB(`${UP}/ual1/UAL1_Standard.glb`);
const gait=await measureGait(`${UP}/ual1/UAL1_Standard_RM.glb`);
const body=await loadPair(`${UP}/ubc/BaseCharacters/Superhero_Male_FullBody`);
const hair=await loadPair(`${UP}/ubc/Hairstyles/${HAIR}`);

const root=new T.Group();root.name='citizen';
const meshes=[];
body.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
if(!meshes.length)throw new Error('body has no skinned mesh');
const skeleton=meshes[0].skeleton;

// The armature subtree is shared by every mesh; move it across intact so the bind poses and
// the animation track names keep pointing at the same objects.
let top=skeleton.bones[0];while(top.parent&&top.parent!==body.scene)top=top.parent;
root.add(top);

let vertices=0,triangles=0,dropped=0,masked=0,hairVertices=0;
for(const mesh of meshes){
 for(const name of DROP)if(mesh.geometry.attributes[name]){mesh.geometry.deleteAttribute(name);dropped++;}
 quantiseWeights(mesh.geometry);

 if(mesh.name===BODY){
  garmentMask(mesh.geometry,skeleton.bones);
  masked=mesh.geometry.attributes.position.count;

  // The hairstyle is a separate download rigged to the same sixty-five bones with the same
  // bind pose, so it is not a second object to draw -- it is more of this one. Merging it in
  // keeps a citizen at one draw call for everything the eye reads as a person, and the mask's
  // fourth channel gives the hair its own colour anyway.
  const piece=[];hair.scene.traverse(o=>{if(o.isSkinnedMesh)piece.push(o);});
  const names=b=>b.map(x=>x.name).join(',');
  if(piece.length!==1||names(piece[0].skeleton.bones)!==names(skeleton.bones))
   throw new Error(`hairstyle ${HAIR} does not share the body skeleton`);
  const g=piece[0].geometry;
  for(const name of DROP)if(g.attributes[name])g.deleteAttribute(name);
  quantiseWeights(g);garmentMask(g,skeleton.bones,HAIRMASK);
  hairVertices=g.attributes.position.count;
  const merged=mergeGeometries([mesh.geometry,g],false);
  if(!merged)throw new Error('hair and body geometry do not merge');
  mesh.geometry.dispose();g.dispose();mesh.geometry=merged;
 }

 // Flat, untextured, tinted at runtime. Shipping the 4K superhero set would cost twelve
 // megabytes to dress every citizen in the same suit; the city wants variety, not detail.
 mesh.material=new T.MeshStandardMaterial({
  name:mesh.name===BODY?'citizen':mesh.material.name,
  color:FLAT[mesh.name]??0xffffff,roughness:.78,metalness:0,
  vertexColors:mesh.name===BODY
 });
 mesh.frustumCulled=false;root.add(mesh);
 vertices+=mesh.geometry.attributes.position.count;
 triangles+=(mesh.geometry.index?mesh.geometry.index.count:mesh.geometry.attributes.position.count)/3;
}

root.updateMatrixWorld(true);
const box=new T.Box3().setFromObject(root);
const height=box.max.y-box.min.y;

// Left at the bind pose the hands are flat, splayed and obviously a T-pose. Idle's first frame
// is a relaxed hand, so bake that into the rest transform and let every clip inherit it.
const idle=animations.animations.find(c=>c.name===CLIPS.Idle);
const fingers=new Map();
for(const bone of skeleton.bones)if(FINGER.test('.'+bone.name))fingers.set(bone.name,bone);
for(const track of idle?.tracks??[]){
 const cut=track.name.lastIndexOf('.');
 const bone=fingers.get(track.name.slice(0,cut));if(!bone)continue;
 if(track.name.slice(cut+1)==='quaternion')bone.quaternion.fromArray(track.values,0);
 else if(track.name.slice(cut+1)==='position')bone.position.fromArray(track.values,0);
}
skeleton.bones[0].updateMatrixWorld(true);

const clips=[];
let tracksKept=0,tracksCut=0;
for(const [name,source] of Object.entries(CLIPS)){
 const found=animations.animations.find(c=>c.name===source);
 if(!found){console.warn(`missing upstream clip ${source} for ${name}`);continue;}
 const clip=found.clone();clip.name=name;
 const before=clip.tracks.length;
 // Scale is a constant one throughout this library and is a third of the track count.
 clip.tracks=clip.tracks.filter(t=>!t.name.endsWith('.scale')&&!FINGER.test(t.name));
 tracksCut+=before-clip.tracks.length;tracksKept+=clip.tracks.length;
 clip.optimize();
 clips.push(clip);
}
// ---- PHASE A -- the hybrid Run -------------------------------------------------------
//
// If the derived hybrid clip is present, it replaces the Quaternius Run. It is a normal
// AnimationClip by the time it reaches this point and by the time it reaches the game: the
// composition of CMU legs with a Quaternius upper body happened offline, in
// scripts/cmu/hybrid.mjs, and nothing at runtime samples two sources or knows there were ever
// two. See assets/character/hybrid-run.json for the provenance of each half.
//
// Absent, the build falls back to the upstream Run without comment, so a checkout that does
// not carry the derived clip still produces a working character.
let hybridRun=null;
try{
 hybridRun=JSON.parse(readFileSync('assets/character/hybrid-run.json','utf8'));
}catch{}
if(hybridRun){
 const index=clips.findIndex(c=>c.name==='Run');
 if(index<0)console.warn('no Run clip to replace');
 else{
  const tracks=[];
  for(const [bone,values] of Object.entries(hybridRun.tracks))
   tracks.push(new T.QuaternionKeyframeTrack(`${bone}.quaternion`,hybridRun.times,values));
  tracks.push(new T.VectorKeyframeTrack('pelvis.position',hybridRun.times,hybridRun.rootPos));
  const replacement=new T.AnimationClip('Run',hybridRun.gait.duration,tracks);
  replacement.optimize();
  clips[index]=replacement;
  // The stride the blend drives its period from has to be the one this clip actually has,
  // not the upstream Jog's. Getting this wrong is the difference between matched feet and
  // the foot sliding RUN 4 existed to remove.
  gait.Run=hybridRun.gait.speed;
  hybridRun.applied={tracks:replacement.tracks.length,duration:replacement.duration};
  console.log(`Run replaced by the hybrid: ${replacement.duration.toFixed(3)} s, `+
   `${replacement.tracks.length} tracks, native ${gait.Run} m/s`);
 }
}

root.animations=clips;

const report={
 generated:new Date().toISOString().slice(0,10),
 source:'Quaternius Universal Base Characters [Standard] + Universal Animation Library [Standard], CC0-1.0',
 body:{meshes:meshes.length,vertices,triangles,attributesDropped:dropped,
  garmentMaskVertices:masked+hairVertices,hairVertices,hairstyle:HAIR,
  bones:skeleton.bones.length,animatedBones:skeleton.bones.length-fingers.size,
  height:Number(height.toFixed(4)),scaleToGame:Number((TARGET_HEIGHT/height).toFixed(5))},
 clips:clips.map(c=>({name:c.name,
  upstream:c.name==='Run'&&hybridRun?.applied?'hybrid (CMU 16_45 legs + Quaternius upper)':CLIPS[c.name],
  seconds:Number(c.duration.toFixed(3)),tracks:c.tracks.length})),
 gait,
 ...(hybridRun?.applied?{hybridRun:{
  stride:hybridRun.gait.stride,speed:hybridRun.gait.speed,
  lowerBody:hybridRun.provenance.lowerBody.source,
  upperBody:hybridRun.provenance.upperBody.source,
  boundary:hybridRun.provenance.boundary.bone}}:{})
};

mkdirSync(OUT,{recursive:true});
const glb=await new Promise((res,rej)=>new GLTFExporter().parse(root,res,rej,
 {binary:true,animations:clips,includeCustomExtensions:false}));
const bytes=Buffer.from(glb);
writeFileSync(`${OUT}/citizen.glb`,bytes);
report.output={file:'public/data/character/citizen.glb',bytes:bytes.length,sha256:sha(bytes)};
writeFileSync(`${OUT}/citizen.json`,JSON.stringify(report,null,1)+'\n');

console.log(`citizen.glb  ${(bytes.length/1024).toFixed(1)} KiB`);
console.log(`  ${meshes.length} meshes, ${vertices} vertices, ${triangles} triangles, ${report.body.bones} bones`);
console.log(`  ${clips.length} clips: ${clips.map(c=>c.name).join(' ')}`);
console.log(`  height ${height.toFixed(3)} m -> scale ${report.body.scaleToGame}`);
console.log(`  gait ${JSON.stringify(gait)}`);
console.log(`  garment mask on ${masked+hairVertices} vertices (${HAIR} merged: ${hairVertices})`);
console.log(`  tracks ${tracksKept} kept, ${tracksCut} cut (${fingers.size} finger bones held at a relaxed pose)`);
