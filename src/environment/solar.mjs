import {Color,Vector3,Mesh,SphereGeometry,ShaderMaterial,BackSide} from 'three';
import {phasesFor} from './look-profile.mjs';
import {GRADE} from '../fidelity/pipeline.mjs';

export const SOLAR_PHASES=Object.freeze({
 dawn:{angle:.10,night:.45,sky:0x947d99,horizon:0xffc594,sun:0xffbf80,key:1.0,fill:.30,exposure:.78},
 day:{angle:1.12,night:0,sky:0x80acd1,horizon:0xc9d0d5,sun:0xfff3e2,key:1.65,fill:.30,exposure:.74},
 dusk:{angle:3.00,night:.55,sky:0x635c8b,horizon:0xffa46b,sun:0xff985a,key:.85,fill:.24,exposure:.80},
 night:{angle:3.55,night:1,sky:0x03060c,horizon:0x101727,sun:0xacc5ec,key:.08,fill:.22,exposure:.86}
});
export function solarSample(from,to,t){const P=phasesFor(SOLAR_PHASES),a=P[from],b=P[to],s=Math.max(0,Math.min(1,t));return blend(a,b,s*s*(3-2*s));}
const WHITE=new Color(0xffffff),DAY_FILL=new Color(0xfff6e9);
const lerpArr=(x,y,t)=>x.map((v,i)=>v+(y[i]-v)*t);
function blend(a,b,t){const out={};for(const k of ['angle','night','key','fill','exposure','fog','clouds'])out[k]=(a[k]??0)+((b[k]??0)-(a[k]??0))*t;out.env=(a.env??1)+((b.env??1)-(a.env??1))*t;for(const k of ['sky','horizon','sun'])out[k]=new Color(a[k]).lerp(new Color(b[k]),t);
 const ga=a.grade,gb=b.grade;if(ga&&gb)out.grade={sat:ga.sat+(gb.sat-ga.sat)*t,contrast:ga.contrast+(gb.contrast-ga.contrast)*t,vignette:ga.vignette+(gb.vignette-ga.vignette)*t,wb:lerpArr(ga.wb,gb.wb,t),shadow:lerpArr(ga.shadow,gb.shadow,t),highlight:lerpArr(ga.highlight,gb.highlight,t)};return out;}
// The sky: a gradient, the sun, and (GTA look) a layer of drifting cumulus -- value-noise fbm on a
// plane above the city, lit from the sun's side, thinning towards the horizon.
const SKY_FRAGMENT=`varying vec3 ray;uniform vec3 top,horizon,sunColor,direction;uniform float sunVisible,clouds,cloudTime,night;
float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1,0)),f.x),mix(h1(i+vec2(0,1)),h1(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int k=0;k<5;k++){v+=a*vn(p);p=p*2.03+vec2(17.1,9.3);a*=.5;}return v;}
void main(){vec3 r=normalize(ray);float h=pow(max(r.y,0.),.45);vec3 c=mix(horizon,top,h);float d=dot(r,direction);
 float disc=smoothstep(.9993,.99965,d);float glow=pow(max(d,0.),180.)*.4+pow(max(d,0.),8.)*.12*sunVisible;
 if(clouds>0.&&r.y>0.){vec2 uv=r.xz/(r.y+.12)*1.6+vec2(cloudTime*.004,cloudTime*.0015);
  float n=fbm(uv),cover=smoothstep(1.-clouds*.9,1.25-clouds*.7,n)*smoothstep(.0,.18,r.y);
  float lit=.55+.45*clamp(dot(normalize(vec3(r.x,0.,r.z)),normalize(vec3(direction.x,0.,direction.z))),0.,1.);
  vec3 cc=mix(horizon*1.05,vec3(1.)*mix(1.,.06,night),.55)*mix(.75,1.15,lit)+sunColor*.25*lit*sunVisible;
  c=mix(c,cc,cover*.85);disc*=1.-cover;}
 gl_FragColor=vec4(c+sunColor*(disc*3.+glow)*sunVisible,1.);}`;
