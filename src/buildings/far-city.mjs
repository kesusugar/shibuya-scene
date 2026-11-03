// Cityscape C1 (docs/PLAN-CITYSCAPE.md): the city beyond the scene's ±250 m.
//
// The scene ended at its OSM clip, so at night the sky behind QFRONT and MAGNET was black where a
// real view of Shibuya is full of lit towers. This is a ring of plain blocks from 270 m out to about
// 1.4 km, plus the towers a person at the crossing actually sees past the edge (positions from
// their published coordinates, heights from their published figures). One InstancedMesh and one
// material: the windows are drawn by the shader (FAR_CITY_GLSL), not modelled -- floors, bays,
// per-floor and per-window lighting, office cool and home warm, a few floors dark.
//
// Towers further than FAR_CLAMP are drawn at FAR_CLAMP, scaled down by the same ratio, so they keep
// the angle they subtend from the crossing without needing the far plane or the fog pushed back.
import {InstancedMesh,BoxGeometry,MeshStandardMaterial,Object3D,InstancedBufferAttribute,Color} from 'three';
import {seededRandom} from '../geo/core.mjs';

export const FAR_CITY=Object.freeze({inner:270,outer:1400,count:1000,clamp:1250,limit:255,seed:'far-city'});

const LAT0=35.6595,LON0=139.7005,M_LAT=110950,M_LON=111320*Math.cos(LAT0*Math.PI/180);
const at=(lat,lon)=>[(lon-LON0)*M_LON,-(lat-LAT0)*M_LAT];
/**
 * Towers outside the scene that the crossing sees. [name, lat, lon, height m, footprint w, d, style].
 * Heights are the published ones, rounded; footprints are approximate.
 */
export const FAR_LANDMARKS=Object.freeze([
 ['Shibuya Hikarie',35.6590,139.7037,183,48,40,'office'],
 ['Cerulean Tower',35.6563,139.6995,184,42,30,'hotel'],
 ['Shibuya Sakura Stage',35.6557,139.7008,179,50,40,'office'],
 ['Shibuya Infoss Tower',35.6567,139.6985,93,30,26,'office'],
 ['NTT Docomo Yoyogi',35.6830,139.7020,240,46,46,'spire'],
 ['Shinjuku Park Tower',35.6855,139.6907,235,60,60,'office'],
 ['Tokyo Metropolitan Government',35.6896,139.6921,243,70,40,'office'],
 ['Shinjuku Mitsui',35.6920,139.6955,225,55,55,'office'],
 ['Shinjuku Sumitomo',35.6918,139.6947,210,55,55,'office'],
 ['Mode Gakuen Cocoon',35.6916,139.6969,204,40,40,'office'],
 ['Roppongi Hills Mori',35.6604,139.7292,238,70,60,'office'],
 ['Ebisu Garden Place',35.6421,139.7135,167,45,45,'office']
]);

/** The blocks, deterministic: {x, z, w, d, h, yaw, style}. Pure; tested without three. */
export function farCityLayout({inner=FAR_CITY.inner,outer=FAR_CITY.outer,count=FAR_CITY.count,clamp=FAR_CITY.clamp,seed=FAR_CITY.seed}={}){
 const rng=seededRandom(seed),out=[];
 for(let i=0;i<count;i++){
  // Denser near the edge, as a city is round its centre; a few gaps (parks, rail) left by chance.
  const r=inner+(outer-inner)*Math.pow(rng(),1.6),a=rng()*Math.PI*2;
  const x=Math.cos(a)*r,z=Math.sin(a)*r;
  // Yoyogi Park and Meiji Jingu, north-west: open ground, no blocks.
  if(x<-150&&x>-1300&&z<-450&&z>-1600)continue;
  // Mid-rise is the rule round Shibuya; one in twelve is a tower.
  const tall=rng()<.085,h=tall?60+rng()*90:Math.max(9,Math.exp(2.9+rng()*.9)+rng()*8);
  const w=14+rng()*(tall?26:30),d=12+rng()*(tall?24:26);
  // The scene's own OSM buildings fill its ±250 m square: nothing of the far city stands in it.
  if(Math.max(Math.abs(x),Math.abs(z))-Math.hypot(w,d)/2<FAR_CITY.limit)continue;
  out.push({x,z,w,d,h,yaw:Math.round(rng()*4)*Math.PI/2+(rng()-.5)*.5,style:rng()<.35?'office':'mixed'});
 }
 for(const [name,lat,lon,h,w,d,style] of FAR_LANDMARKS){
  let [x,z]=at(lat,lon);const dist=Math.hypot(x,z),k=dist>clamp?clamp/dist:1;
  x*=k;z*=k;out.push({x,z,w:w*k,d:d*k,h:h*k,yaw:0,style,name});
  if(style==='spire')out.push({x,z,w:w*k*.35,d:d*k*.35,h:h*k*1.12,yaw:Math.PI/4,style:'office',name:name+' spire'});
 }
 return out;
}

/**
 * The window shader, for MeshStandardMaterial via installNightEmission (mode 'farCity').
 * Inputs from the vertex stage: vFarLocal (metres in the block's own frame, origin at its base
 * centre), vFarSize (w, h, d), vFarSeed. Uniform s12Night (0 day, 1 night).
 */
