// Cityscape (docs/PLAN-CITYSCAPE.md): the far city, QFRONT's deep glass and its Blender detail.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial,ShaderLib,Box3} from 'three';
import {farCityLayout,FAR_CITY,FAR_LANDMARKS,buildFarCity} from '../src/buildings/far-city.mjs';
import {installNightEmission} from '../src/environment/day-night.mjs';
import {QFRONT_MODE} from '../src/heroes/qfront-mode.mjs';
import {dressQfrontAsset} from '../src/heroes/qfront-asset.mjs';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

test('far city: deterministic, outside the scene, inside the far plane, landmarks included',()=>{
 const a=farCityLayout(),b=farCityLayout();
 assert.deepEqual(a,b);
 assert.ok(a.length>700,`${a.length} blocks`);
 for(const blk of a){const r=Math.hypot(blk.x,blk.z);
  assert.ok(r>=FAR_CITY.inner-1||blk.name,`a block inside the scene at ${r.toFixed(0)} m`);
  assert.ok(r<=Math.max(FAR_CITY.outer,FAR_CITY.clamp)+1,`a block past the far city at ${r.toFixed(0)} m`);
  assert.ok(blk.h>0&&blk.w>0&&blk.d>0);}
 for(const [name] of FAR_LANDMARKS)assert.ok(a.some(blk=>blk.name===name),`no ${name}`);
 // Nothing inside the scene's own ±250 m square (it has its own buildings there).
 assert.ok(a.every(blk=>Math.max(Math.abs(blk.x),Math.abs(blk.z))-Math.hypot(blk.w,blk.d)/2>=250),'a far block inside the scene');
});
test('far city: one draw call, no shadows, its windows in the night shader',()=>{
 const far=buildFarCity({tier:'high'});
 assert.equal(far.mesh.isInstancedMesh,true);assert.equal(far.mesh.castShadow,false);
 assert.ok(far.mesh.geometry.attributes.farSeed&&far.mesh.geometry.attributes.farStyle);
 const low=buildFarCity({tier:'low'});assert.equal(low.count,FAR_LANDMARKS.length+FAR_LANDMARKS.filter(l=>l[6]==='spire').length);
 const material=new MeshStandardMaterial(),hook=installNightEmission(material,'farCity');
 const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);
 assert.ok(shader.vertexShader.includes('vFarLocal')&&shader.fragmentShader.includes('farWindow()'));
 hook.restore();far.dispose();low.dispose();material.dispose();
});
test('QFRONT deep glass: opaque by default, rooms in the shader; ?qfront=classic keeps the old one',()=>{
 assert.equal(QFRONT_MODE.current,'deep');
 const material=new MeshStandardMaterial(),hook=installNightEmission(material,'deepGlass');
 const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);
 assert.ok(shader.fragmentShader.includes('deepRoom(cameraPosition)'));
 assert.ok(shader.vertexShader.includes('vDeepWorld'));
 hook.restore();material.dispose();
});
test('QFRONT asset: four meshes on QFRONT\'s own footprint, lettering facing the crossing',async()=>{
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const b=readFileSync('public/data/heroes/qfront.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',res,rej));
 const asset=dressQfrontAsset(gltf.scene);
 assert.equal(asset.meshes,4);assert.ok(asset.triangles<20000,`${asset.triangles} triangles`);
 gltf.scene.updateMatrixWorld(true);
 const box=new Box3().setFromObject(gltf.scene);
 // QFRONT's footprint: X -30.2..5.1, Z -56.5..-29.0, 45.9 m with its crown; detail stands proud by under 3 m.
 assert.ok(box.min.x>-33&&box.max.x<8&&box.min.z>-59&&box.max.z<-25,`bounds ${box.min.toArray()} ${box.max.toArray()}`);
 assert.ok(box.min.y>7&&box.max.y<52,`heights ${box.min.y}..${box.max.y}`);
 const names=[];gltf.scene.traverse(o=>{if(o.isMesh)names.push(o.name);});
 assert.deepEqual(names.sort(),['qfront-asset-crown','qfront-asset-frame','qfront-asset-light','qfront-asset-logo']);
 const logo=gltf.scene.getObjectByName('qfront-asset-logo');logo.geometry.computeBoundingBox();
 const c=new Box3().setFromObject(logo).getCenter(new (box.min.constructor)());
 // In front of the curved south face, on the upper storeys.
 assert.ok(c.z>-32&&c.y>38&&c.y<43,`logo at ${c.toArray()}`);
 asset.dispose();
});

import {CITY_BRANDS,definitions} from '../src/signs/atlas.mjs';
import {REFERENCE_ART} from '../src/signs/reference-art.mjs';
import {PANELS} from '../src/signs/reference-ads.mjs';
test('signs: the shop atlas carries real Shibuya chains, vertical ones in the blade slots',()=>{
 assert.equal(CITY_BRANDS.length,32);
 const defs=definitions(32);
 for(const d of defs){
  if(['blade','directory'].includes(d.category))assert.ok(d.vertical&&[...d.vertical].length<=6,`${d.text} needs a vertical name`);
  else assert.equal(d.vertical,null);
 }
 for(const name of ['マツモトキヨシ','TOWER RECORDS','UNIQLO','LAWSON','ドン・キホーテ','FamilyMart','セブン-イレブン'])assert.ok(defs.some(d=>d.text===name),name);
});
test('signs: MAGNET carries the finance column beside its vision, each with its own artwork',()=>{
 for(const id of [204,205,206]){assert.ok(PANELS.some(p=>p.id===id&&p.hero==='magnet'));assert.equal(typeof REFERENCE_ART[id],'function');}
 const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json','utf8'));
 const signs=pack.signs.high.signs??pack.signs.high;
 const column=(Array.isArray(signs)?signs:[]).filter(s=>[204,205,206].includes(s.brandArt));
 assert.equal(column.length,3,'the baked pack is missing the finance column');
 const ys=column.map(s=>s.position[1]).sort((a,b)=>a-b);assert.ok(ys[1]-ys[0]>3&&ys[2]-ys[1]>3,'stacked');
});
import {commercialLayout} from '../src/signs/commercial-layout.mjs';
test('signs: a hero\'s own panels are not re-gridded into copies of the first one',()=>{
 const edge={index:0,tangent:[1,0]};
 const panel=(id,art,y)=>({id,hostKey:'magnet:mass:1',buildingId:'way/1',edge,heading:0,along:5,width:2.5,height:3.5,position:[5,y,0],category:'billboard',brandArt:art});
 const out=commercialLayout([panel('a',201,20),panel('b',204,10),panel('c',205,14),panel('d',206,18)]);
 assert.deepEqual(out.map(s=>s.brandArt).sort(),[201,204,205,206]);
 assert.ok(out.every(s=>!String(s.id).includes(':commercial:')));
});
