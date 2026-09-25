import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseASF,parseAMC,forwardASF,UNIT} from '../scripts/cmu/asf.mjs';
import {PRESETS} from '../scripts/cmu/weapon-clip.mjs';

// The two-handed trial (GTA-FIDELITY-STATUS §9af). The CMU files are not committed, so the reader
// is checked on a two-line skeleton whose answer is known, and the baked clips on what they
// claim about themselves.

const ASF=`:units
  length 0.45
  angle deg
:root
   order TX TY TZ RX RY RZ
:bonedata
  begin
     id 1
     name arm
     direction 1 0 0
     length 0.45
     axis 0 0 0  XYZ
    dof rx ry rz
  end
:hierarchy
  begin
    root arm
  end
`;

test('ASF lengths are in 1/0.45 inch, and a bone composes its dofs Rz * Ry * Rx',()=>{
 const bones=parseASF(ASF);
 assert.ok(Math.abs(bones.get('arm').length-.0254)<1e-9,'0.45 units is one inch');
 const pose=frame=>forwardASF(bones,parseAMC(`:FULLY-SPECIFIED\n1\nroot 0 0 0 0 0 0\narm ${frame}\n`)[0]).get('arm').end;
 const flat=pose('0 0 90');
 assert.ok(flat.distanceTo({x:0,y:.0254,z:0})<1e-9,`rz 90 turns +X to +Y (${flat.toArray()})`);
 // Rx first, then Rz: +X is untouched by Rx and then turned to +Y. Composed the other way
 // round it would end on +Z.
 const both=pose('90 0 90');
 assert.ok(both.distanceTo({x:0,y:.0254,z:0})<1e-9,`rx 90, rz 90 ends on +Y, not +Z (${both.toArray()})`);
 assert.equal(UNIT,.0254/.45);
});

const load=id=>JSON.parse(readFileSync(`assets/character/cmu-weapons/${id}.json`,'utf8'));

for(const id of Object.keys(PRESETS)){
 test(`${id}: the baked clip is well formed and says where it came from`,()=>{
  const clip=load(id),n=clip.times.length;
  assert.equal(clip.preset,id);
  assert.match(clip.source.dataset,/mocap\.cs\.cmu\.edu/);
  assert.match(clip.source.asfSha256,/^[0-9a-f]{64}$/);assert.match(clip.source.amcSha256,/^[0-9a-f]{64}$/);
  for(let i=1;i<n;i++)assert.ok(clip.times[i]>clip.times[i-1],'times increase');
  assert.equal(clip.rootPos.length,n*3);
  for(const [bone,v] of Object.entries(clip.tracks)){
   assert.equal(v.length,n*4,bone);
   for(let i=0;i<n;i++){const l=Math.hypot(v[i*4],v[i*4+1],v[i*4+2],v[i*4+3]);assert.ok(Math.abs(l-1)<1e-3,`${bone} key ${i} is a unit quaternion`);}
  }
 });
}

test('katana: both hands stay on the handle, 0.15 m apart, the take mirrored to a right-hand lead',()=>{
 const clip=load('katana-cut');
 assert.equal(PRESETS['katana-cut'].mirror,true,'02_07 leads with the left hand; the game\'s katana is in the right');
 assert.ok(clip.measured.handsApartTargetM>=.12&&clip.measured.handsApartTargetM<=.2,`hands ${clip.measured.handsApartTargetM} m apart`);
 assert.ok(clip.measured.leftMissCm<=6,`the left palm misses its place on the handle by ${clip.measured.leftMissCm} cm`);
});

test('the shouldered hold: the gun level, the butt in the shoulder, the left hand on the fore-end',()=>{
 const clip=load('rifle-shouldered');
 assert.ok(clip.perKey.elevationDeg.every(e=>e===0),'levelled');
 assert.ok(clip.perKey.buttToShoulderM.every(d=>d<.08),'the butt within 8 cm of the shoulder joint');
 assert.equal(clip.measured.leftMissCm,0);
 // The capture as taken holds the gun high and off the shoulder: that is why the variant exists.
 const raw=load('rifle-raise'),hold=raw.perKey.elevationDeg.slice(-60);
 assert.ok(hold.reduce((a,b)=>a+b,0)/hold.length>10,'80_03 aims more than 10° up');
});
