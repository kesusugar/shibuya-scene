import test from 'node:test';
import assert from 'node:assert/strict';
import {createQfrontCafe,paintCafe} from '../src/heroes/cafe.mjs';
import {DayNightSystem} from '../src/environment/day-night.mjs';
import {TimeState} from '../src/app/foundation.mjs';
import {Scene,Group} from 'three';
const hero={footprint:{outer:[[0,0],[12,0],[12,12],[0,12]],holes:[]},primaryFacade:{direction:[0,1]}};
test('cafe uses one finite facade batch and releases owned resources',()=>{
 const cafe=createQfrontCafe(hero);assert.equal(cafe.fronts.length,1);assert.equal(cafe.triangles,2);
 assert.ok([...cafe.mesh.geometry.attributes.position.array].every(Number.isFinite));
 let disposed=0;cafe.mesh.material.map.addEventListener('dispose',()=>disposed++);cafe.dispose();assert.equal(disposed,1);
});
test('shop texture contains branding, shelving and seating rather than a solid light panel',()=>{
 const calls=[],ctx=new Proxy({},{get(t,k){return t[k]??=(...args)=>calls.push([k,...args]);}});
 paintCafe(ctx,2048,1024);assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]==='STARBUCKS COFFEE'));assert.ok(calls.filter(c=>c[0]==='fillRect').length>400);
});
test('cafe illumination follows existing day/night lifecycle',()=>{
 const scene=new Scene(),time=new TimeState(),env=new DayNightSystem(scene,null,time),root=new Group(),cafe=createQfrontCafe(hero);
 root.add(cafe.mesh);scene.add(root);env.enable();env.register(root);assert.equal(cafe.mesh.material.emissiveIntensity,.12);
 time.set('night');assert.equal(cafe.mesh.material.emissiveIntensity,.65);time.set('day');assert.equal(cafe.mesh.material.emissiveIntensity,.12);env.dispose();cafe.dispose();
});
