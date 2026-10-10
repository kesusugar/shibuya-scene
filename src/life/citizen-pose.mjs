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
 return new AnimationClip(clip.name,clip.duration,tracks);
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
export function applyStance(root,bones,rest,rule,{female=false,restLean=0}={}){
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
 const arms=(rule.arms??0)+(female?STANCE_FEMALE_ARMS:0);
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
 const out=[];
 for(const [name,clip] of byName){
  const rule=STANCE[name];
  if(!rule){out.push(clip);continue;}
  const source=byName.get(rule.from??name)??clip;
  const mixer=new AnimationMixer(root),action=mixer.clipAction(source);action.play();
  const frames=Math.max(2,Math.round(source.duration*FPS)),times=new Float32Array(frames+1);
  const q={},p=[];for(const n of Object.keys(bones))q[n]=new Float32Array((frames+1)*4);
  const restFoot=lowest(bones);
  const restLean=(()=>{const lat=bones.thigh_l.getWorldPosition(new Vector3()).sub(bones.thigh_r.getWorldPosition(new Vector3())).setY(0).normalize();
   return leanOf(bones,new Vector3().crossVectors(lat,new Vector3(0,1,0)).normalize());})();
  const drops=[];
  for(let f=0;f<=frames;f++){
   reset();action.time=f/frames*source.duration;mixer.update(0);
   applyStance(root,bones,rest,rule,{female,restLean});
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
  out.push(new AnimationClip(name,source.duration,tracks));
 }
 return out;
}
