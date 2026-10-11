import {CanvasTexture,DataTexture,SRGBColorSpace,LinearFilter,RGBAFormat} from 'three';
import {QUALITY,CATEGORIES} from './config.mjs';
// Cityscape C3 (owner-approved, docs/PLAN-CITYSCAPE.md): the shop signs are the chains a street
// round the crossing actually carries, in their own colours. Text and colour only -- reconstructed
// on canvas, no logo artwork copied. Slot i keeps category CATEGORIES[i%8] (geometry depends on
// it); the blade and directory slots (2, 5 mod 8) hang vertically and carry `vertical`.
// [text, background, foreground, sub-line, vertical]
export const CITY_BRANDS=Object.freeze([
 ['マツモトキヨシ','#ffe600','#0a3d91','薬 化粧品'],['吉野家','#f39800','#ffffff','牛丼'],['カラオケ館','#e60012','#ffffff','','カラオケ館'],['TOWER RECORDS','#ffd400','#e3001b','NO MUSIC, NO LIFE.'],
 ['UNIQLO','#e60012','#ffffff','SHIBUYA'],['磯丸水産','#0b3a7e','#ffffff','','磯丸水産'],['GiGO','#1a1a8c','#ffffff','GAME'],['LAWSON','#0068b7','#ffffff','ローソン'],
 ['ドン・キホーテ','#ffe100','#e60012','驚安の殿堂'],['松屋','#ffd800','#003d8f','牛めし'],['牛角','#151515','#f2c200','','焼肉牛角'],['H&M','#ffffff','#e50010',''],
 ['ABC-MART','#d7000f','#ffffff','SHOES'],['名代富士そば','#f5e9c8','#1b1b1b','','富士そば'],['TAITO STATION','#00a0e9','#ffffff','タイトーステーション'],['FamilyMart','#ffffff','#00a73c','ファミリーマート'],
 ['無印良品','#7f0019','#ffffff','MUJI'],['一蘭','#b60005','#ffffff','天然とんこつラーメン'],['まねきねこ','#ffd700','#d7000f','','まねきねこ'],['HMV','#c8102e','#ffffff','record shop'],
 ['GU','#003d8f','#ffffff','SHIBUYA'],['鳥貴族','#fcd000','#c8102e','','鳥貴族'],['PARCO','#141414','#ffffff','SHIBUYA PARCO'],['セブン-イレブン','#ffffff','#ef7f1a','7-ELEVEn'],
 ['ココカラファイン','#e4007f','#ffffff','ドラッグストア'],['天下一品','#c30d23','#ffffff','こってりラーメン'],['一風堂','#111111','#ffffff','','一風堂'],['ZARA','#000000','#ffffff',''],
 ['LOFT','#1a1a1a','#ffde00','SHIBUYA'],['ドトール','#002e6e','#f5d200','','ドトール'],['SHIBUYA SKY','#0d1b3e','#ffffff','展望施設'],['みずほ銀行','#00398f','#ffffff','MIZUHO']
]);
export function definitions(count=32){return Array.from({length:count},(_,i)=>{const [text,bg,fg,sub,vertical]=CITY_BRANDS[i%CITY_BRANDS.length];return {id:i,category:CATEGORIES[i%8],text,sub,vertical:vertical??null,palette:[bg,fg],styleSeed:i,emissiveClass:i%8===6?'screen':'printed',priority:i%8===6?3:1,aspect:[3,2,.3,3,2,.5,2.2,1][i%8],regionAffinity:i%3===0?'centerGai':'any',sizeClass:i%8===4?'large':'small'};});}
export function atlasEntries(size,count){const cols=8,rows=4,padding=Math.max(4,size/256);return Array.from({length:count},(_,id)=>{const x=id%cols*size/cols,y=Math.floor(id/cols)*size/rows,w=size/cols,h=size/rows;return {id,x,y,w,h,padding,u0:(x+padding)/size,u1:(x+w-padding)/size,v0:1-(y+h-padding)/size,v1:1-(y+padding)/size};});}
export function paintCity(ctx,size,count){
 const entries=atlasEntries(size,count),defs=definitions(count);
 ctx.fillStyle='#121721';ctx.fillRect(0,0,size,size);
 for(const e of entries){
  const d=defs[e.id],[bg,fg]=d.palette;
  // A lightbox: a dark metal frame, the face in the brand's colour, lit a little brighter in the
  // middle than at the edges (the tubes behind it), so it reads as a lit sign and not paper.
  ctx.fillStyle='#0d1014';ctx.fillRect(e.x,e.y,e.w,e.h);
  ctx.save();ctx.beginPath();ctx.rect(e.x+e.padding,e.y+e.padding,e.w-2*e.padding,e.h-2*e.padding);ctx.clip();
  ctx.translate(e.x,e.y);ctx.scale(e.w,e.h);ctx.fillStyle=bg;ctx.fillRect(.04,.025,.92,.95);
  const g=ctx.createLinearGradient?.(0,0,1,0);if(g?.addColorStop){g.addColorStop(0,'rgba(0,0,0,.22)');g.addColorStop(.5,'rgba(255,255,255,.08)');g.addColorStop(1,'rgba(0,0,0,.22)');ctx.fillStyle=g;ctx.fillRect(.04,.025,.92,.95);}
  ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';
  if(d.vertical){
   const text=[...d.vertical].slice(0,6);
   const step=Math.min(.15,.84/text.length);
   ctx.font=`900 ${Math.min(.2,step*1.3).toFixed(3)}px sans-serif`;
   text.forEach((letter,j)=>ctx.fillText(letter,.5,.1+step*(j+.5),.78));
  }else{
   ctx.font='900 .3px sans-serif';ctx.fillText(d.text,.5,d.sub?.4:.5,.86);
   if(d.sub){ctx.font='600 .13px sans-serif';ctx.fillText(d.sub,.5,.76,.8);}
   // 7-Eleven's stripes, FamilyMart's bands: a brand's colour bar under the name.
   if(/セブン/.test(d.text)){for(const [c,y] of [['#ef7f1a',.6],['#00a73c',.66],['#e60012',.72]]){ctx.fillStyle=c;ctx.fillRect(.08,y,.84,.04);}}
   if(/FamilyMart/.test(d.text)){ctx.fillStyle='#0064b4';ctx.fillRect(.04,.88,.92,.09);ctx.fillStyle='#00a73c';ctx.fillRect(.04,.025,.92,.07);}
  }
  ctx.restore();
 }return entries;
}
/**
 * The big screens (QFRONT's vision and the other large visions). Cityscape: a vivid music spot --
 * a night-sky gradient, a lit figure, big type -- because the screens are the brightest, most
 * looked-at thing in a picture of the crossing, and a pale placeholder read as a hole there.
 * Flat fills first, gradients only where the context has them (tests paint through a stub).
 */
