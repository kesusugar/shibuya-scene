// What a body does that no clip in the pack does (roadmap stage 2), as layers over the finished
// pose -- the same way hands.mjs and the aim layer work:
//
//  HANDS UP    both hands up beside the head, palms out: two-bone IK on each arm to a point in
//              the body's own frame, faded in over a fifth of a second.
//  LIMP        a wounded leg (the right) that will not take the weight: the knee kept nearly
//              straight, the pelvis dropping and the trunk leaning over the good side each time
//              the wounded leg is under the body (the gait's own phase), and a slower pace (the
//              simulation's).
//  UPPER POSE  any clip's upper body over the legs -- the katana's two-handed guard (Sword_Idle)
//              held while walking, instead of the walk's swinging arms with a sword in one hand.
import {Quaternion,Vector3} from 'three';
import {createTwoBoneSolver} from './foot-ik.mjs';

export const BODY = Object.freeze({
 // Hands up: where each palm goes, in the body's frame (+X left, +Y up, +Z forward), at 1.76 m.
 handsUp: Object.freeze({left: Object.freeze([.27, 1.78, .1]), right: Object.freeze([-.27, 1.78, .1]), fade: .2}),
 // Limp: how far the knee may bend (share of what the walk bends it), the hip drop and lean (rad).
 limp: Object.freeze({knee: .35, drop: .1, lean: .09, fade: .3}),
 upperFade: .2,
 upper: Object.freeze(['spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'])
});

const palm = .08;

/** Both arms up. `update(on, dt)` after everything else has posed the body. */
export function createHandsUp(root) {
 const bone = n => root.getObjectByName(n);
 const arms = [[bone('upperarm_l'), bone('lowerarm_l'), bone('hand_l'), BODY.handsUp.left],
  [bone('upperarm_r'), bone('lowerarm_r'), bone('hand_r'), BODY.handsUp.right]];
 const ready = arms.every(a => a.slice(0, 3).every(Boolean));
 const solve = createTwoBoneSolver(), goal = new Vector3(), hand = new Vector3(), p = new Vector3();
 let w = 0;
 return {
  get ready() {return ready;},
  get weight() {return w;},
  update(on, dt) {
   w += Math.max(-dt / BODY.handsUp.fade, Math.min(dt / BODY.handsUp.fade, (on ? 1 : 0) - w));
   if (!ready || w <= 1e-3) return false;
   root.updateMatrixWorld(true);
   const k = w * w * (3 - 2 * w);
   for (const [upper, lower, wrist, at] of arms) {
    wrist.updateWorldMatrix(true, false);
    hand.setFromMatrixPosition(wrist.matrixWorld);
    p.set(0, palm, 0).applyMatrix4(wrist.matrixWorld).sub(hand);          // wrist -> palm
    goal.set(...at);
    // The body's frame without its scale: the points are metres at the game's height.
    goal.applyQuaternion(root.quaternion).add(root.position).sub(p);
    goal.sub(hand).multiplyScalar(k).add(hand);
    solve(upper, lower, wrist, goal);
   }
   return true;
  },
  reset() {w = 0;}
 };
}

/** A limp on the right leg. `update(on, phase, dt)`: phase 0..1 of the gait cycle. */
export function createLimp(root) {
 const pelvis = root.getObjectByName('pelvis'), spine = root.getObjectByName('spine_01'), calf = root.getObjectByName('calf_r');
 const ready = !!(pelvis && spine && calf);
 const q = new Quaternion(), rest = new Quaternion(), axis = new Vector3(), wq = new Quaternion(), pq = new Quaternion();
 let w = 0;
 const turn = (b, ax, angle) => {
  b.getWorldQuaternion(wq); b.parent.getWorldQuaternion(pq);
  q.setFromAxisAngle(ax, angle);
  b.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
  b.updateMatrixWorld(true);
 };
 return {
  get ready() {return ready;},
  get weight() {return w;},
  update(on, phase, dt, moving = true) {
   w += Math.max(-dt / BODY.limp.fade, Math.min(dt / BODY.limp.fade, (on ? 1 : 0) - w));
   if (!ready || w <= 1e-3) return false;
   // The knee: toward its rest bend, so the leg stays nearly straight.
   rest.identity();
   calf.quaternion.slerp(rest, (1 - BODY.limp.knee) * w);
   calf.updateMatrixWorld(true);
   if (!moving) return true;
   // Weight on the wounded leg for the first half of the cycle (the walk starts on the right):
   // the hip drops away from it and the trunk throws itself over the good leg.
   const load = Math.max(0, Math.sin(phase * Math.PI * 2));
   axis.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));   // the body's forward
   root.updateMatrixWorld(true);
   turn(pelvis, axis, -BODY.limp.drop * load * w);
   turn(spine, axis, BODY.limp.lean * 2 * load * w);
   return true;
  },
  reset() {w = 0;}
 };
}

/**
 * A clip's upper body over the legs: `update(weight, dt)` sets the upper bones to the clip's pose
 * (looped at its own speed), slerped in by `weight` (already faded by the caller).
 */
export function createUpperPose(root, clips, name) {
 const clip = clips.find(c => c.name === name);
 const tracks = new Map();
 if (clip) for (const t of clip.tracks) {
  const dot = t.name.lastIndexOf('.'), b = t.name.slice(0, dot);
  if (t.name.slice(dot + 1) === 'quaternion' && BODY.upper.includes(b)) tracks.set(b, t.createInterpolant());
 }
 const bones = new Map(BODY.upper.map(n => [n, root.getObjectByName(n)]).filter(([, b]) => b));
 const q = new Quaternion();
 let time = 0;
 return {
  get ready() {return !!clip && tracks.size >= 8;},
  update(weight, dt) {
   if (!clip || weight <= 1e-3) return false;
   time = (time + dt) % clip.duration;
   for (const [n, it] of tracks) {
    const b = bones.get(n); if (!b) continue;
    const v = it.evaluate(time); q.set(v[0], v[1], v[2], v[3]);
    b.quaternion.slerp(q, weight);
   }
   root.updateMatrixWorld(true);
   return true;
  }
 };
}
