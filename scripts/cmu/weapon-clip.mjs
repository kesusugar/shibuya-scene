// The two-handed trial: a CMU capture onto the game's humanoid, with both hands put on the
// weapon. Offline only; the output is a JSON of quaternion tracks the bench turns into a clip.
// Nothing here is wired into the game.
//
//   node scripts/cmu/weapon-clip.mjs <dir with the .asf/.amc> <preset> <out.json>
//
// Presets (below) name a trial, a window and the weapon. The CMU files are fetched from
// mocap.cs.cmu.edu into a scratch directory and never committed (the RUN 5.6 rule: convert only
// what is used, never ship the raw data).
//
// Three stages per key:
//
// 1. Rotations. Each mapped bone gets the SOURCE bone's turn from rest applied to the TARGET's
//    rest -- RUN 5.6's rest correction. In ASF the rest turn is simply the world rotation (see
//    asf.mjs), and both rigs rest in a T facing +Z, so nothing else is needed.
// 2. The weapon. A retarget gets the pose; it does not get the object. The two rigs' arms differ
//    in length and shoulder height (RUN 5.7 measured the shoulder chain 10° high), so two hands
//    that met on a handle in the capture miss it on the character. The weapon's axis is taken
//    from the SOURCE hands -- the one thing the capture measures reliably about the object --
//    and the right hand is turned to hold it along that axis. The left hand is then placed on the
//    weapon by two-bone IK: on the handle behind the right fist (katana), or on the fore-end
//    ahead of it (long gun).
// 3. The root: the source's hip height and travel, scaled by the ratio of the two rigs' hip
//    heights, then the whole clip lowered once so its lowest sole meets the floor (RUN 5.6).
//
// Every number the bench shows comes out of here: how far the left palm ends from its target
// (the IK's miss), and how far each wrist had to bend from the retarget to hold the weapon.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Quaternion,Vector3,Matrix4} from 'three';
import {parseASF,parseAMC,forwardASF,restHipHeight} from './asf.mjs';
import {GRIP} from '../../src/player/weapons.mjs';

globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

/** ASF bone -> the character's bone. Parents before children. */
export const ASF_MAP=Object.freeze({
 root:'pelvis',lowerback:'spine_01',upperback:'spine_02',thorax:'spine_03',lowerneck:'neck_01',head:'Head',
 lclavicle:'clavicle_l',lhumerus:'upperarm_l',lradius:'lowerarm_l',lhand:'hand_l',
 rclavicle:'clavicle_r',rhumerus:'upperarm_r',rradius:'lowerarm_r',rhand:'hand_r',
 lfemur:'thigh_l',ltibia:'calf_l',lfoot:'foot_l',ltoes:'ball_l',
 rfemur:'thigh_r',rtibia:'calf_r',rfoot:'foot_r',rtoes:'ball_r'
});

/**
 * The trials. Times are seconds into the take (02 is 120 fps, 80 is 60 fps -- both read from the
 * site's index, which the AMC does not carry).
 *
 * katana: 02_07 holds its hands 0.14-0.23 m apart for the whole take, and 6.8-7.6 s is an
 *   overhead cut from above the head to below the hips. The subject holds the sword with the
 *   LEFT hand at the guard (the left-to-right hand line points back at the chest in 170 of 188
 *   samples), and the game's katana is in the right hand, so the take is mirrored left for
 *   right. The left hand then goes 0.15 m behind the right fist on the 0.26 m handle.
 * rifle: 80_03 raises a long gun and holds the aim from 4.5 s to 7 s with the hands 0.44 m
 *   apart, the left ahead. The left hand goes on the fore-end at the source's own spacing.
 */
export const PRESETS=Object.freeze({
 'katana-cut':{trial:'02_07',subject:'02',fps:120,from:6.2,to:8.4,weapon:'katana',left:-.15,mirror:true},
 'rifle-raise':{trial:'80_03',subject:'80',fps:60,from:1.9,to:7.0,weapon:'rifle'},
 // The same take's held aim, with the stock put in the shoulder and the barrel levelled (both
 // arms by IK): the capture holds the gun 17° high and in front of the chest. With the stock
 // pulled back to the shoulder the left hand no longer reaches the source's 0.46 m fore-end
 // (13 cm short on this body's 0.48 m arm), so the support hand goes 0.28 m ahead of the grip:
 // a short weapon's fore-end, which is what a submachine gun would have.
 'rifle-shouldered':{trial:'80_03',subject:'80',fps:60,from:4.2,to:6.8,weapon:'rifle',shoulder:true,spacing:.28}
});

