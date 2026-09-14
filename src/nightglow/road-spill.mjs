// Art-directed billboard spill, not screen-space or ray-traced reflection.
// Shared asphalt shader only: no extra draw calls, textures or lights.
export const ROAD_SPILL_GLSL = `
float roadStreak(vec2 q, vec2 origin, vec2 axis, float width, float reach) {
 vec2 delta=q-origin;
 float along=dot(delta,axis), across=dot(delta,vec2(-axis.y,axis.x));
 float endFade=smoothstep(0.0,2.0,along)*(1.0-smoothstep(reach*.55,reach,along));
 float sideFade=exp(-across*across/(width*width));
 float grain=.65+.2*sin(q.x*9.7+q.y*5.1)+.15*sin(q.y*21.0-q.x*3.0);
 return endFade*sideFade*grain;
}
vec3 billboardRoadSpill(vec2 q) {
 vec3 light=vec3(0.0);
 light+=vec3(.12,.26,.68)*roadStreak(q,vec2(-9.,-23.),vec2(0.,1.),3.8,33.);
 light+=vec3(.62,.055,.025)*roadStreak(q,vec2(-21.,-20.),normalize(vec2(.35,1.)),2.8,28.);
 light+=vec3(.48,.28,.09)*roadStreak(q,vec2(22.,-14.),normalize(vec2(-1.,.3)),3.4,24.);
 light+=vec3(.44,.23,.065)*roadStreak(q,vec2(-23.,11.),normalize(vec2(1.,-.25)),2.5,18.);
 return light;
}`;
