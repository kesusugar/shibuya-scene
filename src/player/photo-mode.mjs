// Backlog ②: photo mode, for promo stills and footage.
//
// P (or the on-screen button) in play: the world stops (or runs slowly, or on), the HUD goes, and
// a free camera takes the view from where the game camera was. It flies with WASD (Q/E down and
// up, Shift faster, Alt slower) and looks with the mouse; on a pad the left stick flies, the right
// stick looks, ZL/ZR go down/up and L/R zoom. The wheel (or [ and ]) zooms, Z/X roll the view,
// T cycles the world's time (stopped, 1/4 speed, running), N the time of day, H hides the help,
// and Enter (or the pad's bottom face button) saves the frame as a PNG. P or Esc goes back to play
// exactly where it was: the game camera is not touched while the free camera has the view.
//
// The core (`createPhotoMode`) is pure: a pose, its motion and the settings, stepped with real
// time. The DOM part (`attachPhotoControls`) turns keys, mouse and pad into that, and draws the
// help. The scene owns the rest: scaling the world's dt by `timeScale`, putting the pose on its
// camera, hiding the HUD, and taking the capture after it renders.

export const PHOTO=Object.freeze({
 speed:6,          // m/s flying
 fast:4,slow:.25,  // Shift / Alt multipliers
 look:.0022,       // rad per mouse pixel
 padLook:2.4,      // rad/s at full stick
 fov:Object.freeze({min:12,max:95,step:3}),
 roll:Object.freeze({max:.6,rate:.8}),
 pitch:1.5,        // rad, either way
 reach:60,         // m from where photo mode began: the camera stays by the scene it was given
 floor:.25,        // m above the ground at least
 times:Object.freeze([0,.25,1]),  // the world's speed: stopped, slow, running
 phases:Object.freeze(['dawn','day','dusk','night'])
});

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/**
 * The free camera. `enter(from)` takes {x,y,z,yaw,pitch,fov} (yaw 0 looks toward +z, as the
 * game's heading); `update(dt, input)` flies it with real seconds, input {forward, strafe, up,
 * fast, slow, lookX, lookY, roll, zoom} (sticks and keys, -1..1; look in rad).
 * @param {{ground?: (x:number, z:number) => number}} [options] the ground's height, to stay above it
 */
