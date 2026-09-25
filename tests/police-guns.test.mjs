// PLAN-WEAPONS W3: police revolvers -- line of sight (R9) and the Japanese rules of fire (R15).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPoliceGuns,GUNS,hitChance} from '../src/police/guns.mjs';
import {officersSee,officersOnFootSee,createPoliceDirector} from '../src/police/director.mjs';
import {POLICE_LINES,policeLine,ONSETS} from '../src/player/voices.mjs';
import {createOfficerVoice} from '../src/police/siren.mjs';

const officer=(id,x,z,extra={})=>({id,x,z,active:true,officer:true,combatDead:false,heading:Math.atan2(-x,-z),...extra});
const me={x:0,z:0,y:0};
/** Run the guns for `seconds` at 30 Hz and collect every event. */
function run(guns,seconds,frame){
 const all=[];for(let t=0;t<seconds;t+=1/30)all.push(...guns.update(1/30,frame()));return all;
}

test('R15: at ☆1 and ☆2 the revolvers stay holstered, whatever the player does',()=>{
 for(const stars of [1,2]){
  const guns=createPoliceGuns(),p=officer(1,0,8);
  const events=run(guns,10,()=>({officers:[p],me,stars,threat:{armed:true,attacking:true}}));
  assert.equal(events.length,0,`☆${stars}: ${events.map(e=>e.kind).join(',')}`);
  assert.ok(!p.gunDrawn);
 }
});

test('R15: at ☆3 officers draw, and the first round is a warning shot into the air with 撃つぞ！',()=>{
 const guns=createPoliceGuns(),p=officer(1,0,8);
 const events=run(guns,6,()=>({officers:[p],me,stars:3,threat:{armed:true}}));
 const kinds=events.map(e=>e.kind);
 assert.equal(kinds[0],'draw');
 const firstRound=events.find(e=>e.kind==='warn'||e.kind==='shot');
 assert.equal(firstRound.kind,'warn','the first round was aimed at the player');
 assert.ok(firstRound.to.y-firstRound.from.y>20,'the warning shot was not into the air');
 assert.ok(events.some(e=>e.kind==='shout'&&e.line==='warn'),'no 撃つぞ！');
 assert.ok(events.some(e=>e.kind==='shout'&&e.line==='dropGun'),'no 銃を捨てろ！ to an armed player');
 const w=events.indexOf(firstRound),shots=events.filter(e=>e.kind==='shot');
 assert.ok(shots.length>0,'an armed player was never fired on');
 assert.ok(events.indexOf(shots[0])>w,'fired before the warning');
});

test('R15: after the warning, a player who is no threat is covered, not shot',()=>{
 const guns=createPoliceGuns(),p=officer(1,0,8);
 const events=run(guns,12,()=>({officers:[p],me,stars:3,threat:{armed:false,attacking:false}}));
 assert.equal(events.filter(e=>e.kind==='warn').length,1);
 assert.equal(events.filter(e=>e.kind==='shot').length,0,'an unarmed, still player was fired on');
 assert.ok(guns.snapshot().held>0);
 // An attack makes them a threat for a while; then they stop again.
 const g2=createPoliceGuns();let t=0;
 const ev=[];for(;t<10;t+=1/30)ev.push(...g2.update(1/30,{officers:[p],me,stars:3,threat:{attacking:t>3&&t<3.1}}));
 const shots=ev.filter(e=>e.kind==='shot');
 assert.ok(shots.length>0,'an attack did not draw fire');
});

test('R9: no police shot without a line of sight -- a building between them blocks every round',()=>{
 const wall=(x,z)=>z>3&&z<5;                 // a building between the officer (z 8) and the player (z 0)
 const guns=createPoliceGuns(),p=officer(1,0,8);
 const events=run(guns,10,()=>({officers:[p],me,stars:4,solid:wall,threat:{armed:true,attacking:true}}));
 assert.equal(events.filter(e=>e.kind==='warn'||e.kind==='shot').length,0,'fired through a building');
 assert.ok(guns.snapshot().blocked>0);
 assert.equal(p.gunAim,0,'aiming at someone they cannot see');
 // Step out from behind it and the rules resume, warning first.
 p.x=12;p.z=0;
 const after=run(guns,4,()=>({officers:[p],me,stars:4,solid:wall,threat:{armed:true}}));
 assert.equal(after.find(e=>e.kind==='warn'||e.kind==='shot')?.kind,'warn');
});

