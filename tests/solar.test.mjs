import test from 'node:test';import assert from 'node:assert/strict';
import {Scene,PerspectiveCamera} from 'three';
import {TimeState} from '../src/app/foundation.mjs';import {DayNightSystem} from '../src/environment/day-night.mjs';import {RenderFidelity} from '../src/fidelity/look.mjs';import {SolarCycle,solarSample,SOLAR_PHASES} from '../src/environment/solar.mjs';import {LOOK} from '../src/environment/look-profile.mjs';import {GRADE} from '../src/fidelity/pipeline.mjs';
test('four solar presets interpolate and stop, interrupted transitions remain continuous, QA snaps',()=>{
 const s=new Scene(),t=new TimeState('night'),e=new DayNightSystem(s,null,t),f=new RenderFidelity(s,null,new PerspectiveCamera(),t,e,{tier:'high'});e.enable();const c=new SolarCycle(s,e,f,t);
 c.select('day');c.update(2);const mid=c.state.angle;c.select('dawn');assert.equal(c.state.angle,mid);c.update(5);assert.equal(c.transition,null);const east=e.key.position.x;
 c.select('dusk',false);assert.ok(e.key.position.x*east<0);assert.equal(c.transition,null);assert.equal(t.value,'night');
 c.select('day',false);assert.equal(t.value,'day');assert.equal(c.state.night,0);assert.ok(e.key.position.y>100);
 c.select('night',false);assert.equal(c.material.uniforms.sunVisible.value,0);assert.ok(e.key.position.y>0);
 assert.throws(()=>c.select('invalid'));c.dispose();assert.equal(s.getObjectByName('solar-sky'),undefined);f.dispose();e.dispose();
});
test('solar interpolation is clamped and finite',()=>{for(const t of [-1,0,.5,1,2]){const v=solarSample('dawn','day',t);assert.ok(Number.isFinite(v.angle));assert.ok(v.night>=0&&v.night<=1);}});

test('solar runtime owns final daylight exposure and preserves settled night lighting (classic calibration)',()=>{
 LOOK.mode='classic';
 const scene=new Scene(),renderer={toneMappingExposure:1,shadowMap:{enabled:false,type:null}},time=new TimeState('night');
 const env=new DayNightSystem(scene,renderer,time),look=new RenderFidelity(scene,renderer,new PerspectiveCamera(),time,env,{tier:'high'});
 env.enable();const solar=new SolarCycle(scene,env,look,time);
 solar.select('day',false);for(let i=0;i<60;i++)solar.update(1/60);
 assert.equal(renderer.toneMappingExposure,.74);assert.equal(env.key.intensity,1.65);assert.equal(env.fill.intensity,.30);
 assert.ok(env.fill.color.r>env.fill.color.b,'day fill should not cast a blue wash');
 const dayFill=env.fill.color.clone();solar.select('night',false);solar.update(0);
 assert.equal(renderer.toneMappingExposure,.86);assert.equal(env.key.intensity,.08);assert.equal(env.fill.intensity,.22);
 assert.equal(SOLAR_PHASES.night.sky,0x03060c);
 solar.select('day',false);assert.ok(env.fill.color.equals(dayFill));
 solar.dispose();look.dispose();env.dispose();
 LOOK.mode='gta';
});

// The GTA look (src/environment/look-profile.mjs): a lower, stronger afternoon sun over a lighter
// fill, haze and clouds, and a time-of-day grade the pipeline applies; night lighting as it was.
test('GTA look: lower stronger sun, darker fill, haze, clouds, and a grade per phase; night kept',()=>{
 LOOK.mode='gta';
 const scene=new Scene(),renderer={toneMappingExposure:1,shadowMap:{enabled:false,type:null}},time=new TimeState('night');
 const env=new DayNightSystem(scene,renderer,time),look=new RenderFidelity(scene,renderer,new PerspectiveCamera(),time,env,{tier:'high'});
 env.enable();const solar=new SolarCycle(scene,env,look,time);
 solar.select('day',false);solar.update(1/60);
 assert.ok(solar.state.angle<SOLAR_PHASES.day.angle,'the afternoon sun is not lower');
 assert.ok(env.key.intensity>SOLAR_PHASES.day.key&&env.fill.intensity<SOLAR_PHASES.day.fill);
 assert.ok(scene.fog.density>.0007,'no haze');
 assert.ok(solar.material.uniforms.clouds.value>0,'no clouds');
 assert.ok(GRADE.sat>1&&GRADE.contrast>1&&GRADE.vignette>0);
 assert.ok(GRADE.highlight.x>GRADE.highlight.z&&GRADE.shadow.z>GRADE.shadow.x,'highlights not warm / shadows not cool');
 solar.select('night',false);solar.update(0);
 assert.equal(env.key.intensity,SOLAR_PHASES.night.key);assert.equal(renderer.toneMappingExposure,SOLAR_PHASES.night.exposure);
 // classic gives the neutral grade back.
 LOOK.mode='classic';solar.select('day',false);solar.update(0);
 assert.deepEqual({sat:GRADE.sat,contrast:GRADE.contrast,vignette:GRADE.vignette},{sat:1,contrast:1,vignette:0});
 LOOK.mode='gta';solar.dispose();look.dispose();env.dispose();
});
