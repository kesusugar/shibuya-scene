// Katana D: the blade's trail -- a thin white crescent behind the outer part of the blade while a
// cut is live, gone a fraction of a second later.
//
// A ribbon between two points on the blade (`from` and `to` along it, `to` the tip), one pair per
// sample, in world space. Each sample fades with its age (`life` s) and across the ribbon toward
// the inner edge, and the whole trail narrows toward its oldest end, which is what reads as a
// crescent rather than a sheet. Additive, no depth write, one draw call; the geometry is fixed in
// size (`samples` pairs) and rewritten in place.
import {AdditiveBlending,BufferAttribute,BufferGeometry,DoubleSide,Mesh,ShaderMaterial,Vector3} from 'three';

export const TRAIL=Object.freeze({samples:18,life:.14,from:.8,to:1,color:[.92,.96,1],alpha:.65});

export function createBladeTrail({samples=TRAIL.samples,life=TRAIL.life,color=TRAIL.color,alpha=TRAIL.alpha}={}){
 const pos=new Float32Array(samples*2*3),fade=new Float32Array(samples*2);
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new BufferAttribute(pos,3));
 geometry.setAttribute('fade',new BufferAttribute(fade,1));
 const index=[];for(let i=0;i<samples-1;i++){const a=i*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
 geometry.setIndex(index);
 const material=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,side:DoubleSide,
  uniforms:{uColor:{value:new Vector3(...color)},uAlpha:{value:alpha}},
  vertexShader:'attribute float fade;varying float vFade;void main(){vFade=fade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform vec3 uColor;uniform float uAlpha;varying float vFade;void main(){if(vFade<=0.0)discard;gl_FragColor=vec4(uColor*vFade*uAlpha,1.0);}'});
 const mesh=new Mesh(geometry,material);
 mesh.name='blade-trail';mesh.frustumCulled=false;mesh.renderOrder=5;mesh.visible=false;
 // The ring of samples, newest last: [inner xyz, tip xyz, time].
 const ring=[];let count=0;
 return {
  mesh,
  get count(){return count;},
  /** A sample of the blade now: `inner` and `tip` in world space, at `time` (s). */
  push(inner,tip,time){
   ring.push([inner.x,inner.y,inner.z,tip.x,tip.y,tip.z,time]);
   if(ring.length>samples)ring.shift();
  },
  /** Rewrite the ribbon for `time`; drops samples older than `life`. Returns the samples drawn. */
  update(time){
   while(ring.length&&time-ring[0][6]>life)ring.shift();
   count=ring.length;
   for(let i=0;i<samples;i++){
    const s=ring[Math.min(i,ring.length-1)];
    if(!s||i>=ring.length){fade[i*2]=fade[i*2+1]=0;if(s){pos.set(s.slice(0,3),i*6);pos.set(s.slice(3,6),i*6+3);}continue;}
    // Older samples fade out, and the oldest third narrows toward the tip: a crescent.
    const age=Math.max(0,Math.min(1,(time-s[6])/life)),k=(1-age)*(1-age),narrow=Math.min(1,i/Math.max(1,ring.length-1)*1.6+.25);
    for(let c=0;c<3;c++){pos[i*6+c]=s[3+c]+(s[c]-s[3+c])*narrow;pos[i*6+3+c]=s[3+c];}
    fade[i*2]=0;fade[i*2+1]=k;
   }
   geometry.attributes.position.needsUpdate=true;geometry.attributes.fade.needsUpdate=true;
   mesh.visible=count>1;
   return count;
  },
  clear(){ring.length=0;count=0;mesh.visible=false;},
  dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}
 };
}
