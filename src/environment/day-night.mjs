import {Group,Color,HemisphereLight,DirectionalLight} from 'three';
export const DAY_NIGHT=Object.freeze({day:{sky:0x9fb5ce,exposure:1,ambient:2,key:2.2},night:{sky:0x070f22,exposure:1.05,ambient:.95,key:.22}});
// One uniform per existing shared material. No geometry, extra pass, or per-frame allocation.
export function installNightEmission(material,mode){
 const original=material.onBeforeCompile,key=material.customProgramCacheKey,uniform={value:0},glow={value:0};
 material.onBeforeCompile=shader=>{original.call(material,shader);shader.uniforms.s12Night=uniform;shader.uniforms.s13Nightglow=glow;
  let vertex='',fragment='uniform float s12Night;\nuniform float s13Nightglow;\n',body='';
  if(mode==='window'||mode==='storefront'||mode==='heroStorefront'){vertex='uniform float s13Nightglow;\nvarying float s12Window;\n';fragment+='varying float s12Window;\n';body=`s12Window=0.0;
#ifdef USE_INSTANCING
float seed=mod(abs(dot(instanceMatrix[3].xyz,vec3(12.9898,78.233,37.719))),7.0);
s12Window=(seed<3.0 ? 0.35+seed*0.1 : 0.0)*(1.0+s13Nightglow*(instanceMatrix[3].x<0.0?0.35:0.12));
if(instanceMatrix[3].y<14.0)s12Window=max(s12Window,0.28);
#endif`;
   if(mode==='heroStorefront')body+='\n#ifdef USE_INSTANCING\nif(instanceMatrix[3].y<14.0&&length(instanceMatrix[3].xz)<95.0)s12Window=max(s12Window,0.62);\n#endif';
   if(mode==='storefront')body=body.replace('seed<3.0 ? 0.35+seed*0.1 : 0.0','0.45+seed*0.075')+'\n#ifdef USE_INSTANCING\nif(instanceMatrix[3].y<3.5)s12Window*=1.25;\n#endif';
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0,0.72,0.39)*s12Window*s12Night;');
  }else if(mode==='groundPool'){
   vertex='varying vec3 s161Position;\n';fragment+='varying vec3 s161Position;\n';body='s161Position=(modelMatrix*vec4(transformed,1.0)).xyz;';
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
vec2 q=s161Position.xz;
float pool=0.24*pow(max(0.0,1.0-length(q)/34.0),2.0);
for(int i=0;i<4;i++){vec2 c=vec2(i<2?-20.0:20.0,mod(float(i),2.0)<0.5?-18.0:18.0);pool+=0.15*pow(max(0.0,1.0-length(q-c)/17.0),2.0);}
totalEmissiveRadiance+=vec3(0.65,0.78,1.0)*pool*s12Night;`);
  }else if(mode==='sign'){vertex='attribute float s13GlowWeight;\nvarying float s13Sign;\n';fragment+='varying float s13Sign;\n';body='s13Sign=s13GlowWeight;';shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0+s13Nightglow*(max(s13Sign,0.8)-1.0);');
  }else if(mode==='train'){vertex='attribute vec3 s12Emission;\nattribute float s12LampEnd;\nattribute vec2 s12Cab;\nvarying vec3 s12Train;\n';fragment+='varying vec3 s12Train;\n';body=`s12Train=s12Emission;
float cab=s12LampEnd< -0.5?s12Cab.x:(s12LampEnd>0.5?s12Cab.y:0.0);
if(abs(cab)>0.5)s12Train=cab>0.0?vec3(1.0,0.86,0.62):vec3(0.75,0.025,0.015);`;
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += s12Train*s12Night*(1.0+0.18*s13Nightglow);');
  }else if(mode==='coloredLamp')shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
  shader.vertexShader=vertex+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+body);shader.fragmentShader=fragment+shader.fragmentShader;
 };
 material.customProgramCacheKey=()=>key.call(material)+':s12-'+mode;material.needsUpdate=true;
 return {uniform,glow,restore(){uniform.value=0;glow.value=0;material.onBeforeCompile=original;material.customProgramCacheKey=key;material.needsUpdate=true;}};
}
export class DayNightSystem{
 constructor(scene,renderer,time){this.scene=scene;this.renderer=renderer;this.time=time;this.roots=new Map();this.active=false;this.nightglow=0;this.savedBackground=scene.background;this.savedExposure=renderer?.toneMappingExposure??1;this.background=new Color();this.root=new Group();this.root.name='s12-environment';this.fill=new HemisphereLight(0xeaf2ff,0x38435b,2);this.key=new DirectionalLight(0xfff6e9,2.2);this.key.position.set(-80,180,90);this.root.add(this.fill,this.key);this.off=time.subscribe(()=>this.apply());}
 setNightglow(value){if(!Number.isFinite(value))throw Error('Invalid nightglow');this.nightglow=Math.max(0,Math.min(1,value));this.apply();}
 enable(){if(this.active)return;this.active=true;this.scene.add(this.root);this.apply();}
 register(root){if(this.roots.has(root))return;const materials=new Map(),lights=[];
  root.traverse(o=>{if(o.isLight)lights.push({light:o,intensity:o.intensity});if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m?.isMeshStandardMaterial)continue;let mode=null,night=null;
   if(/^buildings-(windows|curtainWindows|shopWindows)$/.test(o.name)||/^hero-panels-glass/.test(o.name))mode='window';
   if(/^ground-(asphalt|sidewalk|curb|paint|tactile)$/.test(o.name))mode='groundPool';
   if(/^hero-panels-glass/.test(o.name))mode='heroStorefront';
   if(o.name==='buildings-shopWindows')mode='storefront';
   if(/^train-(JR|Ginza)$/.test(o.name))mode='train';
   if(/^signs-(print|led|heroScreen)$/.test(o.name)){night=1.2;mode='sign';}
   if(/^traffic-.*-front$/.test(o.name))night=1.4;
   if(/^traffic-.*-rear$/.test(o.name)){night=1.1;mode='coloredLamp';}
   if(o.name==='s9-signal-lenses'){night=.85;mode='coloredLamp';}
   if(/^station-detail-.*-glow$/.test(o.name))night=.45;
   const wet=o.name==='ground-asphalt';if(!mode&&night===null&&!wet)continue;if(materials.has(m))continue;
   materials.set(m,{material:m,intensity:m.emissiveIntensity,night,wet,roughness:m.roughness,metalness:m.metalness,vehicle:/^traffic-.*-(front|rear)$/.test(o.name),emission:mode?installNightEmission(m,mode):null});
  }});
  const removed=()=>this.unregister(root);root.addEventListener('removed',removed);this.roots.set(root,{materials,lights,removed});this.apply();
 }
 unregister(root){const r=this.roots.get(root);if(!r)return;root.removeEventListener('removed',r.removed);for(const b of r.materials.values()){b.material.emissiveIntensity=b.intensity;if(b.wet){b.material.roughness=b.roughness;b.material.metalness=b.metalness;}b.emission?.restore();}for(const b of r.lights)b.light.intensity=b.intensity;this.roots.delete(root);this.apply();}
 apply(){const night=this.active&&this.time.isDark(),settings=DAY_NIGHT[this.time.value];let hemis=0,suns=0;
  for(const r of this.roots.values()){for(const b of r.lights){b.light.intensity=night?0:b.intensity;if(b.light.isHemisphereLight)hemis++;if(b.light.isDirectionalLight)suns++;}for(const b of r.materials.values()){b.material.emissiveIntensity=night&&b.night!==null?b.night*(b.vehicle?1+this.nightglow*.15:1):b.intensity;if(b.wet){b.material.roughness=night&&this.nightglow>0?.68-.15*this.nightglow:b.roughness;b.material.metalness=night&&this.nightglow>0?.04+.03*this.nightglow:b.metalness;}if(b.emission){b.emission.uniform.value=night?1:0;b.emission.glow.value=night?this.nightglow:0;}}}
  if(!this.active)return;this.background.setHex(settings.sky);this.scene.background=this.background;if(this.renderer)this.renderer.toneMappingExposure=settings.exposure;
  this.fill.color.setHex(night?0x9ab5e7:0xf0f5ff);this.fill.groundColor.setHex(night?0x25324b:0x73706a);this.fill.intensity=night?settings.ambient:hemis?0:settings.ambient;
  this.key.color.setHex(night?0xa4bcea:0xfff6e9);this.key.intensity=night?settings.key:suns?0:settings.key;
 }
 snapshot(){return {state:this.time.value,dayFactor:this.time.isDark()?0:1,nightFactor:this.time.isDark()?1:0,active:this.active,exposure:this.renderer?.toneMappingExposure??DAY_NIGHT[this.time.value].exposure,ambient:this.fill.intensity,sunMoon:this.key.intensity,registeredRoots:this.roots.size,emissiveMaterials:[...this.roots.values()].reduce((n,r)=>n+r.materials.size,0),pointLights:0,shadowLights:0};}
 disable(){this.active=false;this.root.removeFromParent();this.apply();this.scene.background=this.savedBackground;if(this.renderer)this.renderer.toneMappingExposure=this.savedExposure;}
 dispose(){this.off();this.disable();for(const root of [...this.roots.keys()])this.unregister(root);this.fill.dispose();this.key.dispose();this.root.clear();}
}
