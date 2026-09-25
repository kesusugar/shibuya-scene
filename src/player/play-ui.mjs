import {createDelivery} from './objective.mjs';
import {createPlayerMarker} from './marker.mjs';

// Canvas minimap uses the existing road/walk network; no extra renderer or map download.
export function createPlayUI(network,parent,{onExit,onDrive}={}){
 const mission=createDelivery(network),marker=createPlayerMarker(0x68e7b4);parent.add(marker.mesh);
 const root=document.createElement('section');root.className='play-hud';root.setAttribute('aria-label','プレイ情報');
 root.innerHTML=`<div class="play-top"><div class="play-brand">SHIBUYA <span>FREE ROAM · Tab メニュー</span></div><button class="play-exit" type="button">観察に戻る</button></div>
 <div class="play-mission"><strong>渋谷デリバリー</strong><p class="play-task">徒歩と車で3か所へ。降車して停止すると配達できます。</p><div class="play-task-row"><span class="play-timer"></span><button class="play-start" type="button">配送を始める</button><button class="play-cancel" type="button" hidden>中止</button></div><progress class="play-progress" max="1" value="0" aria-label="受け渡し進行" hidden></progress></div>
 <div class="play-map"><canvas width="320" height="320" aria-label="周辺地図・北が上"></canvas><span>N · 北 / 緑：目的地 / 青：車</span></div>
 <div class="play-dashboard"><div><div class="play-wanted" role="img" aria-label="手配度 0" data-stars="0" data-flash="false"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div><b class="play-speed">徒歩</b><div class="play-health" role="meter" aria-label="体力" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" data-level="ok"><span>体力</span><span class="play-health-bar"><i></i></span><b class="play-health-value">100</b></div><small class="play-weapon" data-weapon="fists">素手</small><small class="play-hint">E/クリック 攻撃 · 1/2/3 武器 · 右ボタン 構える · R 装填 · Q 回避 · C しゃがむ</small><small class="play-damage"></small></div><button class="play-drive" type="button">車を探す</button></div>`;
 root.insertAdjacentHTML('beforeend','<div class="play-wanted-banner" role="status" aria-live="polite" hidden></div>');
 // PLAN-WEAPONS W2: the crosshair, only while a gun is up. The aim is the centre of the view.
 root.insertAdjacentHTML('beforeend','<div class="play-crosshair" aria-hidden="true" hidden><i></i></div>');
 document.body.appendChild(root);
 const query=s=>root.querySelector(s),canvas=query('canvas'),c=canvas.getContext('2d'),task=query('.play-task'),timer=query('.play-timer'),start=query('.play-start'),cancel=query('.play-cancel'),progress=query('.play-progress'),speed=query('.play-speed'),health=query('.play-health'),healthBar=query('.play-health-bar i'),healthValue=query('.play-health-value'),damage=query('.play-damage'),drive=query('.play-drive'),wanted=query('.play-wanted'),stars=[...root.querySelectorAll('.play-wanted i')],banner=query('.play-wanted-banner'),weaponLabel=query('.play-weapon'),crosshair=query('.play-crosshair');
 let bannerFor=0,bannerSeq=0;
 let current=null,visible=false,clock=0,disposed=false;
 query('.play-exit').onclick=()=>onExit?.();drive.onclick=()=>onDrive?.();
 start.onclick=()=>{if(current&&current.alive!==false){mission.start(current);document.exitPointerLock?.();clock=1;}};
 cancel.onclick=()=>{mission.cancel();clock=1;};
 // Build once, draw at 5 Hz. The full network is not traversed each rendered frame.
 const map=document.createElement('canvas');map.width=800;map.height=800;const m=map.getContext('2d'),scale=800/500;
 if(m){m.fillStyle='#0c1821';m.fillRect(0,0,800,800);m.strokeStyle='#354d5b';m.lineWidth=2;
  m.beginPath();for(const e of network.edges){const points=e.points??[[network.nodes[e.from].x,network.nodes[e.from].z],[network.nodes[e.to].x,network.nodes[e.to].z]];points.forEach((p,i)=>m[i?'lineTo':'moveTo']((p[0]+250)*scale,(p[1]+250)*scale));}m.stroke();}
 function draw(position,car,target){if(!c)return;const extent=90,k=320/(extent*2);c.fillStyle='#0c1821';c.fillRect(0,0,320,320);c.drawImage(map,(position.x-extent+250)*scale,(position.z-extent+250)*scale,extent*2*scale,extent*2*scale,0,0,320,320);
  const dot=(p,color,r)=>{if(!p)return;const x=Math.max(8,Math.min(312,160+(p.x-position.x)*k)),y=Math.max(8,Math.min(312,160+(p.z-position.z)*k));c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();};
  if(car?.active)dot(car,'#70d7ff',6);if(target)dot(target,'#68e7b4',8);
  c.save();c.translate(160,160);c.rotate(-position.heading);c.fillStyle='#fff';c.beginPath();c.moveTo(0,10);c.lineTo(-7,-7);c.lineTo(7,-7);c.closePath();c.fill();c.restore();
 }
 /**
  * PLAN-POLICE W4: five stars beside the health bar, solid while the police can see the player
  * and flashing while they search; a short banner the first time each level is reached.
  */
 function setWanted(w,dt=0){
  if(disposed||!w)return;
  const n=w.stars|0;
  wanted.dataset.stars=String(n);wanted.dataset.flash=String(!!w.flashing);
  wanted.setAttribute('aria-label',`手配度 ${n}${w.flashing?'（捜索中）':''}`);
  stars.forEach((s,i)=>{s.dataset.on=String(i<n);});
  if(w.roseSeq&&w.roseSeq!==bannerSeq){bannerSeq=w.roseSeq;banner.textContent=`手配度 ☆${w.rose||n}`;banner.hidden=false;bannerFor=2.5;}
  if(bannerFor>0){bannerFor-=dt;if(bannerFor<=0)banner.hidden=true;}
 }
 /** PLAN-WEAPONS: the weapon out, the magazine, and the crosshair (on a person when locked). */
 const NAMES={fists:'素手',pistol:'ピストル',katana:'日本刀'};
 function setWeapon(w,{aiming=false,locked=false}={}){
  if(disposed||!w)return;
  weaponLabel.dataset.weapon=w.current;
  weaponLabel.textContent=w.current==='pistol'?`${NAMES.pistol} ${w.reloading?'装填中':`${w.rounds}/${w.magazine}`}`:(NAMES[w.current]??w.current);
  crosshair.hidden=!(aiming&&w.current==='pistol');crosshair.dataset.locked=String(!!locked);
 }
 return {mission,setWanted,setWeapon,show(){visible=true;root.hidden=false;clock=1;},hide(){visible=false;root.hidden=true;marker.hide();mission.cancel();},
  update(dt,position,car,driving,entry,hits=0){if(disposed||!visible)return;current=position;mission.tick(dt,position,{driving,alive:position.alive,hits});const s=mission.snapshot();
   if(s.target)marker.update({x:s.target.x,z:s.target.z,y:network.ctx.height(s.target.x,s.target.z)},dt,2.4);else marker.hide();
   clock+=dt;if(clock<.2)return;clock=0;draw(position,car,s.target);
   speed.textContent=driving?`${Math.round(Math.abs(car?.speed??0)*3.6)} km/h`:position.speed>2.5?'走行中':'徒歩';
   {const hp=Math.max(0,Math.min(100,Math.round(position.health??100)));
    // Four blows either way (combat.mjs), so the bar reads in quarters: green, amber at half,
    // red on the last quarter.
    healthBar.style.width=hp+'%';healthValue.textContent=String(hp);health.setAttribute('aria-valuenow',String(hp));
    health.dataset.level=hp>50?'ok':hp>25?'low':'critical';}
   damage.textContent=car?.active?`損傷 ${Math.round((car.damage??0)*100)}%`:'';
   drive.textContent=driving?'降りる · F':entry?.inRange?(entry.kind==='steal'?'奪う · F':'乗る · F'):entry?`車まで ${Math.ceil(entry.distance)}m`:'車を探す';drive.disabled=position.alive===false||(!driving&&!entry?.inRange);
   cancel.hidden=s.status!=='running';start.hidden=s.status==='running';start.disabled=position.alive===false;progress.hidden=s.status!=='running';progress.value=s.progress;
   timer.textContent=s.status==='running'?`${Math.floor(Math.ceil(s.remaining)/60)}:${String(Math.ceil(s.remaining)%60).padStart(2,'0')} · ${s.index}/${s.total}`:'';
   if(s.status==='running')task.textContent=`${s.target.label} · ${Math.round(Math.hypot(position.x-s.target.x,position.z-s.target.z))}m ｜ 降車して1秒ほど停止`;
   else if(s.status==='complete'){task.textContent=`配達完了！ ${s.score}点 · ${s.elapsed.toFixed(1)}秒 · 接触 ${s.contacts}回`;start.textContent='もう一度配達';}
   else if(s.status==='failed'){task.textContent=`${s.reason}。もう一度挑戦できます。`;start.textContent='再挑戦';}
   else if(s.status==='unavailable')task.textContent='この場所から配達ルートを作れません。交差点付近で再度お試しください。';
   else{task.textContent='徒歩と車で3か所へ。降車して停止すると配達できます。';start.textContent='配送を始める';}
  },dispose(){if(disposed)return;disposed=true;marker.dispose();root.remove();canvas.width=0;map.width=0;}};
}
