// A hit you can see land (GTA-FIDELITY-STATUS §9ai, H3): where the blow struck and which way it
// was going decide how the body gives.
//
// The Hit clip barely moves a body (UAL2's Hit_Knockback is not pinned), and figure.mjs's older
// recoil bends the spine and head by one envelope whatever was hit. Here each blow is an impulse
// into small damped springs on the bones that would take it, in the body's own frame:
//
//   head  -- the head snaps away from the blow and the neck after it; the chest barely moves.
//   body  -- the chest and upper spine fold away from it, the head lagging the other way (the
//            whiplash that makes a torso hit read as a hit and not a lean).
//   legs  -- the knees buckle and the hips drop a little, and the trunk folds forward over them.
//
// Every blow adds to what is already moving, so a burst from the submachine gun shakes the body
// round after round instead of restarting one pose. The springs are underdamped (they overshoot
// once and settle in about half a second) and each bone is bounded, so a burst cannot twist
// anyone into a knot. Applied after the mixer, on top of whatever the body is doing.
import {Quaternion,Vector3} from 'three';

export const HIT_REACTION = Object.freeze({
 stiffness: 140,        // 1/s^2
 damping: 13,           // 1/s: about 0.55 of critical -- one overshoot, then still
 limit: .75,            // rad, per bone and axis
 // Per zone: [bone, kick back (rad/s per unit strength), kick across, sign]. `back` bends the bone
 // away from the blow's direction; a negative kick bends it toward (a lag or a fold).
 zones: Object.freeze({
  head: Object.freeze([['Head', 11, 9], ['neck_01', 6, 5], ['spine_03', 1.5, 1]]),
  body: Object.freeze([['spine_03', 6.5, 5], ['spine_02', 4.5, 3.5], ['spine_01', 2, 1.5], ['Head', -4, -3]]),
  legs: Object.freeze([['spine_01', -3.5, 1.5], ['spine_02', -2, 1], ['thigh_l', 3, 1.5], ['thigh_r', 3, 1.5],
   ['calf_l', -7, 0], ['calf_r', -7, 0]])
 })
});

/**
 * @param {any} root the figure's root; bones are found by name under it
 */
export function createHitReaction(root) {
 const names = [...new Set(Object.values(HIT_REACTION.zones).flat().map(([b]) => b))];
 const bones = new Map(names.map(n => [n, root.getObjectByName(n)]).filter(([, b]) => b));
 // Per bone: angle and angular velocity about the body's right axis (pitch, + bends back) and its
 // forward axis (roll, + leans to the body's left).
 const spring = new Map(names.map(n => [n, {pitch: 0, roll: 0, vp: 0, vr: 0}]));
 const right = new Vector3(), forward = new Vector3(), wq = new Quaternion(), pq = new Quaternion(), r = new Quaternion(), r2 = new Quaternion();
 let awake = false, hits = 0;
 const api = {
  get ready() {return bones.size === names.length;},
  get awake() {return awake;},
  get hits() {return hits;},
  /** How far a bone is bent right now: {pitch, roll} radians (for tests). */
  angleOf(name) {const s = spring.get(name); return s ? {pitch: s.pitch, roll: s.roll} : null;},
  /**
   * A blow. `dirX, dirZ` which way it was travelling (world), `heading` the body's facing,
   * `zone` 'head' | 'body' | 'legs', `strength` 1 for a pistol round or a cut.
   */
  hit({dirX = 0, dirZ = 1, heading = 0, zone = 'body', strength = 1} = {}) {
   const l = Math.hypot(dirX, dirZ) || 1, dx = dirX / l, dz = dirZ / l;
   // In the body's frame: forward is (sin h, cos h), the body's left is (cos h, -sin h).
   const along = dx * Math.sin(heading) + dz * Math.cos(heading), left = dx * Math.cos(heading) - dz * Math.sin(heading);
   // A blow travelling backward through the body (along < 0, hit from the front) bends it back.
   const back = -along, across = left;
   for (const [bone, kb, ka] of HIT_REACTION.zones[zone] ?? HIT_REACTION.zones.body) {
    const s = spring.get(bone); if (!s) continue;
    s.vp += kb * back * strength;
    // Across: pushed to its left, a bone leans to its left, which is +roll.
    s.vr += ka * across * strength * Math.sign(kb || 1);
   }
   awake = true; hits++;
  },
  /** One frame, after the mixer. `heading` is the body's facing now. */
  update(dt, heading = 0) {
   if (!awake || !api.ready) return false;
   dt = Math.max(0, Math.min(.05, dt || 0));
   let moving = false;
   for (const s of spring.values()) {
    // Semi-implicit Euler, in two halves for stability at 30 fps.
    for (let k = 0; k < 2; k++) {
     const h = dt / 2;
     s.vp += (-HIT_REACTION.stiffness * s.pitch - HIT_REACTION.damping * s.vp) * h; s.pitch += s.vp * h;
     s.vr += (-HIT_REACTION.stiffness * s.roll - HIT_REACTION.damping * s.vr) * h; s.roll += s.vr * h;
    }
    s.pitch = Math.max(-HIT_REACTION.limit, Math.min(HIT_REACTION.limit, s.pitch));
    s.roll = Math.max(-HIT_REACTION.limit, Math.min(HIT_REACTION.limit, s.roll));
    if (Math.abs(s.pitch) + Math.abs(s.roll) + (Math.abs(s.vp) + Math.abs(s.vr)) * .05 > 1e-3) moving = true;
   }
   if (!moving) {for (const s of spring.values()) s.pitch = s.roll = s.vp = s.vr = 0; awake = false; return false;}
   // The body's right (bending about it pitches) and forward (rolling about it leans sideways).
   right.set(-Math.cos(heading), 0, Math.sin(heading)); forward.set(Math.sin(heading), 0, Math.cos(heading));
   root.updateMatrixWorld(true);
   for (const name of names) {
    const s = spring.get(name), b = bones.get(name);
    if (!s || !b || (!s.pitch && !s.roll)) continue;
    // + pitch bends back: about the body's right axis, the top of the bone goes backward.
    r.setFromAxisAngle(right, s.pitch); r2.setFromAxisAngle(forward, -s.roll);
    b.getWorldQuaternion(wq); b.parent.getWorldQuaternion(pq);
    b.quaternion.copy(pq.invert().multiply(r.multiply(r2).multiply(wq)));
    b.updateMatrixWorld(true);
   }
   return true;
  },
  reset() {for (const s of spring.values()) s.pitch = s.roll = s.vp = s.vr = 0; awake = false;}
 };
 return api;
}
