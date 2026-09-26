// A light ragdoll for a body killed by a blade or a bullet (GTA-FIDELITY-STATUS §9ai, H4).
//
// Before this a killed pedestrian was handed to the mass crowd, which plays the same fall every
// time wherever the blow came from, so a cut or a shot read as passing through. Here the body
// that was killed keeps its humanoid and falls under physics, the way it was hit:
//
//  - 18 points on the joints (pelvis, chest, head and a point above it, shoulders, elbows, hands,
//    hips, knees, ankles, toes), placed where the animated pose had them when the blow landed.
//  - Verlet integration with gravity and a ground plane, and distance constraints: every bone's
//    length, a braced torso box (shoulders and hips, crossed), and a few "no closer than"
//    constraints that stop a knee or an elbow folding flat or the head sinking into the chest.
//    No joint-angle solver: a bone chain that can only keep its lengths already falls like a
//    body, and it costs a few microseconds.
//  - The blow is a velocity added at the point it struck (the head, the chest or the legs) on
//    top of the whole body's push, so a head shot snaps the head back first and a cut to the legs
//    takes them out from under it.
//  - Each frame the skeleton is turned to follow the points: the pelvis and chest by the frame
//    their spine and hip / shoulder lines make, every limb bone by aiming it at its child point.
//  - It goes to sleep once nothing has moved for half a second; a sleeping ragdoll costs nothing.
//
// Only the nearest humanoids (src/life/near-characters.mjs) carry one; the far crowd is unchanged.
import {Matrix4,Quaternion,Vector3} from 'three';

export const RAGDOLL = Object.freeze({
 gravity: 9.81,
 step: 1 / 60,              // s per integration step
 maxSteps: 4,               // per frame, so a slow frame does not spiral
 iterations: 8,             // constraint passes per step
 damping: .995,             // velocity kept per step (air)
 friction: .8,              // horizontal velocity kept per step while touching the ground
 radius: .06,               // m, a joint's clearance off the ground (the head's is larger)
 headRadius: .11,
 sleepSpeed: .06,           // m/s: below this for `sleepAfter` s, the body stops
 sleepAfter: .5,
 maxAwake: 6,               // s: asleep by then whatever it is doing
 // The blow: m/s added at the point it struck, and half that at its neighbours.
 blow: Object.freeze({head: 3.2, body: 2.6, legs: 3.0})
});