export function createPhotoMode({ground=(x,z)=>0}={}){
 const pose={x:0,y:0,z:0,yaw:0,pitch:0,roll:0,fov:50};
 let active=false,timeIndex=0,origin={x:0,z:0},baseFov=50,captures=0;
 return {
  pose,
  get active(){return active;},
  /** The world's speed while photo mode is on (1 when it is off). */
  get timeScale(){return active?PHOTO.times[timeIndex]:1;},
  get timeIndex(){return timeIndex;},
  get captures(){return captures;},
  enter(from){
   if(active)return false;
   Object.assign(pose,{x:from.x,y:from.y,z:from.z,yaw:from.yaw??0,pitch:clamp(from.pitch??0,-PHOTO.pitch,PHOTO.pitch),roll:0,fov:from.fov??50});
   baseFov=pose.fov;origin={x:from.x,z:from.z};timeIndex=0;active=true;return true;
  },
  exit(){if(!active)return false;active=false;return true;},
  /** Stopped → slow → running → stopped. Returns the new speed. */
  cycleTime(){timeIndex=(timeIndex+1)%PHOTO.times.length;return PHOTO.times[timeIndex];},
  zoom(steps){pose.fov=clamp(pose.fov+steps*PHOTO.fov.step,PHOTO.fov.min,PHOTO.fov.max);return pose.fov;},
  look(dx,dy){pose.yaw-=dx*PHOTO.look;pose.pitch=clamp(pose.pitch-dy*PHOTO.look,-PHOTO.pitch,PHOTO.pitch);},
  countCapture(){captures++;},
  update(dt,input={}){
   if(!active)return pose;
   const step=Math.max(0,Math.min(.1,dt));
   const speed=PHOTO.speed*(input.fast?PHOTO.fast:1)*(input.slow?PHOTO.slow:1);
   pose.yaw-=(input.lookX??0)*PHOTO.padLook*step;
   pose.pitch=clamp(pose.pitch-(input.lookY??0)*PHOTO.padLook*step,-PHOTO.pitch,PHOTO.pitch);
   // Flying goes where the camera looks (forward includes its pitch); strafe stays level.
   const f=input.forward??0,s=input.strafe??0,u=input.up??0,cy=Math.cos(pose.pitch);
   const fx=Math.sin(pose.yaw)*cy,fy=Math.sin(pose.pitch),fz=Math.cos(pose.yaw)*cy;
   const rx=-Math.cos(pose.yaw),rz=Math.sin(pose.yaw);
   pose.x+=(fx*f+rx*s)*speed*step;pose.z+=(fz*f+rz*s)*speed*step;pose.y+=(fy*f+u)*speed*step;
   // Kept by the scene it was given, and out of the ground.
   const dx=pose.x-origin.x,dz=pose.z-origin.z,d=Math.hypot(dx,dz);
   if(d>PHOTO.reach){pose.x=origin.x+dx/d*PHOTO.reach;pose.z=origin.z+dz/d*PHOTO.reach;}
   pose.y=Math.max(pose.y,(ground(pose.x,pose.z)??0)+PHOTO.floor);
   if(input.roll)pose.roll=clamp(pose.roll+input.roll*PHOTO.roll.rate*step,-PHOTO.roll.max,PHOTO.roll.max);
   if(input.zoom)pose.fov=clamp(pose.fov+input.zoom*PHOTO.fov.step*6*step,PHOTO.fov.min,PHOTO.fov.max);
   return pose;
  },
  /**
   * Where the camera looks, one metre ahead: for a lookAt.
   * @param {{x:number,y:number,z:number}} [out]
   * @returns {{x:number,y:number,z:number}}
   */
  target(out={x:0,y:0,z:0}){const cy=Math.cos(pose.pitch);out.x=pose.x+Math.sin(pose.yaw)*cy;out.y=pose.y+Math.sin(pose.pitch);out.z=pose.z+Math.cos(pose.yaw)*cy;return out;},
  get baseFov(){return baseFov;}
 };
}

/** A file name for a still taken now: shibuya-YYYYMMDD-HHMMSS.png. */
export function captureName(date=new Date()){
 const p=n=>String(n).padStart(2,'0');
 return `shibuya-${date.getFullYear()}${p(date.getMonth()+1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.png`;
}

const HELP=[['WASD','移動'],['Q / E','下 / 上'],['Shift / Alt','速く / ゆっくり'],['マウス','向き'],['ホイール・[ ]','ズーム'],['Z / X','傾き'],
 ['T','時間：止める → 1/4 → 流す'],['N','時間帯'],['Enter','撮る（PNG）'],['H','この案内を消す / 出す'],['P / Esc','戻る']];

/**
 * Keys, mouse and pad for photo mode, attached to the canvas `element` for as long as the scene
 * is in play. `onToggle()` asks the scene to enter or leave; `onCapture()`, `onTimeOfDay()` and
 * `onTime(scale)` are the rest. Returns {input(), detach(), setHelp(on), setStatus(text)}.
 */
