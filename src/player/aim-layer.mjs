// The gun arm while walking (PLAN-WEAPONS W2, R1 and R2).
//
// §9k is the warning this module is built on: a punch blended over the walk was averaged with it
// and put the fist 0.6 m off its line. An aim blended the same way would do the same to the
// muzzle -- and a muzzle a few degrees off is metres off at the target. So:
//
//  1. The aim pose is not averaged with the gait. Above the waist (spine_02 up, both arms, the
//     head) each bone is SET to the aim pose, slerped in by the aim weight alone, after the mixer
//     has evaluated the walk. The pelvis and legs keep walking.
//  2. The aim poses are three single frames (Pistol_Aim_Up/Neutral/Down, measured at about +90°,
//     0° and -90° of barrel pitch); the pose for the target's pitch is slerped between them.
//     Pistol_Shoot's recoil and Pistol_Reload ride on top as local deltas from the neutral pose.
//  3. The walk still sways the pelvis and spine_01 under all that, and left/right comes from the
//     body's yaw (R2), not from any clip. So an AIM CORRECTION then turns spine_01..spine_03, a
//     share each, until the muzzle ray points at the target. It is measured, not assumed:
//     `error` is how far the ray passes from the target after the correction, and the R1 test
//     holds it under 0.25 m at 10 m, walking, at 0°, ±45° and ±90° between the walk and the aim.
import {Quaternion,Vector3} from 'three';

export const AIM = Object.freeze({
 fadeIn: .12, fadeOut: .2, reloadFade: .15,
 // The bones the aim pose owns. spine_01 and below belong to the walk.
 upper: Object.freeze(['spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r']),
 // The correction's bones and how much of what is left each takes, per pass.
 spine: Object.freeze([['spine_01', 1 / 3], ['spine_02', 1 / 2], ['spine_03', 1]]),
 passes: 3,
 poseRange: Math.PI / 2   // Pistol_Aim_Up / _Down are the barrel at about ±90°
});

const CLIPS = ['PistolAimUp', 'PistolAimNeutral', 'PistolAimDown', 'PistolShoot', 'PistolReload'];

/**
 * @param {any} root the figure's root
 * @param {any[]} clips the instance's AnimationClips
 * @param {any} rig the weapon rig (weapon-mesh.mjs), for the muzzle
 */
