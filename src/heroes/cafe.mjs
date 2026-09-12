import {CanvasTexture,DataTexture,RGBAFormat,SRGBColorSpace,MeshStandardMaterial,PlaneGeometry,Mesh} from 'three';
import {edges,facadePoint} from './model.mjs';
import {merge} from '../geo/geometry.mjs';

// A shared two-storey shopfront texture; geometry remains on the existing footprint.
export function paintCafe(ctx,w,h){
 ctx.fillStyle='#30271e';ctx.fillRect(0,0,w,h);
 for(const [top,bottom] of [[.06,.43],[.59,.95]]){
  ctx.fillStyle='#d9b47c';ctx.fillRect(w*.02,h*top,w*.96,h*(bottom-top));
  for(let bay=0;bay<8;bay++){
   const x=w*(.025+bay*.12);
   ctx.fillStyle=bay%2?'#efd5a4':'#cfae78';ctx.fillRect(x,h*(top+.015),w*.112,h*(bottom-top-.03));
   // Shelves, books and merchandise behind the glazing.
   for(let shelf=0;shelf<3;shelf++){
    const y=h*(top+.065+shelf*.055);
    for(let book=0;book<7;book++){ctx.fillStyle=['#e7c99a','#799184','#a16147','#d5bf83','#526474'][(book+bay+shelf)%5];ctx.fillRect(x+w*(.006+book*.014),y,w*.009,h*.04);}
    ctx.fillStyle='#715137';ctx.fillRect(x,y+h*.043,w*.11,h*.008);
   }
   // Counter seating silhouettes and pendant lights, not a flat glowing rectangle.
   ctx.fillStyle='#594332';ctx.fillRect(x,h*(bottom-.095),w*.11,h*.012);
   for(let seat=0;seat<2;seat++){const sx=x+w*(.023+seat*.056);ctx.fillRect(sx,h*(bottom-.063),w*.029,h*.009);ctx.fillRect(sx+w*.009,h*(bottom-.055),w*.006,h*.047);}
   ctx.fillStyle='#fff0bd';ctx.fillRect(x+w*.035,h*(top+.017),w*.04,h*.015);
   ctx.fillStyle='#b6d1ce28';ctx.fillRect(x+w*.07,h*top,w*.019,h*(bottom-top));
  }
  ctx.fillStyle='#b5b6a3';for(let bay=0;bay<=8;bay++)ctx.fillRect(w*(.015+bay*.12),h*top,w*.009,h*(bottom-top));
 }
 ctx.fillStyle='#006443';ctx.fillRect(0,h*.455,w,h*.105);
 ctx.fillStyle='#fff4d9';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${h*.051}px Arial`;ctx.fillText('STARBUCKS COFFEE',w*.5,h*.51,w*.90);
 ctx.fillStyle='#d5c6a0';ctx.fillRect(0,h*.44,w,h*.013);ctx.fillRect(0,h*.56,w,h*.015);
 ctx.fillStyle='#e0d4b8';ctx.fillRect(0,h*.975,w,h*.025);
}

export function createQfrontCafe(hero,{canvasFactory}={}){
 const canvas=canvasFactory?canvasFactory():typeof document!=='undefined'?document.createElement('canvas'):null;
 let texture;if(canvas){canvas.width=2048;canvas.height=1024;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Cafe Canvas2D unavailable');paintCafe(ctx,2048,1024);texture=new CanvasTexture(canvas);}else texture=new DataTexture(new Uint8Array([210,183,139,255]),1,1,RGBAFormat);
 texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;
 const fronts=edges(hero.footprint).filter(e=>e.length>3&&e.normal[0]*hero.primaryFacade.direction[0]+e.normal[1]*hero.primaryFacade.direction[1]>.25);
 const pieces=fronts.map(e=>{const g=new PlaneGeometry(e.length-.18,6.7);g.rotateY(e.heading);g.translate(...facadePoint(e,e.length/2,3.8,.24));return g;});
 const geometry=merge(pieces);pieces.forEach(g=>g.dispose());
 const material=new MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.12,roughness:.42,metalness:.08});
 const mesh=new Mesh(geometry,material);mesh.name='hero-cafe-frontage';mesh.userData.noAO=true;
 return {mesh,fronts,triangles:fronts.length*2,dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();texture.dispose();}};
}