export function attachPhotoControls(element,photo,{onToggle,onCapture,onTimeOfDay,onTime}={}){
 const keys=new Set();let zoomKey=0,rollKey=0,pad=null,padCapture=false;
 const help=document.createElement('aside');help.className='photo-help';help.setAttribute('aria-label','撮影モード');
 help.innerHTML=`<b>撮影モード</b><span class="photo-status"></span><dl>${HELP.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><div class="photo-buttons"><button type="button" data-photo="shoot">撮る</button><button type="button" data-photo="back">戻る</button></div>`;
 // For a mouse or a finger: the still, and the way back.
 help.querySelector('[data-photo="shoot"]').addEventListener('click',()=>onCapture?.());
 help.querySelector('[data-photo="back"]').addEventListener('click',()=>onToggle?.());
 help.hidden=true;document.body.appendChild(help);
 const status=help.querySelector('.photo-status');
 const down=e=>{
  if(e.target?.closest?.('input,select,textarea'))return;
  const k=e.key.toLowerCase();
  if(k==='p'&&!e.repeat){e.preventDefault();e.stopImmediatePropagation();onToggle?.();return;}
  if(!photo.active)return;
  // Photo mode has the keys: the game's own handlers must not see them (no attacks, no rolls).
  e.preventDefault();e.stopImmediatePropagation();
  if(e.repeat&&k!=='['&&k!==']')return;
  if(k==='escape'){onToggle?.();return;}
  if(k==='enter'){onCapture?.();return;}
  if(k==='t'){onTime?.(photo.cycleTime());return;}
  if(k==='n'){onTimeOfDay?.();return;}
  if(k==='h'){help.classList.toggle('photo-help-off');return;}
  if(k==='['||k===']'){photo.zoom(k==='['?1:-1);return;}
  if(k==='z')rollKey=1;else if(k==='x')rollKey=-1;
  keys.add(k);
 };
 const up=e=>{const k=e.key.toLowerCase();keys.delete(k);if(k==='z'||k==='x')rollKey=0;if(photo.active){e.stopImmediatePropagation();}};
 const move=e=>{if(!photo.active||document.pointerLockElement!==element)return;e.stopImmediatePropagation();photo.look(e.movementX,e.movementY);};
 const wheel=e=>{if(!photo.active)return;e.preventDefault();e.stopImmediatePropagation();photo.zoom(Math.sign(e.deltaY));};
 const swallow=e=>{if(photo.active)e.stopImmediatePropagation();};
 const blur=()=>{keys.clear();rollKey=0;zoomKey=0;};
 // Capturing first, so photo mode sees its keys before the game's handlers on the same targets.
 window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',blur);
 element.addEventListener('mousemove',move,true);element.addEventListener('wheel',wheel,{capture:true,passive:false});
 for(const type of ['mousedown','mouseup','contextmenu'])element.addEventListener(type,swallow,true);
 const deadzone=v=>Math.abs(v)<.15?0:v;
 return {
  help,
  /** This frame's flying input: keys merged with the first pad (standard mapping). */
  input(){
   const has=k=>keys.has(k)?1:0;
   const i={forward:has('w')-has('s'),strafe:has('d')-has('a'),up:has('e')-has('q'),fast:keys.has('shift'),slow:keys.has('alt'),
    lookX:0,lookY:0,roll:rollKey,zoom:zoomKey};
   pad=null;
   if(typeof navigator!=='undefined'&&navigator.getGamepads)for(const g of navigator.getGamepads())if(g?.connected){pad=g;break;}
   if(pad&&photo.active){
    const a=pad.axes,b=n=>pad.buttons[n]?.value??0;
    if(deadzone(a[1]??0))i.forward=-deadzone(a[1]);if(deadzone(a[0]??0))i.strafe=deadzone(a[0]);
    i.lookX=deadzone(a[2]??0);i.lookY=deadzone(a[3]??0);
    i.up=i.up||(b(7)-b(6));i.zoom=i.zoom||(b(4)-b(5));
    const shoot=b(0)>.5;if(shoot&&!padCapture)onCapture?.();padCapture=shoot;
   }
   return i;
  },
  setHelp(on){help.hidden=!on;},
  setStatus(text){status.textContent=text;},
  detach(){
   window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',blur);
   element.removeEventListener('mousemove',move,true);element.removeEventListener('wheel',wheel,{capture:true});
   for(const type of ['mousedown','mouseup','contextmenu'])element.removeEventListener(type,swallow,true);
   help.remove();keys.clear();
  }
 };
}
