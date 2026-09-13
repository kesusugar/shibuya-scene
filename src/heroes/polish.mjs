import {BoxGeometry,CanvasTexture,DataTexture,Group,Mesh,MeshStandardMaterial,PlaneGeometry,RGBAFormat,SRGBColorSpace} from 'three';
import {edges,facadePoint} from './model.mjs';
import {merge,triangleCount} from '../geo/geometry.mjs';

const CENTRAL=new Set(['qfront','magnet','seibuA','seibuB']);

function texture(paint,{width=1536,height=768,fallback=[214,170,104,255]}={}){
 const canvas=typeof document!=='undefined'?document.createElement('canvas'):null;
 let result;if(canvas){canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Central storefront Canvas2D unavailable');paint(ctx,width,height);result=new CanvasTexture(canvas);}else result=new DataTexture(new Uint8Array(fallback),1,1,RGBAFormat);
 result.colorSpace=SRGBColorSpace;result.needsUpdate=true;return result;
}

function floorBias(bay,person){return ((bay+person)%3)*.012;}

export function paintCentralRetail(ctx,w,h){
 const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#181a21');gradient.addColorStop(.11,'#34281d');gradient.addColorStop(.55,'#9a6839');gradient.addColorStop(1,'#201710');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#111820';ctx.fillRect(0,0,w,h*.105);ctx.fillStyle='#f4e2b8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${h*.055}px Arial`;ctx.fillText('SHIBUYA  BOOKS  •  DINING  •  CAFE',w*.5,h*.052,w*.94);
 const bays=12;for(let bay=0;bay<bays;bay++){
  const x=w*(bay/bays),bw=w/bays;ctx.fillStyle=bay%4===0?'#d79c56':bay%3===0?'#f2c781':'#b77a43';ctx.fillRect(x+bw*.045,h*.13,bw*.91,h*.79);
  const glow=ctx.createLinearGradient(x,0,x+bw,0);glow.addColorStop(0,'#6d452b');glow.addColorStop(.4,'#ffdca0');glow.addColorStop(1,'#70472b');ctx.fillStyle=glow;ctx.fillRect(x+bw*.07,h*.16,bw*.86,h*.72);
  for(let floor=0;floor<2;floor++)for(let shelf=0;shelf<4;shelf++){const y=h*(.22+floor*.39+shelf*.052);ctx.fillStyle='#51331f';ctx.fillRect(x+bw*.09,y,bw*.82,h*.012);for(let item=0;item<8;item++){ctx.fillStyle=['#f0d08e','#b94f43','#477886','#d99857','#789268'][(bay+floor+shelf+item)%5];ctx.fillRect(x+bw*(.11+item*.095),y-h*.036,bw*.06,h*.035);}}
  ctx.fillStyle='#17191d';ctx.fillRect(x+bw*.47,h*.15,bw*.045,h*.77);ctx.fillRect(x+bw*.06,h*.515,bw*.88,h*.028);ctx.fillStyle='#fff1bd';for(const y of [.18,.57])ctx.fillRect(x+bw*.24,h*y,bw*.5,h*.018);
  ctx.fillStyle='#20242b';for(let person=0;person<2;person++){const px=x+bw*(.28+person*.38),bias=floorBias(bay,person);ctx.beginPath();ctx.arc(px,h*(.46+bias),h*.018,0,Math.PI*2);ctx.fill();ctx.fillRect(px-h*.014,h*(.478+bias),h*.028,h*.075);}ctx.fillStyle='#dfe9e733';ctx.fillRect(x+bw*.12,h*.17,bw*.11,h*.7);
 }
 ctx.fillStyle='#0d1015';ctx.fillRect(0,h*.92,w,h*.08);ctx.fillStyle='#f2d6a2';ctx.font=`700 ${h*.034}px Arial`;ctx.fillText('OPEN LATE  ·  HACHIKO CROSSING',w*.5,h*.96,w*.9);
}

function paintQfrontMarquee(ctx,w,h){const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#15120f');g.addColorStop(.25,'#8b5a24');g.addColorStop(.5,'#16120e');g.addColorStop(.75,'#8b5a24');g.addColorStop(1,'#15120f');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#f4d28d';ctx.lineWidth=h*.035;ctx.strokeRect(h*.08,h*.08,w-h*.16,h*.84);ctx.fillStyle='#fff1c8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${h*.42}px Arial`;ctx.fillText('TSUTAYA  BOOKS & CAFE',w*.5,h*.5,w*.88);}
function boxGeometry(width,height,depth,position,heading){const g=new BoxGeometry(width,height,depth);g.rotateY(heading);g.translate(...position);return g;}

export function createCentralPolish(heroes){
 const root=new Group();root.name='hero-central-polish';const retailTexture=texture(paintCentralRetail),marqueeTexture=texture(paintQfrontMarquee,{width:1536,height:256,fallback:[245,210,141,255]});
 const retailMaterial=new MeshStandardMaterial({map:retailTexture,emissiveMap:retailTexture,emissive:0xffcf8f,emissiveIntensity:.16,roughness:.3,metalness:.12});const marqueeMaterial=new MeshStandardMaterial({map:marqueeTexture,emissiveMap:marqueeTexture,emissive:0xffdf9e,emissiveIntensity:.24,roughness:.3,metalness:.08});const frameMaterial=new MeshStandardMaterial({color:0x171b20,roughness:.34,metalness:.72});const canopyMaterial=new MeshStandardMaterial({color:0x403326,emissive:0xffbd66,emissiveIntensity:.08,roughness:.42,metalness:.35});
 const retailPieces=[],marqueePieces=[],framePieces=[],canopyPieces=[];let fronts=0;
 for(const hero of heroes){if(!CENTRAL.has(hero.key))continue;const candidates=edges(hero.footprint).filter(e=>e.length>4&&e.normal[0]*hero.primaryFacade.direction[0]+e.normal[1]*hero.primaryFacade.direction[1]>.2);for(const e of candidates){fronts++;const isQfront=hero.key==='qfront';if(!isQfront){const g=new PlaneGeometry(e.length-.28,7.25);g.rotateY(e.heading);g.translate(...facadePoint(e,e.length/2,3.78,.31));retailPieces.push(g);}const bays=Math.max(2,Math.round(e.length/2.6));for(let i=0;i<=bays;i++){const along=.18+(e.length-.36)*i/bays;framePieces.push(boxGeometry(.11,7.35,.16,facadePoint(e,along,3.78,.42),e.heading));}for(const y of [.48,3.55,7.18])framePieces.push(boxGeometry(e.length-.2,.12,.17,facadePoint(e,e.length/2,y,.42),e.heading));canopyPieces.push(boxGeometry(e.length-.42,.2,1.05,facadePoint(e,e.length/2,3.25,.78),e.heading));if(isQfront){const g=new PlaneGeometry(Math.max(2,e.length-.5),.92);g.rotateY(e.heading);g.translate(...facadePoint(e,e.length/2,7.08,.48));marqueePieces.push(g);}}}
 const owned=[];const add=(pieces,material,name)=>{if(!pieces.length)return 0;const geometry=merge(pieces);pieces.forEach(g=>g.dispose());const mesh=new Mesh(geometry,material);mesh.name=name;mesh.userData.noAO=true;root.add(mesh);owned.push(mesh);return triangleCount(geometry);};
 const triangles=add(retailPieces,retailMaterial,'hero-polish-storefront')+add(marqueePieces,marqueeMaterial,'hero-polish-marquee')+add(framePieces,frameMaterial,'hero-polish-frames')+add(canopyPieces,canopyMaterial,'hero-polish-canopies');
 return {root,fronts,triangles,drawCalls:owned.length,dispose(){root.removeFromParent();for(const mesh of owned)mesh.geometry.dispose();retailMaterial.dispose();marqueeMaterial.dispose();frameMaterial.dispose();canopyMaterial.dispose();retailTexture.dispose();marqueeTexture.dispose();root.clear();}};
}
