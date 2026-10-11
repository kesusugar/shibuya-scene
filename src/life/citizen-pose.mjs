/**
 * Look 2b (docs/GTA-LOOK.md): the crowd's clips on a citizen's OWN skeleton, standing like a
 * person rather than a superhero.
 *
 * Two problems the owner saw, and measured:
 *  - "Gundam bodies". The citizens were stretched onto the Quaternius superhero skeleton: shoulders
 *    42.4 cm apart against a MakeHuman man's 36.8 and a woman's 30.5. Now every citizen keeps their
 *    own skeleton (scripts/blender/build-citizens.py: the crowd skeleton's bones and orientations at
 *    the citizen's own joints), and a clip is handed over as rotations only -- the way a game with
 *    one skeleton and many body proportions does it. The pelvis height is the one translation kept,
 *    scaled by leg length.
 *  - "Everyone leans forward at the lights". The Quaternius Idle is a fighter's ready stance: the
 *    body 7-9 degrees forward, knees bent to 153-159, pelvis 7 cm down, arms 20-23 degrees out from
 *    the body; its Walk leans 11-12 degrees. STANCE straightens them -- spine back, knees towards
 *    straight with the feet kept on the ground, arms in towards the body -- and the crowd's Guard
 *    (a 49-degree crouch played by anyone wary but standing) becomes a wary upright Idle.
 *
 * `citizenClips` returns new clips; nothing here touches the RUN 6.8 bodies or the player.
 */
import {AnimationClip,AnimationMixer,QuaternionKeyframeTrack,VectorKeyframeTrack,Quaternion,Vector3} from 'three';

/** Degrees of lean taken out, the share of knee bend taken out, degrees the arms come in. */
// `lean` is the TARGET: degrees the line pelvis -> neck leans forward of the body's own rest
// line (a person stands about upright and walks a few degrees forward). Only lean beyond it is
// taken out, never added. `ground`: 'frame' keeps the lowest foot on its rest height every frame
// (standing and walking: a foot is always down), 'mean' shifts the whole clip once (running has
// a flight phase).
export const STANCE=Object.freeze({
 Idle:   {lean:1.5,knees:.8, arms:13,ground:'frame'},
 Walk:   {lean:4,  knees:0,  arms:8, ground:'frame'},
 Run:    {lean:14, knees:0,  arms:10,ground:'mean'},
 Startle:{lean:6,  knees:0,  arms:6, ground:'frame'},
 // Wary but standing: from the Idle, not the crouch.
 Guard:  {from:'Idle',lean:3,knees:.6,arms:8,ground:'frame'}
});
/**
 * The motion-captured idles and walks (src/life/citizen-moves.mjs) are already a person standing
 * and walking: they are only grounded on the citizen's own legs, never straightened.
 */
export const MOCAP_STANCE=Object.freeze({lean:90,knees:0,arms:0,ground:'frame',mocap:true});
/**
 * Poses made from a captured one. 100STYLE's "on phone" is a call, held to the ear; the thing a
 * Shibuya crossing is full of is people looking down at one, so `Idle.text` is the standing idle
 * with both hands brought to a phone at the lower chest (two-bone IK, every frame, so the body's
 * own sway stays) and the head down. `Idle.folded` brings the upper arms forward: on a body
 * broader than the performer's, folded forearms otherwise pass into the chest.
 */
export const DERIVED=Object.freeze({
 'Idle.text':  {from:'Idle.stand',overlay:'text'}
});
/**
 * The performer walked looking a little down (at the floor markers, most likely); a person in a
 * street looks ahead. These walks get the head brought up to `headUp` degrees off the body's own
 * line -- not the old walk (that is the style) nor the ones holding a phone.
 */
const HEAD_LEVEL=new Set(['Walk.neutral','Walk.heavy','Walk.pockets','Walk.female','Walk.rushed']);
const OVERLAY=Object.freeze({'Idle.folded':'fold'});
export const stanceFor=name=>STANCE[name]??(DERIVED[name]?{...MOCAP_STANCE,...DERIVED[name]}
 :/^(Idle|Walk)\./.test(name)?{...MOCAP_STANCE,...(OVERLAY[name]?{overlay:OVERLAY[name]}:{}),...(HEAD_LEVEL.has(name)?{headUp:true}:{})}:null);
/** Women hold their arms a little closer still. */
export const STANCE_FEMALE_ARMS=4;
const FPS=30;
const SPINE=[['spine_01',.4],['spine_02',.3],['spine_03',.3]];
const LEGS=['thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r'];
const FEET=['foot_l','foot_r','ball_l','ball_r'];

