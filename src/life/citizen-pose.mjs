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
 Guard:  {from:'Idle',lean:3,knees:.6,arms:8,ground:'frame',calm:'Idle.stand'}
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
 'Idle.text':  {from:'Idle.stand',overlay:'text'},
 // Walking while reading it: the neutral walk from the chest down, the texting idle's arms,
 // neck and head on top (their local rotations, so the phone rides with the chest).
 'Walk.text':  {from:'Walk.neutral',layer:'Idle.text'}
});
/**
 * Look 2d: the phone in a texter's hands. The crowd's skinning folds the finger bones into the
 * hand, so a fingertip bone is free: the phone's vertices are skinned to it, and the bake gives it
 * the right hand's matrix in the clips that hold a phone and a zero matrix (the phone collapsed to
 * a point, not drawn) in every other. The near pool puts a bone of its own there (figure.mjs).
 */
export const PHONE_BONE='index_04_leaf_r';
export const PHONE_CLIPS=Object.freeze(['Idle.text','Walk.text']);
const LAYERED=/^(clavicle|upperarm|lowerarm|hand|index|middle|pinky|ring|thumb)_|^(neck_01|Head)$/;
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

/**
 * Look 2d: the spine a person stands with. The crowd skeleton's rest is a superhero's -- the
 * lumbar tipped 16 degrees forward, the chest thrown 13 back -- and every clip, the captured ones
 * included, is a turn from that rest, so every citizen stood and walked sway-backed: belly out,
 * chest back, the "leaning back" the owner saw. Each spine bone's rest is turned, in the side
 * plane only, so its segment (joint to the next joint up) leans the way a person's does: the
 * lumbar about upright, the chest a little forward, the neck more. Degrees forward of vertical.
 */
export const SPINE_REST=Object.freeze({pelvis:2,spine_01:2,spine_02:3,spine_03:3,neck_01:6});
const SPINE_CHILD=Object.freeze({pelvis:'spine_01',spine_01:'spine_02',spine_02:'spine_03',spine_03:'neck_01',neck_01:'Head'});
/**
 * The per-bone corrections for a skeleton in its rest pose: C_b = Wrest^-1 * D * Wrest, where D
 * turns the segment to SPINE_REST about the body's lateral axis. A clip's local rotation becomes
 * C_parent^-1 * q * C_b, so the bone's world turn is its own, rest-corrected; the bones hanging off
 * the spine (legs, clavicles, head) keep the world turn the clip gives them.
 */