export const FAR_CITY_VERTEX=`attribute float farSeed;
attribute float farStyle;
varying vec3 vFarLocal;
varying vec3 vFarSize;
varying float vFarSeed;
varying float vFarStyle;
varying vec3 vFarNormal;`;
export const FAR_CITY_VERTEX_BODY=`
#ifdef USE_INSTANCING
vFarSize=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
#else
vFarSize=vec3(1.0);
#endif
vFarLocal=position*vFarSize+vec3(0.0,0.5*vFarSize.y,0.0);
vFarNormal=normal;vFarSeed=farSeed;vFarStyle=farStyle;`;
export const FAR_CITY_GLSL=`varying vec3 vFarLocal;
varying vec3 vFarSize;
varying float vFarSeed;
varying float vFarStyle;
varying vec3 vFarNormal;
float farHash(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
// x: glass (0 wall, 1 window), y: lit, z: tint index 0..1
vec3 farWindow(){
 vec3 n=abs(vFarNormal);
 if(n.y>.5)return vec3(0.0);
 // Along the face, from its left edge; the face id keeps the four sides different.
 float u=n.x>.5?vFarLocal.z+.5*vFarSize.z:vFarLocal.x+.5*vFarSize.x;
 float face=n.x>.5?(vFarNormal.x>0.0?1.0:2.0):(vFarNormal.z>0.0?3.0:4.0);
 float storey=vFarStyle>1.5?3.9:(vFarStyle>.5?3.6:3.1);
 float pitch=vFarStyle>1.5?1.8:(vFarStyle>.5?2.2:2.8);
 float y=vFarLocal.y;
 if(y<4.0||y>vFarSize.y-2.0)return vec3(0.0);
 float floorN=floor(y/storey),col=floor(u/pitch);
 vec2 f=vec2(fract(u/pitch),fract(y/storey));
 float glassW=vFarStyle>1.5?.9:(vFarStyle>.5?.78:.55),glassH=vFarStyle>1.5?.78:.6;
 float glass=step(abs(f.x-.5),glassW*.5)*step(abs(f.y-.48),glassH*.5);
 // Lighting by floor (an office floor is lit or not) and then by window.
 float floorLit=farHash(vec3(vFarSeed,floorN,face*7.0));
 float win=farHash(vec3(vFarSeed*1.7+col,floorN,face));
 float share=vFarStyle>1.5?mix(.15,.85,step(.45,floorLit)):mix(.12,.55,floorLit);
 float lit=step(win,share);
 return vec3(glass,lit,farHash(vec3(col,floorN*3.1,vFarSeed)));
}`;
export const FAR_CITY_FRAGMENT=`
vec3 farW=farWindow();
// Day: dark glass in a pale wall; night: the wall goes dark and the lit windows glow.
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.2,.25),farW.x*.85);
diffuseColor.rgb*=mix(1.0,.28,s12Night);
vec3 farTint=farW.z<.55?vec3(1.0,.78,.48):(farW.z<.85?vec3(.86,.93,1.0):vec3(1.0,.93,.8));
float farLevel=.55+.9*fract(farW.z*7.13);
totalEmissiveRadiance+=farTint*farW.x*farW.y*farLevel*s12Night*1.6;
// Aviation lights: the roof corners of the tall ones, slow red.
float farRoof=step(vFarSize.y-1.2,vFarLocal.y)*step(60.0,vFarSize.y)*step(.92,max(abs(vFarLocal.x)/(.5*vFarSize.x),abs(vFarLocal.z)/(.5*vFarSize.z)));
totalEmissiveRadiance+=vec3(1.0,.06,.02)*farRoof*s12Night*6.0;`;

/** Build the instanced blocks. `tier`: LOW draws only the landmarks. */
export function buildFarCity({tier='high'}={}){
 const layout=farCityLayout().filter(b=>tier!=='low'||b.name);
 const geometry=new BoxGeometry(1,1,1);
 const material=new MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:.05,envMapIntensity:.4});
 const mesh=new InstancedMesh(geometry,material,layout.length);mesh.name='buildings-far';
 const seeds=new Float32Array(layout.length),styles=new Float32Array(layout.length),o=new Object3D(),c=new Color();
 const walls=[0xb9b6ae,0xa7aaa8,0xc4bfb3,0x9fa6ab,0xb0a99d];
 layout.forEach((b,i)=>{o.position.set(b.x,b.h/2,b.z);o.rotation.set(0,b.yaw,0);o.scale.set(b.w,b.h,b.d);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
  seeds[i]=(i*37.31)%97;styles[i]=b.style==='office'||b.style==='spire'?2:b.style==='hotel'?1:0;
  c.setHex(walls[i%walls.length]);if(styles[i]===2)c.lerp(new Color(0x7f93a3),.45);mesh.setColorAt(i,c);});
 geometry.setAttribute('farSeed',new InstancedBufferAttribute(seeds,1));
 geometry.setAttribute('farStyle',new InstancedBufferAttribute(styles,1));
 mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 // Never culled as a whole (the bounding sphere is the whole ring), never a shadow caster.
 mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
 return {mesh,count:layout.length,triangles:12*layout.length,dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();mesh.dispose?.();}};
}