/** Rotations only, plus the pelvis translation scaled to this body's legs. */
export function retargetClip(clip,pelvisScale=1){
 const tracks=[];
 for(const t of clip.tracks){
  if(t.name.endsWith('.quaternion')){tracks.push(t);continue;}
  if(t.name==='pelvis.position'){const c=t.clone();for(let i=0;i<c.values.length;i++)c.values[i]*=pelvisScale;tracks.push(c);}
 }
 const out=new AnimationClip(clip.name,clip.duration,tracks);out.userData={...(clip.userData??{})};
 // A stride is ground covered, and a citizen's legs cover it in proportion to their length.
 if(out.userData.stride)out.userData.stride*=pelvisScale;
 return out;
}

const qa=new Quaternion(),qb=new Quaternion(),va=new Vector3(),vb=new Vector3(),vc=new Vector3();
/** Turn `bone` by `angle` about a WORLD axis, keeping its parent where it is. */
function turnWorld(bone,axis,angle){
 if(!angle)return;
 bone.parent.getWorldQuaternion(qa);
 qb.setFromAxisAngle(axis,angle);
 // local' = parent^-1 * delta * parent * local
 bone.quaternion.premultiply(qa.clone().invert().multiply(qb).multiply(qa));
 bone.updateMatrixWorld(true);
}
/** Move `bone` up by `dy` metres of WORLD height, whatever its parent's axes and scale. */
function raise(bone,dy){
 const d=new Vector3(0,dy,0).applyQuaternion(bone.parent.getWorldQuaternion(new Quaternion()).invert());
 d.divide(bone.parent.getWorldScale(new Vector3()));
 bone.position.add(d);bone.updateMatrixWorld(true);
}
const lowest=bones=>{let y=Infinity;for(const n of FEET){const b=bones[n];if(b){b.getWorldPosition(va);y=Math.min(y,va.y);}}return y;};

/** Apply one STANCE rule to the pose a mixer has just set. `rest` holds the rest quaternions. */
const leanOf=(bones,forward)=>{const n=bones.neck_01.getWorldPosition(new Vector3()),p=bones.pelvis.getWorldPosition(new Vector3()),d=n.sub(p);return Math.atan2(d.dot(forward),d.y);};
export function applyStance(root,bones,rest,rule,{female=false,restLean=0,restHead=null}={}){
 root.updateMatrixWorld(true);
 // The body's axes, from its own hips and pelvis: lateral (towards its left) and forward.
 const lateral=bones.thigh_l.getWorldPosition(va).sub(bones.thigh_r.getWorldPosition(vb)).setY(0).normalize().clone();
 const forward=new Vector3().crossVectors(lateral,new Vector3(0,1,0)).normalize();
 // 1. Lean: tilt the spine back about the lateral axis, spread over its three bones.
 if(rule.lean){
  // Positive rotation about `lateral` tips the top of the spine towards `forward` or away; pick
  // the sign that reduces the lean, so the rule is independent of how the rig faces.
  const excess=leanOf(bones,forward)-restLean-rule.lean*Math.PI/180;
  if(excess>0){
   // The sign about `lateral` that tips the spine back, independent of how the rig faces.
   const probe=new Vector3(0,1,0).applyAxisAngle(lateral,.1).dot(forward);
   const sign=probe>0?-1:1;
   for(const [n,share] of SPINE)if(bones[n])turnWorld(bones[n],lateral,sign*excess*share);
  }
 }
 // 2. Knees: take a share of the leg bend back towards rest, then put the feet back on the ground.
 if(rule.knees){
  const before=lowest(bones);
  for(const n of LEGS){const b=bones[n];if(b)b.quaternion.slerp(rest[n],rule.knees);}
  root.updateMatrixWorld(true);
  const after=lowest(bones);
  raise(bones.pelvis,before-after);
 }
 // 3. Arms: bring each upper arm in towards the body, in the body's frontal plane only, so the
 // forward-and-back swing of a walk is kept.
 const arms=(rule.arms??0)+(female&&!rule.mocap?STANCE_FEMALE_ARMS:0);
 if(arms)for(const side of ['l','r']){
  const up=bones['upperarm_'+side],low=bones['lowerarm_'+side];if(!up||!low)continue;
  const d=low.getWorldPosition(va).sub(up.getWorldPosition(vb));
  const frontal=d.clone().sub(forward.clone().multiplyScalar(d.dot(forward)));
  if(frontal.lengthSq()<1e-8)continue;
  const out=Math.atan2(Math.abs(frontal.dot(lateral)),-frontal.y);   // degrees off straight down, in the frontal plane
  const by=Math.min(arms*Math.PI/180,Math.max(0,out-4*Math.PI/180));
  // About `forward`: the sign that moves the elbow towards the body's centre line.
  const towards=(frontal.dot(lateral)>0?-1:1);
  const probe=new Vector3(0,-1,0).applyAxisAngle(forward,.1).dot(lateral);
  turnWorld(up,forward,towards*(probe>0?1:-1)*by);
 }
 if(rule.overlay)overlay(root,bones,rule.overlay,lateral,forward);
 // 4. The head level: neck -> head no further forward than the pelvis -> neck line plus a little.
 if(rule.headUp&&bones.Head&&bones.neck_01&&restHead){
  // Where the face points: the rest pose's forward, turned as the head has turned since rest.
  // Gaze up to 6 degrees down is a person walking; more is looking at the ground.
  const turn=bones.Head.getWorldQuaternion(new Quaternion()).multiply(restHead.clone().invert());
  const face=forward.clone().applyQuaternion(turn),down=Math.atan2(-face.y,face.dot(forward));
  const excess=down-6*Math.PI/180;
  if(excess>0){const probe=new Vector3(0,1,0).applyAxisAngle(lateral,.1).dot(forward),sign=probe>0?-1:1;
   turnWorld(bones.neck_01,lateral,sign*excess*.5);turnWorld(bones.Head,lateral,sign*excess*.5);}
 }
}

