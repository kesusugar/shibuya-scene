// Crowd performance: a fourth, far level of detail (L3) for the HQ crowd, made from each archetype's
// L2 by mesh simplification (meshoptimizer, shipped with three). Only a new index list: L3 draws
// L2's own vertices -- the same skinning, garment colours and per-citizen palette -- with about a
// quarter of its triangles, for people far enough away to be a few dozen pixels tall.
//
//   node scripts/bake-crowd-l3.mjs        -> public/data/crowd/hq-crowd-l3.json
import {readFileSync,writeFileSync} from 'node:fs';
import {MeshoptSimplifier} from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

export const L3_RATIO=.25, L3_ERROR=.08;
const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
await MeshoptSimplifier.ready;

const out={source:'L2',ratio:L3_RATIO,error:L3_ERROR,generated:'scripts/bake-crowd-l3.mjs',archetypes:[]};
for(const a of manifest.archetypes){
 const l2=a.levels.find(l=>l.name==='L2');
 const pos=new Float32Array(bin,l2.position.byteOffset,l2.position.count);
 const index=new Uint32Array(new Uint16Array(bin,l2.index.byteOffset,l2.index.count));
 // The garment colours count too, so a sleeve's edge or a collar is not smeared into the shirt.
 const col=new Uint8Array(bin,l2.color.byteOffset,l2.color.count),n=pos.length/3,attrs=new Float32Array(n*3);
 for(let v=0;v<n;v++)for(let k=0;k<3;k++)attrs[v*3+k]=col[v*4+k]/255;
 const target=Math.floor(index.length*L3_RATIO/3)*3;
 const [simplified,error]=MeshoptSimplifier.simplifyWithAttributes(index,pos,3,attrs,3,[.5,.5,.5],null,target,L3_ERROR,[]);
 const u16=new Uint16Array(simplified);
 out.archetypes.push({id:a.id,triangles:u16.length/3,from:l2.triangles,error:+error.toFixed(4),
  index:Buffer.from(u16.buffer,u16.byteOffset,u16.byteLength).toString('base64')});
 console.log(a.id,l2.triangles,'->',u16.length/3,'triangles, error',error.toFixed(4));
}
writeFileSync('public/data/crowd/hq-crowd-l3.json',JSON.stringify(out)+'\n');