// The points, and the bone each one is read from at the start.
const POINTS = ['pelvis', 'spine_03', 'Head', 'headTop',
 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r',
 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r'];
const I = Object.fromEntries(POINTS.map((n, i) => [n, i]));

// Bones (equal length) and braces (the torso box, held as it was).
const STICKS = [
 ['pelvis', 'spine_03'], ['spine_03', 'Head'], ['Head', 'headTop'],
 ['spine_03', 'upperarm_l'], ['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'],
 ['spine_03', 'upperarm_r'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'],
 ['pelvis', 'thigh_l'], ['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['foot_l', 'ball_l'],
 ['pelvis', 'thigh_r'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r'], ['foot_r', 'ball_r'],
 // the torso box
 ['upperarm_l', 'upperarm_r'], ['thigh_l', 'thigh_r'], ['upperarm_l', 'thigh_l'], ['upperarm_r', 'thigh_r'],
 ['upperarm_l', 'thigh_r'], ['upperarm_r', 'thigh_l'], ['spine_03', 'thigh_l'], ['spine_03', 'thigh_r'],
 // the head on its neck, and the foot as one piece
 ['spine_03', 'headTop'], ['calf_l', 'ball_l'], ['calf_r', 'ball_r']
];
// "No closer than" this fraction of the starting distance: joints that may bend, but not flat.
const LIMITS = [
 ['thigh_l', 'foot_l', .55], ['thigh_r', 'foot_r', .55],        // a knee does not fold shut
 ['upperarm_l', 'hand_l', .45], ['upperarm_r', 'hand_r', .45],  // nor an elbow
 ['pelvis', 'Head', .8], ['pelvis', 'headTop', .8],             // the spine curls, a little
 ['Head', 'upperarm_l', .7], ['Head', 'upperarm_r', .7]         // the head stays off the shoulders
];
const NEIGHBOURS = {head: ['Head', 'headTop'], body: ['spine_03', 'upperarm_l', 'upperarm_r'], legs: ['calf_l', 'calf_r', 'thigh_l', 'thigh_r']};

/**
 * @param {any} root the figure's root (bones are found by name under it)
 */
export function createRagdoll(root) {
 const bone = n => root.getObjectByName(n);
 const bones = Object.fromEntries(['pelvis', 'spine_01', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']
  .map(n => [n, bone(n)]));
 const ready = Object.values(bones).every(Boolean);
 const n = POINTS.length;
 const pos = Array.from({length: n}, () => new Vector3()), prev = Array.from({length: n}, () => new Vector3());
 const sticks = [], limits = [];
 let active = false, asleep = false, age = 0, still = 0, ground = 0, carry = 0;
 // The frames the pelvis and chest are turned by: their bone world rotation at the start, and
 // the (spine, lateral) basis the points made then.
 const start = {pelvis: new Quaternion(), chest: new Quaternion(), pelvisBasis: new Matrix4(), chestBasis: new Matrix4(),
  head: new Quaternion(), headUp: new Vector3()};
 const v = new Vector3(), w = new Vector3(), q = new Quaternion(), pq = new Quaternion(), m = new Matrix4();

 const worldOf = (b, out) => {b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld);};
 const basis = (up, lateral, out) => {
  const y = up.clone().normalize(), x = lateral.clone().addScaledVector(y, -lateral.dot(y)).normalize(), z = x.clone().cross(y);
  return out.makeBasis(x, y, z);
 };
 const pelvisFrame = out => basis(v.subVectors(pos[I.spine_03], pos[I.pelvis]), w.subVectors(pos[I.thigh_l], pos[I.thigh_r]), out);
 const chestFrame = out => basis(v.subVectors(pos[I.Head], pos[I.spine_03]), w.subVectors(pos[I.upperarm_l], pos[I.upperarm_r]), out);
 const setWorld = (b, wq) => {b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(wq)); b.updateMatrixWorld(true);};
 /** Turn a bone so its child sits along the direction from point a to point b. */
 const aim = (name, child, a, bb) => {
  const b = bones[name], c = bones[child];
  const from = worldOf(c, new Vector3()).sub(worldOf(b, new Vector3()));
  const to = new Vector3().subVectors(pos[I[bb]], pos[I[a]]);
  if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
  b.getWorldQuaternion(q);
  setWorld(b, new Quaternion().setFromUnitVectors(from.normalize(), to.normalize()).multiply(q));
 };

 function satisfy() {
  for (const [a, b, rest] of sticks) {
   v.subVectors(pos[b], pos[a]); const d = v.length() || 1e-6, k = (d - rest) / d * .5;
   pos[a].addScaledVector(v, k); pos[b].addScaledVector(v, -k);
  }
  for (const [a, b, min] of limits) {
   v.subVectors(pos[b], pos[a]); const d = v.length() || 1e-6; if (d >= min) continue;
   const k = (d - min) / d * .5; pos[a].addScaledVector(v, k); pos[b].addScaledVector(v, -k);
  }
  for (let i = 0; i < n; i++) {
   const r = i === I.Head || i === I.headTop ? RAGDOLL.headRadius : RAGDOLL.radius;
   if (pos[i].y < ground + r) pos[i].y = ground + r;
  }
 }

 function step(dt) {
  let fastest = 0;
  for (let i = 0; i < n; i++) {
   const p = pos[i], o = prev[i];
   v.subVectors(p, o).multiplyScalar(RAGDOLL.damping);
   const r = i === I.Head || i === I.headTop ? RAGDOLL.headRadius : RAGDOLL.radius;
   if (p.y <= ground + r + .005) {v.x *= RAGDOLL.friction; v.z *= RAGDOLL.friction;}
   o.copy(p); p.add(v); p.y -= RAGDOLL.gravity * dt * dt;
   fastest = Math.max(fastest, v.length() / dt);
  }
  for (let k = 0; k < RAGDOLL.iterations; k++) satisfy();
  return fastest;
 }

 /** Turn the skeleton to follow the points. */
 function pose() {
  const pel = bones.pelvis;
  // The pelvis: placed on its point, turned by how its frame has turned.
  const now = pelvisFrame(new Matrix4());
  q.setFromRotationMatrix(m.multiplyMatrices(now, start.pelvisBasis.clone().invert()));
  setWorld(pel, q.clone().multiply(start.pelvis));
  pel.parent.updateWorldMatrix(true, false);
  pel.position.copy(pel.parent.worldToLocal(pos[I.pelvis].clone())); pel.updateMatrixWorld(true);
  // The spine: spine_01 aimed at the chest point, then the chest turned by its own frame.
  aim('spine_01', 'spine_03', 'pelvis', 'spine_03');
  const chestNow = chestFrame(new Matrix4());
  q.setFromRotationMatrix(m.multiplyMatrices(chestNow, start.chestBasis.clone().invert()));
  setWorld(bones.spine_03, q.clone().multiply(start.chest));
  aim('neck_01', 'Head', 'spine_03', 'Head');
  // The head: turned so its own up follows the point above it.
  v.subVectors(pos[I.headTop], pos[I.Head]);
  if (v.lengthSq() > 1e-8) setWorld(bones.Head, new Quaternion().setFromUnitVectors(start.headUp, v.normalize()).multiply(start.head));
  for (const s of ['l', 'r']) {
   aim(`upperarm_${s}`, `lowerarm_${s}`, `upperarm_${s}`, `lowerarm_${s}`);
   aim(`lowerarm_${s}`, `hand_${s}`, `lowerarm_${s}`, `hand_${s}`);
   aim(`thigh_${s}`, `calf_${s}`, `thigh_${s}`, `calf_${s}`);
   aim(`calf_${s}`, `foot_${s}`, `calf_${s}`, `foot_${s}`);
   aim(`foot_${s}`, `ball_${s}`, `foot_${s}`, `ball_${s}`);
  }
 }

 return {
  get ready() {return ready;},
  get active() {return active;},
  get asleep() {return asleep;},
  /** Where the points are, for tests and QA: name -> Vector3 (live). */
  get points() {return Object.fromEntries(POINTS.map((p, i) => [p, pos[i]]));},
  get sticks() {return sticks.map(([a, b, rest]) => ({a: POINTS[a], b: POINTS[b], rest, now: pos[a].distanceTo(pos[b])}));},
  /**
   * Start from the pose the body has now. `push` {x, y, z} is the whole body's velocity (m/s, the
   * crowd's own knock-down push); `dir` {x, z} the blow's direction; `zone` 'head' | 'body' |
   * 'legs' where it struck; `strength` scales the blow (1 = RAGDOLL.blow); `ground` the height of
   * the ground under the body.
   */
  start({push = {x: 0, y: 0, z: 0}, dir = {x: 0, z: 1}, zone = 'body', strength = 1, ground: g = 0} = {}) {
   if (!ready) return false;
   root.updateMatrixWorld(true);
   for (let i = 0; i < n; i++) {
    const name = POINTS[i];
    if (name === 'headTop') {
     worldOf(bones.Head, pos[i]);
     v.subVectors(pos[i], worldOf(bones.neck_01, w)).normalize();
     pos[i].addScaledVector(v, .2);
    } else worldOf(bones[name], pos[i]);
   }
   sticks.length = 0; limits.length = 0;
   for (const [a, b] of STICKS) sticks.push([I[a], I[b], pos[I[a]].distanceTo(pos[I[b]])]);
   for (const [a, b, k] of LIMITS) limits.push([I[a], I[b], pos[I[a]].distanceTo(pos[I[b]]) * k]);
   bones.pelvis.getWorldQuaternion(start.pelvis); bones.spine_03.getWorldQuaternion(start.chest);
   pelvisFrame(start.pelvisBasis); chestFrame(start.chestBasis);
   bones.Head.getWorldQuaternion(start.head); start.headUp.subVectors(pos[I.headTop], pos[I.Head]).normalize();
   ground = g;
   // Velocities, as the previous positions: the whole body's push, and the blow where it struck.
   const len = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / len, dz = dir.z / len;
   const hit = RAGDOLL.blow[zone] ?? RAGDOLL.blow.body;
   const where = NEIGHBOURS[zone] ?? NEIGHBOURS.body;
   for (let i = 0; i < n; i++) {
    const at = where.includes(POINTS[i]) ? (i === I[where[0]] ? 1 : .6) : 0;
    const vx = push.x + dx * hit * strength * at, vz = push.z + dz * hit * strength * at, vy = (push.y ?? 0);
    prev[i].set(pos[i].x - vx * RAGDOLL.step, pos[i].y - vy * RAGDOLL.step, pos[i].z - vz * RAGDOLL.step);
   }
   // A cut to the legs, or any blow while standing, also takes the weight off them: the feet are
   // pulled the other way a little, which is what starts a fall rather than a slide.
   const sweep = zone === 'legs' ? 1.4 : .5;
   for (const f of ['foot_l', 'foot_r', 'ball_l', 'ball_r']) {const i = I[f]; prev[i].x += dx * sweep * RAGDOLL.step; prev[i].z += dz * sweep * RAGDOLL.step;}
   active = true; asleep = false; age = 0; still = 0; carry = 0;
   return true;
  },
  /** One frame. Returns false once asleep (the pose then stays as it is). */
  update(dt) {
   if (!active || asleep) return false;
   carry += Math.max(0, Math.min(.25, dt || 0));
   let steps = 0, fastest = 0;
   while (carry >= RAGDOLL.step && steps < RAGDOLL.maxSteps) {fastest = Math.max(fastest, step(RAGDOLL.step)); carry -= RAGDOLL.step; steps++; age += RAGDOLL.step;}
   if (steps === RAGDOLL.maxSteps) carry = 0;
   if (steps) pose();
   still = fastest < RAGDOLL.sleepSpeed ? still + steps * RAGDOLL.step : 0;
   if (still >= RAGDOLL.sleepAfter || age >= RAGDOLL.maxAwake) asleep = true;
   return !asleep;
  },
  reset() {active = false; asleep = false; age = 0; still = 0; carry = 0;}
 };
}