/** Bend a three-joint chain (shoulder, elbow, wrist) so the wrist reaches `target`; `pole` says where the elbow goes. */
function twoBone(a,b,c,target,pole){
 const A=a.getWorldPosition(new Vector3()),B=b.getWorldPosition(new Vector3()),C=c.getWorldPosition(new Vector3());
 const lab=A.distanceTo(B),lcb=B.distanceTo(C),lat=Math.min(lab+lcb-1e-3,Math.max(1e-3,A.distanceTo(target)));
 const ang=(u,v)=>Math.acos(Math.max(-1,Math.min(1,u.clone().normalize().dot(v.clone().normalize()))));
 const ac_ab0=ang(C.clone().sub(A),B.clone().sub(A)),ba_bc0=ang(A.clone().sub(B),C.clone().sub(B));
 const ac_ab1=Math.acos(Math.max(-1,Math.min(1,(lcb*lcb-lab*lab-lat*lat)/(-2*lab*lat))));
 const ba_bc1=Math.acos(Math.max(-1,Math.min(1,(lat*lat-lab*lab-lcb*lcb)/(-2*lab*lcb))));
 // The bend plane: through the pole, so the elbow goes down and out, not up.
 const axis0=new Vector3().crossVectors(C.clone().sub(A),pole.clone().sub(A)).normalize();
 turnWorld(a,axis0,(ac_ab1-ac_ab0));
 turnWorld(b,axis0,(ba_bc1-ba_bc0));
 const C2=c.getWorldPosition(new Vector3()),A2=a.getWorldPosition(new Vector3());
 const from=C2.clone().sub(A2),to=target.clone().sub(A2),axis1=new Vector3().crossVectors(from,to);
 if(axis1.lengthSq()>1e-10)turnWorld(a,axis1.normalize(),ang(from,to));
}
function overlay(root,bones,kind,lateral,forward){
 const down=new Vector3(0,-1,0);
 if(kind==='text'){
  // The phone at the lower chest: from the neck, which sits at the same place on every body.
  const chest=bones.neck_01.getWorldPosition(new Vector3()).addScaledVector(down,.12);
  for(const [side,s] of [['l',1],['r',-1]]){
   const up=bones['upperarm_'+side],low=bones['lowerarm_'+side],hand=bones['hand_'+side];if(!up||!low||!hand)continue;
   const target=chest.clone().addScaledVector(forward,.26).addScaledVector(lateral,s*.045).addScaledVector(down,.2);
   const shoulder=up.getWorldPosition(new Vector3());
   const pole=shoulder.clone().addScaledVector(down,.6).addScaledVector(lateral,s*.1).addScaledVector(forward,-.12);
   twoBone(up,low,hand,target,pole);
  }
  // Looking down at it.
  const probe=new Vector3(0,1,0).applyAxisAngle(lateral,.1).dot(forward),sign=probe>0?1:-1;
  if(bones.neck_01)turnWorld(bones.neck_01,lateral,sign*10*Math.PI/180);
  if(bones.Head)turnWorld(bones.Head,lateral,sign*16*Math.PI/180);
 }else if(kind==='fold'){
  for(const side of ['l','r']){const up=bones['upperarm_'+side],low=bones['lowerarm_'+side];if(!up||!low)continue;
   // Elbows forward, about the lateral axis: the sign that moves the elbow towards `forward`.
   const before=low.getWorldPosition(new Vector3()).dot(forward);
   turnWorld(up,lateral,.22);const after=low.getWorldPosition(new Vector3()).dot(forward);
   if(after<before)turnWorld(up,lateral,-.44);}
 }
}

