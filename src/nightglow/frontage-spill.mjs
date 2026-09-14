// Reuse mapped facade segments; art-directed pools affect pavement only.
export const FRONTAGE_SPILL_GLSL = `
float frontagePool(vec2 q,vec2 a,vec2 b,float width){
 vec2 edge=b-a;float len=length(edge);vec2 tangent=edge/len;
 float u=dot(q-a,tangent);float d=abs(dot(q-a,vec2(-tangent.y,tangent.x)));
 float along=smoothstep(-1.,1.,u)*(1.-smoothstep(len-1.,len+1.,u));
 float across=1.-smoothstep(.35,width,d);
 float bays=.7+.3*pow(.5+.5*cos(u*2.1),4.);
 return along*across*across*bays;
}
vec3 frontageSpill(vec2 q){
 float warm=frontagePool(q,vec2(-38.55,-23.48),vec2(-66.75,-20.45),5.5);
 warm+=frontagePool(q,vec2(-32.22,-29.27),vec2(-58.88,-55.94),4.5)*.8;
 warm+=frontagePool(q,vec2(-31.29,-44.25),vec2(-37.98,-49.60),4.5)*.65;
 return vec3(.48,.25,.085)*min(warm,1.25);
}`;