export class SolarCycle{
 constructor(scene,environment,fidelity,clock){Object.assign(this,{scene,environment,fidelity,clock});this.phase=clock.value;const P=phasesFor(SOLAR_PHASES);this.state=blend(P[this.phase],P[this.phase],0);this.transition=null;this.cloudTime=0;
  this.material=new ShaderMaterial({side:BackSide,depthWrite:false,toneMapped:true,uniforms:{top:{value:new Color()},horizon:{value:new Color()},sunColor:{value:new Color()},direction:{value:new Vector3()},sunVisible:{value:0},clouds:{value:0},cloudTime:{value:0},night:{value:0}},vertexShader:'varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:SKY_FRAGMENT});
  this.sky=new Mesh(new SphereGeometry(900,24,12),this.material);this.sky.name='solar-sky';this.sky.frustumCulled=false;this.sky.renderOrder=-100;this.sky.userData.noAO=true;scene.add(this.sky);
 }
 select(phase,animate=true){if(!SOLAR_PHASES[phase])throw Error('Invalid solar phase');this.phase=phase;this.clock.set(phase==='night'||phase==='dusk'?'night':'day');const P=phasesFor(SOLAR_PHASES),target=blend(P[phase],P[phase],0);this.transition=animate?{from:this.state,to:target,elapsed:0}:null;if(!animate)this.state=target;this.update(0);}
 update(dt){if(this.transition){const tr=this.transition;tr.elapsed+=Math.max(0,dt);const t=Math.min(1,tr.elapsed/5),s=t*t*(3-2*t);this.state=blend(tr.from,tr.to,s);if(t===1)this.transition=null;}
  const e=this.environment,f=this.fidelity,s=this.state;if(!e.active){this.sky.visible=false;return;}this.sky.visible=true;
  const direction=this.material.uniforms.direction.value.set(-Math.cos(s.angle),Math.sin(s.angle),.25).normalize();
  e.key.position.copy(direction).multiplyScalar(220);if(direction.y<0)e.key.position.y=80;e.key.color.copy(s.sun);e.key.intensity=s.key;e.fill.intensity=s.fill;e.fill.color.copy(s.sky).lerp(WHITE,.65).lerp(DAY_FILL,(1-s.night)*.7);
  if(e.renderer)e.renderer.toneMappingExposure=s.exposure;
  this.material.uniforms.top.value.copy(s.sky);this.material.uniforms.horizon.value.copy(s.horizon);this.material.uniforms.sunColor.value.copy(s.sun);this.material.uniforms.sunVisible.value=Math.max(0,Math.min(1,direction.y*15));
  // The look's share of the sky's image-based light (the blue in the shadows), on top of whatever the fidelity look set.
  if(this.scene.environment){const now=this.scene.environmentIntensity;if(now!==this.envWritten)this.envBase=now;this.envWritten=this.scene.environmentIntensity=this.envBase*s.env;}
  if(this.scene.fog){this.scene.fog.color.copy(s.horizon);if(this.scene.fog.isFogExp2)this.scene.fog.density=s.fog;}
  this.cloudTime+=Math.max(0,dt);this.material.uniforms.clouds.value=s.clouds;this.material.uniforms.cloudTime.value=this.cloudTime;this.material.uniforms.night.value=s.night;
  // The time-of-day grade, read by the HIGH pipeline's grade pass.
  if(s.grade){GRADE.wb.fromArray(s.grade.wb);GRADE.sat=s.grade.sat;GRADE.contrast=s.grade.contrast;GRADE.vignette=s.grade.vignette;GRADE.shadow.fromArray(s.grade.shadow);GRADE.highlight.fromArray(s.grade.highlight);}
  for(const r of e.roots.values())for(const b of r.materials.values()){if(b.emission){b.emission.uniform.value=s.night;b.emission.glow.value=e.nightglow*s.night;}if(b.night!==null)b.material.emissiveIntensity=b.intensity+(b.night-b.intensity)*s.night;}
  for(const l of [...f.lights,...f.spots])l.intensity=l.visible?l.userData.nightIntensity*s.night:0;
 }
 dispose(){this.sky.removeFromParent();this.sky.geometry.dispose();this.material.dispose();}
}