export function createAimLayer(root, clips, rig, {correction = true} = {}) {
 const bones = new Map();
 for (const name of [...AIM.upper, 'spine_01']) {const b = root.getObjectByName(name); if (b) bones.set(name, b);}
 // Each clip's quaternion track per upper bone, as an interpolant.
 const tracks = new Map();
 for (const name of CLIPS) {
  const clip = clips.find(c => c.name === name); if (!clip) continue;
  const per = new Map();
  for (const t of clip.tracks) {
   const dot = t.name.lastIndexOf('.'), bone = t.name.slice(0, dot);
   if (t.name.slice(dot + 1) !== 'quaternion' || !AIM.upper.includes(bone)) continue;
   per.set(bone, {interpolant: t.createInterpolant(), duration: clip.duration});
  }
  tracks.set(name, per);
 }
 const ready = bones.size >= AIM.upper.length && tracks.size === CLIPS.length && !!rig;
 const q = new Quaternion(), qa = new Quaternion(), qb = new Quaternion(), qn = new Quaternion(), qd = new Quaternion();
 const muzzle = new Vector3(), dir = new Vector3(), want = new Vector3(), target = new Vector3(), chest = new Vector3();
 const wq = new Quaternion(), pq = new Quaternion(), rot = new Quaternion(), id = new Quaternion();
 let aimW = 0, reloadW = 0, error = null;

 const sample = (clip, bone, t, out) => {
  const tr = tracks.get(clip)?.get(bone); if (!tr) return false;
  const v = tr.interpolant.evaluate(Math.max(0, Math.min(tr.duration, t)));
  out.set(v[0], v[1], v[2], v[3]); return true;
 };

 /** How far a ray from `o` along `d` passes from `p`. */
 const miss = (o, d, p) => {const v = p.clone().sub(o), along = v.dot(d); return along < 0 ? v.length() : v.addScaledVector(d, -along).length();};

 return {
  get ready() {return ready;},
  get weight() {return Math.max(aimW, reloadW);},
  get aimWeight() {return aimW;},
  /** After the last update: how far the muzzle ray passed from the target, metres (null: none). */
  get error() {return error;},
  /**
   * After the mixer has posed the body and the root is placed. `state.aim` (0/1) is the aim
   * request, `state.aimTarget` {x,y,z} what to aim at, `state.shotLeft` seconds of Pistol_Shoot
   * still to play, `state.reloadLeft` seconds of Pistol_Reload.
   */
  update(state, dt) {
   error = null;
   if (!ready) return false;
   const gun = state.weapon === 'pistol' || state.weapon === 'revolver';
   const shooting = gun && (state.shotLeft ?? 0) > 0, reloading = gun && (state.reloadLeft ?? 0) > 0;
   const on = gun && ((state.aim ?? 0) > 0 || shooting) && !reloading;
   aimW += Math.max(-dt / AIM.fadeOut, Math.min(dt / AIM.fadeIn, (on ? 1 : 0) - aimW));
   reloadW += Math.max(-dt / AIM.reloadFade, Math.min(dt / AIM.reloadFade, (reloading ? 1 : 0) - reloadW));
   if (aimW <= 0 && reloadW <= 0) return false;
   const t = state.aimTarget;
   root.updateMatrixWorld(true);
   // The target's pitch from the chest picks the aim pose.
   let pitch = 0;
   if (t) {bones.get('spine_03').getWorldPosition(chest); pitch = Math.atan2(t.y - chest.y, Math.hypot(t.x - chest.x, t.z - chest.z));}
   const k = Math.max(-1, Math.min(1, pitch / AIM.poseRange));
   const shotAt = shooting ? (tracks.get('PistolShoot').values().next().value.duration - state.shotLeft) : 0;
   const reloadAt = reloading ? (tracks.get('PistolReload').values().next().value.duration - state.reloadLeft) : 0;
   const w = Math.max(aimW, reloadW);
   for (const name of AIM.upper) {
    const bone = bones.get(name);
    sample('PistolAimNeutral', name, 0, qn);
    q.copy(qn);
    if (k > 0 && sample('PistolAimUp', name, 0, qa)) q.slerp(qa, k);
    else if (k < 0 && sample('PistolAimDown', name, 0, qb)) q.slerp(qb, -k);
    // Recoil: the shot's local change from the neutral aim, on top of the pitched aim.
    if (shooting && sample('PistolShoot', name, shotAt, qd)) q.multiply(qn.clone().invert().multiply(qd));
    if (reloadW > 0 && sample('PistolReload', name, reloadAt, qd)) q.slerp(qd, reloadW / w);
    bone.quaternion.slerp(q, w);
   }
   root.updateMatrixWorld(true);
   if (!t || aimW <= 0 || !rig.muzzle(muzzle, dir)) return true;
   target.set(t.x, t.y, t.z);
   if (correction) {
    for (let pass = 0; pass < AIM.passes; pass++) for (const [name, share] of AIM.spine) {
     const bone = bones.get(name);
     rig.muzzle(muzzle, dir);
     want.copy(target).sub(muzzle).normalize();
     rot.setFromUnitVectors(dir, want);
     rot.copy(id.slerp(rot, share * aimW)); id.identity();
     // Rotate the bone in world space: local' = parent^-1 * rot * world.
     bone.getWorldQuaternion(wq); bone.parent.getWorldQuaternion(pq);
     bone.quaternion.copy(pq.invert().multiply(rot.multiply(wq)));
     bone.updateMatrixWorld(true);
    }
   }
   rig.muzzle(muzzle, dir);
   error = miss(muzzle, dir, target);
   return true;
  },
  reset() {aimW = 0; reloadW = 0; error = null;}
 };
}