// A long gun is held by its pistol grip as the pistol is: the same frame in the right hand.
const GRIPS={katana:GRIP.katana,rifle:GRIP.pistol};

const basis=(forward,up)=>{
 const z=forward.clone().normalize(),x=up.clone().cross(z).normalize(),y=z.clone().cross(x);
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
};
// The left hand is the right one mirrored in the body's sagittal plane; in hand space that is
// (x, y, z) -> (-x, y, z) (hand_r rests at +90° about Z, hand_l at -90°).
const mirror=v=>new Vector3(-v[0],v[1],v[2]);
/** A source pose mirrored in its own sagittal plane (x -> -x), left and right swapped. */
const swap=n=>/^l[a-z]/.test(n)&&n!=='lowerback'&&n!=='lowerneck'?'r'+n.slice(1):/^r[a-z]/.test(n)&&n!=='root'?'l'+n.slice(1):n;
function mirrored(pose){
 const out=new Map();
 const flip=v=>new Vector3(-v.x,v.y,v.z);
 for(const [n,j] of pose){const r=j.rotation;
  out.set(swap(n),{rotation:new Quaternion(r.x,-r.y,-r.z,r.w),start:flip(j.start),end:flip(j.end)});}
 return out;
}
/** The segment each target bone's rest direction is measured along: bone -> child. */
const SEGMENT=Object.freeze({spine_01:'spine_02',spine_02:'spine_03',spine_03:'neck_01',neck_01:'Head',
 clavicle_l:'upperarm_l',upperarm_l:'lowerarm_l',lowerarm_l:'hand_l',clavicle_r:'upperarm_r',upperarm_r:'lowerarm_r',lowerarm_r:'hand_r',
 thigh_l:'calf_l',calf_l:'foot_l',foot_l:'ball_l',thigh_r:'calf_r',calf_r:'foot_r',foot_r:'ball_r'});
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.dot(b))))*180/Math.PI;

function worldQuat(bone){bone.updateWorldMatrix(true,false);return new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(bone.matrixWorld));}
function setWorldQuat(bone,q){
 const parent=worldQuat(bone.parent);
 bone.quaternion.copy(parent.invert().multiply(q));
 bone.updateMatrixWorld(true);
}
const pos=bone=>{bone.updateWorldMatrix(true,false);return new Vector3().setFromMatrixPosition(bone.matrixWorld);};

/** Two-bone IK: move `c`'s origin (the wrist) to `target`, keeping the elbow in its plane. */
function reach(a,b,c,target){
 const A=pos(a),B=pos(b),C=pos(c);
 const la=A.distanceTo(B),lb=B.distanceTo(C);
 const d=Math.min(la+lb-1e-4,Math.max(Math.abs(la-lb)+1e-4,A.distanceTo(target)));
 // The elbow: its current bend about the plane's normal, changed to the bend that gives d.
 const n=new Vector3().subVectors(B,A).cross(new Vector3().subVectors(C,B));
 if(n.lengthSq()<1e-10)n.set(0,1,0);n.normalize();
 const now=new Vector3().subVectors(A,B).angleTo(new Vector3().subVectors(C,B));
 const want=Math.acos(Math.min(1,Math.max(-1,(la*la+lb*lb-d*d)/(2*la*lb))));
 setWorldQuat(b,new Quaternion().setFromAxisAngle(n,now-want).multiply(worldQuat(b)));
 // The shoulder: swing the whole arm so the wrist lands on the target.
 const C2=pos(c);
 const swing=new Quaternion().setFromUnitVectors(C2.sub(A).normalize(),target.clone().sub(A).normalize());
 setWorldQuat(a,swing.multiply(worldQuat(a)));
 return pos(c).distanceTo(target);
}