test('R9: the police cannot see through buildings -- patrol cars and officers on foot',()=>{
 const wall=(x,z)=>z>3&&z<5;
 const car={active:true,type:'police',x:0,z:10};
 assert.ok(officersSee([car],0,0),'without a wall test the old radius still sees');
 assert.ok(!officersSee([car],0,0,null,undefined,wall),'a patrol car saw through a building');
 assert.ok(officersSee([car],0,0,null,undefined,()=>false));
 const p=officer(1,0,10);
 assert.ok(!officersOnFootSee([p],0,0,undefined,wall),'an officer on foot saw through a building');
 assert.ok(officersOnFootSee([p],0,0,undefined,()=>false));
});

test('accuracy falls with distance; a hit does 10-15',()=>{
 assert.ok(hitChance(3)>hitChance(20)&&hitChance(20)>hitChance(40));
 assert.ok(hitChance(200)>=GUNS.hit[1]-1e-9);
 const guns=createPoliceGuns(),near=officer(1,0,6);
 const events=run(guns,40,()=>({officers:[near],me,stars:3,threat:{armed:true}})).filter(e=>e.kind==='shot');
 const hits=events.filter(e=>e.hit);
 assert.ok(hits.length>0&&hits.length<events.length,'every round hit or none did');
 for(const h of hits)assert.ok(h.damage>=10&&h.damage<=15,`a hit for ${h.damage}`);
});

test('the level clearing holsters everything and forgets the warning',()=>{
 const guns=createPoliceGuns(),p=officer(1,0,8);
 run(guns,4,()=>({officers:[p],me,stars:3,threat:{armed:true}}));
 assert.ok(guns.warned&&p.gunDrawn);
 guns.update(1/30,{officers:[p],me,stars:0});
 assert.ok(!p.gunDrawn&&!guns.warned);
});

test('the new lines exist in the formant voice: 銃を捨てろ！ and 撃つぞ！ (kind police)',()=>{
 for(const [situation,tag] of [['dropGun','銃を捨てろ！'],['warn','撃つぞ！']]){
  const l=policeLine(situation);
  assert.equal(l?.tag,tag);assert.equal(l.kind,'police');
  for(const seg of l.segs)if(seg.on)assert.ok(Object.hasOwn(ONSETS,seg.on),`${tag}: onset ${seg.on}`);
 }
 assert.ok(POLICE_LINES.length>=8);
});

test('an officer shouts without a loudspeaker, never twice inside the gap, and is silent without audio',()=>{
 const made=[];
 const node=()=>({connect(n){made.push(n);return n;},disconnect(){},gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}},
  frequency:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},Q:{value:0},type:'',start(){},stop(){},
  positionX:{value:0},positionY:{value:0},positionZ:{value:0},buffer:null,playbackRate:{value:1}});
 const ctx={currentTime:0,state:'running',sampleRate:44100,createOscillator:node,createGain:node,createBiquadFilter:node,createPanner:node,
  createBufferSource:node,createBuffer:()=>({getChannelData:()=>new Float32Array(10)}),createWaveShaper:()=>{throw new Error('a shout has no loudspeaker');},createDelay:()=>{throw new Error('a shout has no slapback');}};
 const voice=createOfficerVoice(()=>ctx,()=>node());
 assert.ok(voice.shout('warn',1,0,5,0));
 assert.equal(voice.shout('warn',1,0,5,.5),null,'repeated inside the gap');
 const silent=createOfficerVoice(()=>null,()=>null);
 assert.equal(silent.shout('dropGun',1,0,0,0),null);
});

test('the director draws, warns and fires through its frame, and a hit hurts the player',()=>{
 const director=createPoliceDirector({getAudioContext:()=>null,getAudioBus:()=>null,speech:null});
 const p=officer(1,0,8);
 director.units.officers.add(p);
 director.wanted.crime('policeCarTaken',{x:0,z:0,t:0});
 assert.equal(director.wanted.state.stars,3);
 let hurt=0;const events=[];
 for(let t=0;t<20;t+=1/30){
  const w=director.frame(1/30,{player:{x:0,z:0,y:0,alive:true},weapons:{current:'pistol',shots:0},solid:()=>false,hurt:n=>{hurt+=n;}});
  events.push(...(w.gunfire??[]));
 }
 assert.ok(events.some(e=>e.kind==='warn'),'no warning shot');
 assert.ok(events.some(e=>e.kind==='shot'),'never fired on an armed player at ☆3');
 assert.ok(hurt>0,'a hit did not hurt the player');
});