/**
 * The clips a citizen plays: every clip retargeted (rotations, scaled pelvis), and the ones in
 * STANCE resampled at 30 fps with their rule applied. `root` is the citizen's skeleton in its rest
 * pose (it is posed while sampling and put back after); `pelvisScale` its pelvis height over the
 * crowd skeleton's.
 */
export function citizenClips(clips,root,{pelvisScale=1,female=false}={}){
 const bones={};root.traverse(o=>{if(o.isBone)bones[o.name]=o;});
 const rest={},restPos={};for(const [n,b] of Object.entries(bones)){rest[n]=b.quaternion.clone();restPos[n]=b.position.clone();}
 const reset=()=>{for(const [n,b] of Object.entries(bones)){b.quaternion.copy(rest[n]);b.position.copy(restPos[n]);}root.updateMatrixWorld(true);};
 const byName=new Map(clips.map(c=>[c.name,retargetClip(c,pelvisScale)]));
 // Derived poses ride on a clip that is there.
 for(const [name,d] of Object.entries(DERIVED))if(byName.has(d.from)&&!byName.has(name)){const c=byName.get(d.from).clone();c.name=name;c.userData={...(byName.get(d.from).userData??{})};byName.set(name,c);}
 const out=[];
 for(const [name,clip] of byName){
  const rule=stanceFor(name);
  if(!rule){out.push(clip);continue;}
  const source=byName.get(rule.from??name)??clip;
  const mixer=new AnimationMixer(root),action=mixer.clipAction(source);action.play();
  const frames=Math.max(2,Math.round(source.duration*FPS)),times=new Float32Array(frames+1);
  const q={},p=[];for(const n of Object.keys(bones))q[n]=new Float32Array((frames+1)*4);
  const restFoot=lowest(bones),restHead=bones.Head?.getWorldQuaternion(new Quaternion());
  const restLean=(()=>{const lat=bones.thigh_l.getWorldPosition(new Vector3()).sub(bones.thigh_r.getWorldPosition(new Vector3())).setY(0).normalize();
   return leanOf(bones,new Vector3().crossVectors(lat,new Vector3(0,1,0)).normalize());})();
  const drops=[];
  for(let f=0;f<=frames;f++){
   reset();action.time=f/frames*source.duration;mixer.update(0);
   applyStance(root,bones,rest,rule,{female,restLean,restHead});
   root.updateMatrixWorld(true);const drop=lowest(bones)-restFoot;drops.push(drop);
   if(rule.ground==='frame')raise(bones.pelvis,-drop);
   times[f]=f/frames*source.duration;
   for(const [n,b] of Object.entries(bones))b.quaternion.toArray(q[n],f*4);
   p.push(...bones.pelvis.position.toArray());
  }
  if(rule.ground==='mean'){
   // One shift for the whole clip, in the pelvis's parent space (the rest pose's, as it is now).
   const m=drops.reduce((a,b)=>a+Math.min(b,0),0)/drops.length;
   const d=new Vector3(0,-m,0).applyQuaternion(bones.pelvis.parent.getWorldQuaternion(new Quaternion()).invert()).divide(bones.pelvis.parent.getWorldScale(new Vector3()));
   for(let i=0;i<p.length;i+=3){p[i]+=d.x;p[i+1]+=d.y;p[i+2]+=d.z;}
  }
  action.stop();mixer.uncacheRoot(root);reset();
  const tracks=Object.keys(bones).map(n=>new QuaternionKeyframeTrack(`${n}.quaternion`,times,q[n]));
  tracks.push(new VectorKeyframeTrack('pelvis.position',times,p));
  const made=new AnimationClip(name,source.duration,tracks);made.userData={...(source.userData??{})};out.push(made);
 }
 return out;
}
