// Reality alignment G2-1 (docs/PLAN-REALITY.md): advertising that stands on its own steel frame.
//
// The Hisamitsu / サロンパス pair over the Center-gai entrance is not painted on a wall: it is two
// boards on a lattice frame on the roof of the Taiseido (大盛堂) building, which is 24.1 m (PLATEAU).
// The scene used to raise the building to 38 m so the boards had a wall to hang on; the building
// is back to its measured height and the boards stand on a frame, as in the photographs.
// Positions are scene metres, solved from Commons photographs (REF-A camera; source register).
import {Group,Mesh,MeshStandardMaterial,BoxGeometry,PlaneGeometry,CanvasTexture,SRGBColorSpace,Color} from 'three';
import {merge,triangleCount} from '../geo/geometry.mjs';

/** One frame per entry: the face it fronts (a -> b, outward normal to the right of a->b checked below), the
 *  boards from the bottom up, and the roof it stands on. */
export const SIGN_STRUCTURES=Object.freeze([
 {id:'taiseido-roof',building:'way/136690966',a:[-38.5,-23.5],b:[-32.2,-29.3],along:2.1,width:8.8,roof:24.1,depth:2.4,
  boards:[{art:'salonpas',bottom:28.8,height:5.4},{art:'hisamitsu',bottom:34.4,height:5.6}],
  source:'File:In_Front_of_Shibuya_Station.jpg, File:2025_Shibuya_Crossing.jpg'}
]);

const PAINT={
 hisamitsu(c,w,h){c.fillStyle='#1652b0';c.fillRect(0,0,w,h);c.fillStyle='#0d3f8f';c.fillRect(0,h*.86,w,h*.14);
  c.fillStyle='#ffffff';c.textAlign='center';c.textBaseline='middle';c.font=`italic 900 ${h*.36}px Arial,Helvetica,sans-serif`;c.fillText('Hisamitsu',w/2,h*.45,w*.92);
  c.font=`700 ${h*.1}px "Hiragino Sans","Yu Gothic",sans-serif`;c.fillText('久光製薬',w/2,h*.93,w*.5);},
 salonpas(c,w,h){c.fillStyle='#10a344';c.fillRect(0,0,w,h);c.fillStyle='#ffffff';c.textAlign='center';c.textBaseline='middle';
  c.font=`900 ${h*.42}px "Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;c.fillText('サロンパス',w/2,h*.5,w*.94);}
};

/** Layout only (tested without a canvas): posts, braces and board rectangles in world space. */
export function signStructureLayout(s){
 const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],L=Math.hypot(dx,dz),t=[dx/L,dz/L];
 // Outward normal: away from the building's interior, i.e. towards the crossing (+x, +z here).
 let n=[t[1],-t[0]];if(n[0]+n[1]<0)n=[-n[0],-n[1]];
 const c=[s.a[0]+t[0]*s.along,s.a[1]+t[1]*s.along],top=Math.max(...s.boards.map(b=>b.bottom+b.height));
 const at=(u,y,out)=>[c[0]+t[0]*u+n[0]*out,y,c[1]+t[1]*u+n[1]*out];
 const yaw=Math.atan2(n[0],n[1]),posts=[],braces=[],boards=[];
 for(const u of [-s.width/2+.3,0,s.width/2-.3])for(const out of [.15,-s.depth])posts.push({p:at(u,(s.roof+top)/2,out),size:[.28,top-s.roof,.28]});
 for(let y=s.roof+1.2;y<top;y+=2.6)for(const out of [.15,-s.depth])braces.push({p:at(0,y,out),size:[s.width,.18,.18]});
 for(const u of [-s.width/2+.3,0,s.width/2-.3])for(let y=s.roof+1.2;y<top;y+=2.6)braces.push({p:at(u,y,(.15-s.depth)/2),size:[.16,.16,s.depth+.15]});
 for(const b of s.boards)boards.push({art:b.art,p:at(0,b.bottom+b.height/2,.42),width:s.width,height:b.height});
 return {yaw,posts,braces,boards,top,normal:n};
}

export function buildSignStructures({canvasFactory=()=>typeof document!=='undefined'?document.createElement('canvas'):null}={}){
 const root=new Group();root.name='sign-structures';const parts=[],textures=[],materials=[];let triangles=0;
 const frame=new MeshStandardMaterial({color:0x8d9397,roughness:.55,metalness:.75});materials.push(frame);
 for(const s of SIGN_STRUCTURES){const lay=signStructureLayout(s);
  for(const piece of [...lay.posts,...lay.braces]){const g=new BoxGeometry(...piece.size);g.rotateY(lay.yaw);g.translate(...piece.p);parts.push(g);}
  for(const b of lay.boards){const canvas=canvasFactory();let map=null;
   if(canvas){canvas.width=1024;canvas.height=Math.round(1024*b.height/b.width);const ctx=canvas.getContext('2d');if(ctx){PAINT[b.art](ctx,canvas.width,canvas.height);map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.anisotropy=8;textures.push(map);}}
   const m=new MeshStandardMaterial({color:0xffffff,map,emissive:new Color(0xffffff),emissiveMap:map,emissiveIntensity:.05,roughness:.6,metalness:0});materials.push(m);
   const face=new Mesh(new PlaneGeometry(b.width,b.height),m);face.name='sign-structure-board';face.position.set(...b.p);face.rotation.y=lay.yaw;root.add(face);triangles+=2;
   // Back of the board: a dark box so it is not a paper sheet from behind or the side.
   const back=new BoxGeometry(b.width,b.height,.3);back.rotateY(lay.yaw);back.translate(b.p[0]-lay.normal[0]*.17,b.p[1],b.p[2]-lay.normal[1]*.17);parts.push(back);}
 }
 const g=merge(parts);parts.forEach(p=>p.dispose());const mesh=new Mesh(g,frame);mesh.name='sign-structure-frame';mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);triangles+=triangleCount(g);
 return {root,triangles,count:SIGN_STRUCTURES.length,dispose(){root.removeFromParent();g.dispose();root.traverse(o=>{if(o.isMesh&&o!==mesh)o.geometry.dispose();});materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