export async function weaponClip({dir,preset,glbPath='public/data/character/citizen.glb',fps=30}){
 const P=PRESETS[preset];if(!P)throw new Error(`unknown preset ${preset}`);
 const asfText=readFileSync(`${dir}/${P.subject}.asf`,'utf8'),amcText=readFileSync(`${dir}/${P.trial}.amc`,'utf8');
 const skeleton=parseASF(asfText),frames=parseAMC(amcText);

 const bytes=readFileSync(glbPath);
 const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const root=gltf.scene;root.updateMatrixWorld(true);
 const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 const tgtRest=new Map();
 for(const ue of Object.values(ASF_MAP))tgtRest.set(ue,worldQuat(bones.get(ue)));
 const bind=new Map([...bones].map(([n,b])=>[n,b.quaternion.clone()]));
 // The two rests are both T poses, but not the same T: CMU's thighs splay 20° out and its
 // clavicles run a different line. Copying turns from rest onto a different rest carries that
 // difference into every frame (crossed legs, the RUN 5.7 shoulder). So each target bone is
 // first swung, at rest, onto the source bone's rest direction; the turn is applied after.
 const align=new Map();
 const flipX=P.mirror?v=>new Vector3(-v.x,v.y,v.z):v=>v;
 const asfOf=Object.fromEntries(Object.entries(ASF_MAP).map(([a,u])=>[u,a]));
 for(const [ue,child] of Object.entries(SEGMENT)){
  // Mirrored, the target's left bone follows the source's right one.
  const asf=P.mirror?swap(asfOf[ue]):asfOf[ue];
  const src=flipX(skeleton.get(asf).direction.clone()).normalize();
  const tgt=pos(bones.get(child)).sub(pos(bones.get(ue))).normalize();
  align.set(ue,new Quaternion().setFromUnitVectors(tgt,src));
 }

 // Scale for travel and height: the two rigs' hip heights at rest.
 const k=pos(bones.get('pelvis')).y/restHipHeight(skeleton);

 // Face +Z. The long gun: the yaw that turns the weapon's mean horizontal direction over the
 // window's second half (the held aim) onto +Z. The katana: the chest's mean facing over the
 // window, since a follow-through's blade can point anywhere and the body is what the game turns.
 const at=t=>frames[Math.min(frames.length-1,Math.round(t*P.fps))];
 const pose=frame=>P.mirror?mirrored(forwardASF(skeleton,frame)):forwardASF(skeleton,frame);
 const axisOf=src=>{
  const L=src.get('lhand').end,R=src.get('rhand').end;
  return P.weapon==='katana'?R.clone().sub(L):L.clone().sub(R);
 };
 const mean=new Vector3();
 if(P.weapon==='katana')for(let t=P.from;t<=P.to;t+=.05)mean.add(new Vector3(0,0,1).applyQuaternion(pose(at(t)).get('thorax').rotation).setY(0).normalize());
 else for(let t=(P.from+P.to)/2;t<=P.to;t+=.05)mean.add(axisOf(pose(at(t))).setY(0).normalize());
 // atan2(x, z) is the heading of `mean`; turning by minus that heading brings it onto +Z.
 const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.atan2(mean.x,mean.z));
 const start=pose(at(P.from)).get('root').start.clone();

 // The fore-end spacing for the long gun: the source's own, median over the window, scaled.
 let spacing=0;
 if(P.weapon==='rifle'){
  const d=[];for(let t=P.from;t<P.to;t+=.05){const s=pose(at(t));d.push(s.get('lhand').end.distanceTo(s.get('rhand').end));}
  d.sort((a,b)=>a-b);spacing=P.spacing??d[d.length>>1]*k;
 }
 const grip=GRIPS[P.weapon];
 const gripR=basis(new Vector3(...grip.forward),new Vector3(...grip.up));
 const gripL=basis(mirror(grip.forward),mirror(grip.up)),atL=mirror(grip.at);

 const duration=P.to-P.from,steps=Math.max(2,Math.round(duration*fps)+1);
 const times=[],tracks=new Map(Object.values(ASF_MAP).map(n=>[n,[]])),rootPos=[];
 const stats={leftMiss:0,wristR:0,wristL:0,handsSource:[],handsTarget:[],wristBend:{r:[],l:[]},elevation:[],butt:[]};
 // The long gun's butt, in the weapon frame (the bench's proxy has the same stock).
 const BUTT=new Vector3(0,.04,-.33);
 for(let s=0;s<steps;s++){
  const t=s/(steps-1)*duration;times.push(t);
  const src=pose(at(P.from+t));
  for(const [n,b] of bones)b.quaternion.copy(bind.get(n));
  // 1. Rotations, parents first.
  for(const [asf,ue] of Object.entries(ASF_MAP)){
   const turn=yaw.clone().multiply(src.get(asf).rotation);
   setWorldQuat(bones.get(ue),turn.multiply(align.get(ue)??new Quaternion()).multiply(tgtRest.get(ue)));
  }
  // 3 (first half). The pelvis: scaled travel from the window's start, turned with the yaw.
  const hip=src.get('root').start.clone().sub(start).applyQuaternion(yaw).multiplyScalar(k);
  const pelvis=bones.get('pelvis'),world=new Vector3(hip.x,start.y*k+hip.y,hip.z);
  pelvis.position.copy(pelvis.parent.worldToLocal(world));
  root.updateMatrixWorld(true);

  // 2. The weapon.
  const L=src.get('lhand').end.clone().applyQuaternion(yaw),R=src.get('rhand').end.clone().applyQuaternion(yaw);
  stats.handsSource.push(L.distanceTo(R));
  const axis=(P.weapon==='katana'?R.clone().sub(L):L.clone().sub(R)).normalize();
  let up;
  if(P.weapon==='katana'){
   // The edge leads in the plane of the cut: perpendicular to the blade, across the chest's
   // right-left line (edge down at the middle guard, forward when raised overhead).
   const right=new Vector3(-1,0,0).applyQuaternion(yaw.clone().multiply(src.get('thorax').rotation));
   up=axis.clone().cross(right);
  }else{
   up=new Vector3(0,1,0).addScaledVector(axis,-axis.y);
  }
  if(P.shoulder){axis.setY(0).normalize();up.set(0,1,0);}
  const weapon=basis(axis,up);
  const handR=bones.get('hand_r'),handL=bones.get('hand_l');
  const before=worldQuat(handR);
  const wantR=weapon.clone().multiply(gripR.clone().invert());
  if(P.shoulder){
   // The butt in the shoulder pocket: 5 cm in front of the shoulder joint and 3 cm in toward
   // the chest, level with it. The grip is then where the stock puts it, and the right arm is
   // taken there by the same IK as the left.
   const chest=yaw.clone().multiply(src.get('thorax').rotation);
   const pocket=pos(bones.get('upperarm_r')).addScaledVector(new Vector3(0,0,1).applyQuaternion(chest),.05).addScaledVector(new Vector3(1,0,0).applyQuaternion(chest),.03);
   const origin=pocket.sub(BUTT.clone().applyQuaternion(weapon));
   const scaleR=new Vector3();handR.getWorldScale(scaleR);
   reach(bones.get('upperarm_r'),bones.get('lowerarm_r'),handR,origin.clone().sub(new Vector3(...grip.at).multiply(scaleR).applyQuaternion(wantR)));
  }
  setWorldQuat(handR,wantR);
  stats.wristR=Math.max(stats.wristR,angle(before,worldQuat(handR)));
  const origin=handR.localToWorld(new Vector3(...grip.at));
  const target=origin.clone().addScaledVector(axis,P.weapon==='katana'?P.left:spacing);
  const wantL=weapon.clone().multiply(gripL.clone().invert());
  const beforeL=worldQuat(handL);
  // Where the wrist must be for the left grip point to land on the target with that rotation.
  const scale=new Vector3();handL.getWorldScale(scale);
  const wrist=target.clone().sub(atL.clone().multiply(scale).applyQuaternion(wantL));
  reach(bones.get('upperarm_l'),bones.get('lowerarm_l'),handL,wrist);
  setWorldQuat(handL,wantL);
  stats.wristL=Math.max(stats.wristL,angle(beforeL,worldQuat(handL)));
  stats.leftMiss=Math.max(stats.leftMiss,handL.localToWorld(atL.clone()).distanceTo(target));
  stats.handsTarget.push(handL.localToWorld(atL.clone()).distanceTo(origin));
  // How far each wrist is from its own rest, relative to the forearm (the angle a hand bends
  // and twists at the wrist to hold the weapon).
  stats.wristBend.r.push(angle(handR.quaternion,bind.get('hand_r')));
  stats.wristBend.l.push(angle(handL.quaternion,bind.get('hand_l')));
  stats.elevation.push(Math.asin(axis.y)*180/Math.PI);
  if(P.weapon==='rifle')stats.butt.push(BUTT.clone().applyQuaternion(weapon).add(origin).distanceTo(pos(bones.get('upperarm_r'))));

  for(const [ue,v] of tracks){const q=bones.get(ue).quaternion;v.push(q.x,q.y,q.z,q.w);}
  rootPos.push(pelvis.position.x,pelvis.position.y,pelvis.position.z);
 }

 // 3 (second half). Ground the clip once: the lowest ball of the foot across it onto the floor.
 const BALL_TO_SOLE=.0215;
 let lowest=Infinity;
 for(let s=0;s<steps;s++){
  for(const [ue,v] of tracks)bones.get(ue).quaternion.fromArray(v,s*4);
  bones.get('pelvis').position.fromArray(rootPos,s*3);root.updateMatrixWorld(true);
  lowest=Math.min(lowest,pos(bones.get('ball_l')).y-BALL_TO_SOLE,pos(bones.get('ball_r')).y-BALL_TO_SOLE);
 }
 const pelvis=bones.get('pelvis');
 const lift=pelvis.parent.worldToLocal(new Vector3(0,-lowest,0)).sub(pelvis.parent.worldToLocal(new Vector3()));
 for(let s=0;s<steps;s++){rootPos[s*3]+=lift.x;rootPos[s*3+1]+=lift.y;rootPos[s*3+2]+=lift.z;}

 const sha=text=>createHash('sha256').update(text).digest('hex');
 const med=a=>[...a].sort((x,y)=>x-y)[a.length>>1];
 return {
  source:{dataset:'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu)',trial:P.trial,
   asf:`${P.subject}.asf`,asfSha256:sha(asfText),amc:`${P.trial}.amc`,amcSha256:sha(amcText),from:P.from,to:P.to,fps:P.fps},
  preset,weapon:P.weapon,duration,fps,times,scale:k,groundOffset:-lowest,spacing,
  measured:{leftMissCm:+(stats.leftMiss*100).toFixed(1),wristTurnMaxDeg:{right:+stats.wristR.toFixed(0),left:+stats.wristL.toFixed(0)},
   handsApartSourceM:+med(stats.handsSource).toFixed(3),handsApartTargetM:+med(stats.handsTarget).toFixed(3),
   wristBendDeg:{right:{median:+med(stats.wristBend.r).toFixed(0),max:+Math.max(...stats.wristBend.r).toFixed(0)},left:{median:+med(stats.wristBend.l).toFixed(0),max:+Math.max(...stats.wristBend.l).toFixed(0)}}},
  perKey:{elevationDeg:stats.elevation.map(x=>+x.toFixed(1)),...(stats.butt.length?{buttToShoulderM:stats.butt.map(x=>+x.toFixed(3))}:{})},
  tracks:Object.fromEntries(tracks),rootPos
 };
}

if(process.argv[1].endsWith('weapon-clip.mjs')){
 const [,,dir,preset,out]=process.argv;
 if(!out){console.error(`usage: weapon-clip.mjs <cmu dir> <${Object.keys(PRESETS).join('|')}> <out.json>`);process.exit(1);}
 const clip=await weaponClip({dir,preset});
 mkdirSync(dirname(out),{recursive:true});
 const round=a=>a.map(x=>+x.toFixed(5));
 writeFileSync(out,JSON.stringify({...clip,times:round(clip.times),rootPos:round(clip.rootPos),
  tracks:Object.fromEntries(Object.entries(clip.tracks).map(([k,v])=>[k,round(v)]))})+'\n');
 console.log(`${out}: ${clip.duration.toFixed(2)} s, ${clip.times.length} keys, scale ${clip.scale.toFixed(3)}, grounded ${(clip.groundOffset*1000).toFixed(0)} mm`,JSON.stringify(clip.measured));
}
