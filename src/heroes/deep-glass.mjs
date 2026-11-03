// Cityscape C2 (docs/PLAN-CITYSCAPE.md): glass you can see into, without transparency.
//
// QFRONT's glass was 38% transparent over six floors of box "rooms": a sorted transparent pass,
// overdraw, and at night brown boxes behind a grey film. This is one opaque material that draws
// the rooms behind the glass by interior mapping (van Dongen, 2008): per fragment, a ray from the
// eye into a box room the size of a bay and a storey, and the colour of the ceiling, floor or wall
// it hits. Rooms are lit or dark, warm or cool, some with blinds part-way down, all a pure function
// of the room's cell. Reflection is the material's own (environment, roughness low).
//
// Works on any flat vertical face: the facade frame comes from the face's world normal.
// Uniforms (via installNightEmission, mode 'deepGlass'): s12Night 0..1.
export const DEEP_GLASS=Object.freeze({bay:3.2,storey:5.4,depth:4.2,floorY:8.35});

export const DEEP_GLASS_VERTEX=`varying vec3 vDeepWorld;
varying vec3 vDeepNormal;`;
export const DEEP_GLASS_VERTEX_BODY=`
vec4 deepWorld=modelMatrix*vec4(transformed,1.0);
#ifdef USE_INSTANCING
deepWorld=modelMatrix*instanceMatrix*vec4(transformed,1.0);
#endif
vDeepWorld=deepWorld.xyz;vDeepNormal=normalize(mat3(modelMatrix)*objectNormal);`;
export const DEEP_GLASS_GLSL=`varying vec3 vDeepWorld;
varying vec3 vDeepNormal;
float deepHash(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
// rgb: the room's colour as seen; a: how much of it is lit interior (for the night emission)
vec4 deepRoom(vec3 eye){
 const float W=${DEEP_GLASS.bay.toFixed(2)},H=${DEEP_GLASS.storey.toFixed(2)},D=${DEEP_GLASS.depth.toFixed(2)},Y0=${DEEP_GLASS.floorY.toFixed(2)};
 vec3 n=normalize(vec3(vDeepNormal.x,0.0,vDeepNormal.z));
 vec3 t=normalize(cross(vec3(0.0,1.0,0.0),n));
 float u=dot(vDeepWorld.xz,t.xz),v=vDeepWorld.y-Y0;
 vec3 d=normalize(vDeepWorld-eye);
 vec3 r=vec3(dot(d,t),d.y,-dot(d,n));          // into the room: r.z > 0
 if(r.z<=.001)return vec4(0.0);
 vec2 cell=floor(vec2(u/W,v/H));
 vec3 p=vec3(fract(u/W)*W,fract(v/H)*H,0.0);
 float tx=r.x>0.0?(W-p.x)/r.x:-p.x/min(r.x,-1e-4);
 float ty=r.y>0.0?(H-p.y)/r.y:-p.y/min(r.y,-1e-4);
 float tz=D/r.z;
 float tHit=min(tz,min(tx,ty));
 vec3 h=p+r*tHit;
 float id=deepHash(vec3(cell,floor(dot(vDeepWorld.xz,n.xz)*.5)));
 float id2=deepHash(vec3(cell.yx*1.7,id*13.0));
 float lit=step(.45,id);
 vec3 wall=mix(vec3(.5,.45,.4),vec3(.4,.45,.5),step(.6,id2))*mix(.35,1.0,lit);
 vec3 col;
 if(tHit==tz){
  // Back wall: a darker band of furniture and partitions, the odd lit monitor.
  col=wall*.85;
  col*=mix(.45,1.0,step(1.3,h.y));
  float screen=step(abs(h.x-W*(.3+.4*id2)),.35)*step(abs(h.y-1.15),.22)*step(.5,id2);
  col=mix(col,vec3(.55,.75,1.0)*1.6,screen);
 }else if(tHit==ty){
  if(r.y>0.0){
   // Ceiling: rows of light panels.
   float panel=step(.62,fract(h.z*.9+.2))*step(.25,fract(h.x/W*2.0));
   col=mix(vec3(.55),vec3(1.6,1.52,1.38),panel*lit);
  }else{
   col=mix(vec3(.24,.23,.22),vec3(.34,.3,.26),id2)*mix(.7,1.0,step(.5,fract(h.x*1.3+h.z*.7)));
  }
 }else{
  col=wall*.7;
 }
 // Deeper is darker; a lit room's light falls off towards the back.
 col*=mix(1.0,.55,clamp(tHit/(D*1.6),0.0,1.0));
 // Blinds part-way down some rooms, seen at the glass.
 float blindTo=H*(1.0-.6*fract(id2*7.3));
 if(step(.55,fract(id*5.7))>.5&&p.y>blindTo){col=vec3(.72,.7,.66)*mix(.55,1.0,step(.5,fract(p.y*6.0)));}
 // Spandrel: the slab edge is opaque; nothing seen through it.
 if(p.y<.75)return vec4(vec3(.12,.13,.14),0.0);
 // Warm or cool light for the lit rooms.
 vec3 tint=id2<.65?vec3(1.0,.86,.66):vec3(.85,.93,1.0);
 return vec4(col*tint,lit);
}`;
export const DEEP_GLASS_FRAGMENT=`
vec4 deep=deepRoom(cameraPosition);
float deepFacing=clamp(abs(dot(normalize(vDeepWorld-cameraPosition),vDeepNormal)),0.0,1.0);
float deepSeen=mix(.25,.85,deepFacing);   // more reflection at grazing angles
// Day: the rooms are dim behind tinted glass. Night: lit rooms glow, dark ones stay dark.
diffuseColor.rgb=mix(diffuseColor.rgb,deep.rgb*.42,deepSeen*(1.0-s12Night));
diffuseColor.rgb*=mix(1.0,.35,s12Night);
totalEmissiveRadiance+=deep.rgb*deep.a*deepSeen*s12Night*1.35;`;