export function paintScreen(ctx,w,h){
 const grad=(x0,y0,x1,y1,stops)=>{const g=ctx.createLinearGradient?.(x0,y0,x1,y1);if(!g?.addColorStop)return stops[0][1];for(const [o,c] of stops)g.addColorStop(o,c);return g;};
 ctx.fillStyle='#1b0b3a';ctx.fillRect(0,0,w,h);
 ctx.fillStyle=grad(0,0,w,h,[[0,'#2a0a5e'],[.45,'#b0127a'],[.8,'#ff6a2b'],[1,'#ffd34d']]);ctx.fillRect(0,0,w,h);
 // Light rays from behind the figure.
 for(let i=0;i<14;i++){const a=-Math.PI/2+(i-6.5)*.16;ctx.fillStyle=i%2?'rgba(255,240,200,.10)':'rgba(255,255,255,.05)';ctx.beginPath();ctx.moveTo(w*.66,h*.62);ctx.lineTo(w*.66+Math.cos(a-.05)*w,h*.62+Math.sin(a-.05)*w);ctx.lineTo(w*.66+Math.cos(a+.05)*w,h*.62+Math.sin(a+.05)*w);ctx.closePath();ctx.fill();}
 // A lit sun disc and the singer's silhouette in front of it.
 ctx.fillStyle='#fff1c4';ctx.beginPath();ctx.arc(w*.66,h*.5,h*.3,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#ffb347';ctx.beginPath();ctx.arc(w*.66,h*.5,h*.24,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#160826';
 ctx.beginPath();ctx.ellipse(w*.66,h*.36,h*.075,h*.095,0,0,Math.PI*2);ctx.fill();          // head
 ctx.beginPath();ctx.moveTo(w*.66-h*.2,h*1.02);ctx.quadraticCurveTo?.(w*.66-h*.17,h*.5,w*.66,h*.46);ctx.quadraticCurveTo?.(w*.66+h*.17,h*.5,w*.66+h*.2,h*1.02);ctx.closePath();ctx.fill();
 ctx.fillRect(w*.66+h*.12,h*.42,h*.035,h*.2);                                                // mic arm
 // Type: the release, big; the artist; the date.
 ctx.textAlign='left';ctx.textBaseline='middle';
 ctx.fillStyle='#ffffff';ctx.font=`900 ${h*.2}px sans-serif`;ctx.fillText('NEW SINGLE',w*.05,h*.3,w*.5);
 ctx.fillStyle='#ffe066';ctx.font=`900 ${h*.13}px sans-serif`;ctx.fillText('「夜明けの交差点」',w*.05,h*.53,w*.52);
 ctx.fillStyle='#ffffff';ctx.font=`700 ${h*.075}px sans-serif`;ctx.fillText('10.25 RELEASE  /  LIVE TOUR 2026',w*.05,h*.72,w*.52);
 ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,h*.86,w,h*.14);
 ctx.fillStyle='#ffffff';ctx.font=`700 ${h*.05}px sans-serif`;ctx.textAlign='center';ctx.fillText('SHIBUYA',w*.12,h*.93,w*.2);
 ctx.fillText('STREAMING NOW  •  渋谷から、世界へ',w*.58,h*.93,w*.7);
}
export function createSignAtlases({tier='medium',maxTextureSize=4096,canvasFactory}={}){const q=QUALITY[tier];if(!q)throw Error('Unknown signs tier');if(!(maxTextureSize>=128))throw Error('GPU texture limit too small');const cap=2**Math.floor(Math.log2(maxTextureSize)),size=Math.min(q.atlas,cap),screenWidth=Math.min(q.screen,cap),count=q.variants;
 const make=(w,h,paint)=>{const canvas=canvasFactory?canvasFactory():typeof document!=='undefined'?document.createElement('canvas'):null;let texture,mode;if(canvas){canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Sign Canvas 2D unavailable');paint(ctx,w,h);texture=new CanvasTexture(canvas);mode='canvas';}else{texture=new DataTexture(new Uint8Array([255,255,255,255]),1,1,RGBAFormat);mode='cpu-placeholder';}texture.colorSpace=SRGBColorSpace;texture.minFilter=LinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return {texture,mode};};
 const city=make(size,size,(c,w)=>paintCity(c,w,count)),screen=make(screenWidth,screenWidth/2,paintScreen);let disposed=false;return {city,screen,entries:atlasEntries(size,count),definitions:definitions(count),size,screenWidth,count,dispose(){if(disposed)return;disposed=true;city.texture.dispose();screen.texture.dispose();}};
}
