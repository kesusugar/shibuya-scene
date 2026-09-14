import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,Mesh,PlaneGeometry,MeshStandardMaterial,ShaderLib} from 'three';
import {DayNightSystem} from '../src/environment/day-night.mjs';
import {TimeState} from '../src/app/foundation.mjs';
import {ROAD_WET_RESPONSE} from '../src/nightglow/road-spill.mjs';
test('wet response preserves visible distant color without removing wet/dry contrast',()=>{
 const r=ROAD_WET_RESPONSE;
 assert.ok(r.dryFloor>0&&r.dryFloor<r.wetPeak);
 assert.ok(r.distantRipple>=r.rippleFloor&&r.distantRipple<=r.rippleFloor+r.rippleRange);
 const average=(r.dryFloor+r.wetPeak)*.5*r.distantRipple;
 assert.ok(average>.5&&average<1,'distant color must survive attenuation without a uniform boost above source');
 assert.ok(r.wetPeak*(r.rippleFloor+r.rippleRange)<2);
});
test('billboard spill affects only asphalt, follows day/night, and restores on removal',()=>{
 const scene=new Scene(),time=new TimeState(),env=new DayNightSystem(scene,null,time),root=new Group();
 const objects=['ground-asphalt','ground-paint','ground-sidewalk'].map(name=>{const mesh=new Mesh(new PlaneGeometry(),new MeshStandardMaterial());mesh.name=name;root.add(mesh);return mesh;});
 scene.add(root);env.enable();env.register(root);
 for(const mesh of objects){const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};mesh.material.onBeforeCompile(shader);
 assert.equal(shader.fragmentShader.includes('vec3 billboardRoadSpill'),mesh.name==='ground-asphalt');
 assert.equal(shader.fragmentShader.includes('float roadNoise'),mesh.name==='ground-asphalt');
 assert.equal(shader.fragmentShader.includes('float roadWetMask'),mesh.name==='ground-asphalt');
 if(mesh.name==='ground-asphalt')assert.ok(shader.fragmentShader.includes('s12Night*s13Nightglow'));
 assert.equal(shader.fragmentShader.includes('fwidth(q*5.5)'),mesh.name==='ground-asphalt');
 assert.equal(shader.fragmentShader.includes('vec3 frontageSpill'),mesh.name==='ground-sidewalk');
 assert.equal(shader.uniforms.s12Night.value,0);time.set('night');assert.equal(shader.uniforms.s12Night.value,1);time.set('day');assert.equal(shader.uniforms.s12Night.value,0);}
 assert.equal(env.snapshot().pointLights,0);env.unregister(root);assert.equal(env.roots.size,0);
 objects.forEach(o=>{o.geometry.dispose();o.material.dispose();});env.dispose();
});
