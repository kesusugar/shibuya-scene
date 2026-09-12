import {CanvasTexture,DataTexture,SRGBColorSpace,LinearFilter,RGBAFormat} from 'three';
import {QUALITY,CATEGORIES} from './config.mjs';
const WORDS=['さくら薬局','まど食堂','光庭クリニック','ネコ銀行','茶と空','音の庭','よつば不動産','彩り美容室','BOOK LAB','喫茶ループ','旅の窓口','夜空カラオケ','TONE MUSIC','まちの眼科','遊星ゲーム','花のアトリエ'];
const COLORS=[['#fff4e6','#e64669'],['#e94836','#fff5de'],['#fff5e9','#42a884'],['#fff5e6','#df3651'],['#148b68','#fff4dd'],['#346ec5','#fff8e8'],['#fff5df','#64ab53'],['#e77aa7','#fff6ee']];
export function definitions(count=32){return Array.from({length:count},(_,i)=>({id:i,category:CATEGORIES[i%8],text:WORDS[i%WORDS.length],palette:COLORS[(i+Math.floor(i/8)*3)%8],styleSeed:i,emissiveClass:i%8===6?'screen':'printed',priority:i%8===6?3:1,aspect:[3,2,.3,3,2,.5,2.2,1][i%8],regionAffinity:i%3===0?'centerGai':'any',sizeClass:i%8===4?'large':'small'}));}
export function atlasEntries(size,count){const cols=8,rows=4,padding=Math.max(4,size/256);return Array.from({length:count},(_,id)=>{const x=id%cols*size/cols,y=Math.floor(id/cols)*size/rows,w=size/cols,h=size/rows;return {id,x,y,w,h,padding,u0:(x+padding)/size,u1:(x+w-padding)/size,v0:1-(y+h-padding)/size,v1:1-(y+padding)/size};});}
export function paintCity(ctx,size,count){
 const entries=atlasEntries(size,count),defs=definitions(count);
 ctx.fillStyle='#121721';ctx.fillRect(0,0,size,size);
 for(const e of entries){
  const d=defs[e.id],i=e.id%16,[bg,fg]=d.palette;
  ctx.fillStyle='#18212a';ctx.fillRect(e.x,e.y,e.w,e.h);
  ctx.save();ctx.beginPath();ctx.rect(e.x+e.padding,e.y+e.padding,e.w-2*e.padding,e.h-2*e.padding);ctx.clip();
  ctx.translate(e.x,e.y);ctx.scale(e.w,e.h);ctx.fillStyle=bg;ctx.fillRect(.04,.025,.92,.95);
  ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';
  const vertical=['blade','directory'].includes(d.category);
  if(vertical){
   const text=d.text.replace(/[A-Z ]/g,'').slice(0,5)||'音楽の庭';
   ctx.font='900 .20px sans-serif';
   [...text].forEach((letter,j)=>ctx.fillText(letter,.5,.17+j*.15,.78));
   ctx.fillRect(.18,.91,.64,.018);
  }else{
   // Large pictogram, short Japanese brand, restrained secondary line.
   ctx.fillStyle=fg;
   if(i%4===0){ctx.fillRect(.12,.18,.12,.28);ctx.fillRect(.06,.27,.24,.10);}
   else if(i%4===1){ctx.beginPath();ctx.moveTo(.07,.40);ctx.lineTo(.18,.17);ctx.lineTo(.30,.40);ctx.fill();ctx.fillRect(.12,.37,.12,.11);}
   else if(i%4===2){ctx.beginPath();ctx.ellipse(.18,.31,.115,.15,0,0,Math.PI*2);ctx.fill();}
   else {ctx.font='900 .34px sans-serif';ctx.fillText(i%8===3?'¥':'✦',.18,.32,.25);}
   ctx.font='900 .26px sans-serif';ctx.fillText(d.text,.63,.34,.64);
   ctx.font='700 .13px sans-serif';ctx.fillText(['SHIBUYA · OPEN DAILY','暮らしに、彩りを。','スクランブル交差点前','FOOD / CULTURE / TOKYO'][i%4],.5,.65,.83);
   ctx.fillRect(.10,.82,.80,.025);
  }
  ctx.restore();
 }return entries;
}
export function paintScreen(ctx,w,h){
 ctx.fillStyle='#087bb8';ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#0b2045';ctx.fillRect(0,h*.73,w,h*.27);
 ctx.fillStyle='#e6f8ff';ctx.beginPath();ctx.ellipse(w*.5,h*.22,h*.095,h*.095,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#087bb8';ctx.beginPath();ctx.ellipse(w*.525,h*.20,h*.075,h*.075,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#f3fbff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${h*.15}px sans-serif`;ctx.fillText('CROSS VISION',w*.5,h*.46,w*.83);
 ctx.font=`700 ${h*.065}px sans-serif`;ctx.fillText('街と、人と、未来をつなぐ。',w*.5,h*.62,w*.8);
 ctx.font=`900 ${h*.085}px sans-serif`;ctx.fillText('SHIBUYA  /  TOKYO',w*.5,h*.865,w*.8);
}
export function createSignAtlases({tier='medium',maxTextureSize=4096,canvasFactory}={}){const q=QUALITY[tier];if(!q)throw Error('Unknown signs tier');if(!(maxTextureSize>=128))throw Error('GPU texture limit too small');const cap=2**Math.floor(Math.log2(maxTextureSize)),size=Math.min(q.atlas,cap),screenWidth=Math.min(q.screen,cap),count=q.variants;
 const make=(w,h,paint)=>{const canvas=canvasFactory?canvasFactory():typeof document!=='undefined'?document.createElement('canvas'):null;let texture,mode;if(canvas){canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Sign Canvas 2D unavailable');paint(ctx,w,h);texture=new CanvasTexture(canvas);mode='canvas';}else{texture=new DataTexture(new Uint8Array([255,255,255,255]),1,1,RGBAFormat);mode='cpu-placeholder';}texture.colorSpace=SRGBColorSpace;texture.minFilter=LinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return {texture,mode};};
 const city=make(size,size,(c,w)=>paintCity(c,w,count)),screen=make(screenWidth,screenWidth/2,paintScreen);let disposed=false;return {city,screen,entries:atlasEntries(size,count),definitions:definitions(count),size,screenWidth,count,dispose(){if(disposed)return;disposed=true;city.texture.dispose();screen.texture.dispose();}};
}
