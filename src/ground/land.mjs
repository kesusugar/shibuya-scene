import {PlaneGeometry,Shape,Path,ShapeGeometry} from 'three';
import {GROUND as C} from './config.mjs';

/**
 * The land under everything, a square at -0.08 m. Backlog ③: with `holes` (rings of [x,z] in the
 * ground plane -- the underground passage's stair wells) it is a shape with those cut out; the
 * texture lies as it did on the plain square.
 * @param {number[][][]} [holes]
 */
export function landPlane(holes=[]){
 const L=C.limit;let g;
 if(!holes.length)g=new PlaneGeometry(L*2,L*2);
 else{
  // Shape space is (x, -z): rotating it -90° about X lays it in the ground plane the right way up.
  const shape=new Shape([[-L,L],[L,L],[L,-L],[-L,-L]].map(([x,y])=>({x,y})));
  for(const ring of holes)shape.holes.push(new Path(ring.map(([x,z])=>({x,y:-z}))));
  g=new ShapeGeometry(shape);
 }
 g.rotateX(-Math.PI/2);g.translate(0,-.08,0);
 const p=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,(p.getX(i)+L)/4,(L-p.getZ(i))/4);
 return g;
}