function spineCorrections(root,bones){
 root.updateMatrixWorld(true);
 const lateral=bones.thigh_l.getWorldPosition(new Vector3()).sub(bones.thigh_r.getWorldPosition(new Vector3())).setY(0).normalize();
 const forward=new Vector3().crossVectors(lateral,new Vector3(0,1,0)).normalize();
 const C={};
 for(const [b,target] of Object.entries(SPINE_REST)){
  const bone=bones[b],child=bones[SPINE_CHILD[b]];if(!bone||!child)continue;
  const d=child.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3()));
  const now=Math.atan2(d.dot(forward),d.dot(new Vector3(0,1,0)));
  // Positive about `lateral` tips +Y towards `forward` or away; take the sign that adds forward lean.
  const probe=new Vector3(0,1,0).applyAxisAngle(lateral,.1).dot(forward)>0?1:-1;
  const D=new Quaternion().setFromAxisAngle(lateral,probe*(target*Math.PI/180-now));
  const W=bone.getWorldQuaternion(new Quaternion());
  C[b]=W.clone().invert().multiply(D).multiply(W);
 }
 return C;
}
/** Apply spine corrections to a clip's tracks (see spineCorrections). */
function straighten(clip,C,bones){
 const I=new Quaternion(),tracks=[];
 for(const t of clip.tracks){
  const [name,prop]=t.name.split('.');
  if(prop!=='quaternion'){tracks.push(t);continue;}
  const bone=bones[name],parent=bone?.parent?.name,own=C[name],up=C[parent];
  // Legs, arms and the head stay turned the way the clip turns them: their parent's correction
  // is undone. (Turned with the chest, a hanging arm swings back as the chest tips forward.)
  const keepWorld=!own&&!!up;
  if(!own&&!(keepWorld&&up)){tracks.push(t);continue;}
  const c=t.clone(),q=new Quaternion(),pre=(own||keepWorld)&&up?up.clone().invert():I,post=own??I;
  for(let i=0;i<c.values.length;i+=4){q.fromArray(c.values,i);q.premultiply(pre).multiply(post);q.toArray(c.values,i);}
  tracks.push(c);
 }
 const out=new AnimationClip(clip.name,clip.duration,tracks);out.userData={...(clip.userData??{})};return out;
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
/**
 * Look 2d: hands that show. The performer is slimmer than most citizens, so a hand that swung
 * past his hip passes INTO theirs, and a heavy man or a woman's hips swallowed both hands. Arms
 * hanging or swinging are kept at least `clear` metres out from the hip joint, sideways (more for
 * a heavier body); the forward-and-back swing is untouched. Not for the poses that put the hands
 * somewhere on purpose (pockets, behind the back, folded, akimbo, a phone).
 */
const CLEAR_ARMS=/^(Idle|Walk|Run|Startle|Guard|Idle\.(stand|restless|old)|Walk\.(neutral|heavy|female|elder|rushed))$/;
export const clearFor=({female=false,weight=.5}={})=>.11+Math.max(0,weight-.4)*.14+(female?.025:0);
function clearArms(bones,lateral,forward,clear){
 for(const [side,s] of [['l',1],['r',-1]]){
  const up=bones['upperarm_'+side],hand=bones['hand_'+side],hip=bones['thigh_'+side];if(!up||!hand||!hip)continue;
  const out=hand.getWorldPosition(new Vector3()).sub(hip.getWorldPosition(new Vector3())).dot(lateral)*s;
  if(out>=clear)continue;
  const shoulder=up.getWorldPosition(new Vector3()),reach=hand.getWorldPosition(new Vector3()).distanceTo(shoulder);
  const angle=Math.asin(Math.min(.9,(clear-out)/Math.max(.2,reach)));
  // About `forward`, the sign that moves this hand outwards.
  const before=hand.getWorldPosition(new Vector3()).dot(lateral)*s;
  turnWorld(up,forward,angle);
  if(hand.getWorldPosition(new Vector3()).dot(lateral)*s<before)turnWorld(up,forward,-2*angle);
 }
}
export function applyStance(root,bones,rest,rule,{female=false,restLean=0,restHead=null,clear=0,name=''}={}){
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
 if(clear&&CLEAR_ARMS.test(name))clearArms(bones,lateral,forward,clear);
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
   const target=chest.clone().addScaledVector(forward,.22).addScaledVector(lateral,s*.04).addScaledVector(down,.17);
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
export function citizenClips(clips,root,{pelvisScale=1,female=false,weight=.5}={}){
 const clear=clearFor({female,weight});
 const bones={};root.traverse(o=>{if(o.isBone)bones[o.name]=o;});
 const rest={},restPos={};for(const [n,b] of Object.entries(bones)){rest[n]=b.quaternion.clone();restPos[n]=b.position.clone();}
 const reset=()=>{for(const [n,b] of Object.entries(bones)){b.quaternion.copy(rest[n]);b.position.copy(restPos[n]);}root.updateMatrixWorld(true);};
 const spine=spineCorrections(root,bones);
 const byName=new Map(clips.map(c=>[c.name,straighten(retargetClip(c,pelvisScale),spine,bones)]));
 // Derived poses ride on a clip that is there.
 for(const [name,d] of Object.entries(DERIVED))if(byName.has(d.from)&&!byName.has(name)){const c=byName.get(d.from).clone();c.name=name;c.userData={...(byName.get(d.from).userData??{})};byName.set(name,c);}
 const out=[];
 for(const [name,clip] of byName){
  const rule=stanceFor(name);
  if(!rule){out.push(clip);continue;}
  const source=(rule.calm&&byName.get(rule.calm))||byName.get(rule.from??name)||clip;
  const mixer=new AnimationMixer(root),action=mixer.clipAction(source);action.play();
  const frames=Math.max(2,Math.round(source.duration*FPS)),times=new Float32Array(frames+1);
  const q={},p=[];for(const n of Object.keys(bones))q[n]=new Float32Array((frames+1)*4);
  const restFoot=lowest(bones),restHead=bones.Head?.getWorldQuaternion(new Quaternion());
  const restLean=(()=>{const lat=bones.thigh_l.getWorldPosition(new Vector3()).sub(bones.thigh_r.getWorldPosition(new Vector3())).setY(0).normalize();
   return leanOf(bones,new Vector3().crossVectors(lat,new Vector3(0,1,0)).normalize());})();
  const drops=[];
  for(let f=0;f<=frames;f++){
   reset();action.time=f/frames*source.duration;mixer.update(0);
   applyStance(root,bones,rest,rule,{female,restLean,restHead,clear,name});
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
 // Layers: the upper body of one clip over another, sampled at the same time (looped).
 for(const clip of out){const layer=DERIVED[clip.name]?.layer,top=layer&&out.find(c=>c.name===layer);if(!top)continue;
  for(const track of clip.tracks){const bone=track.name.split('.')[0];if(!LAYERED.test(bone)||!track.name.endsWith('.quaternion'))continue;
   const from=top.tracks.find(t=>t.name===track.name);if(!from)continue;
   const sample=from.createInterpolant();
   for(let i=0;i<track.times.length;i++)track.values.set(sample.evaluate(track.times[i]%top.duration),i*4);}}
 return out;
}
