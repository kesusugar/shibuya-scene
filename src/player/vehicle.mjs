// The car the player drives.
//
// It is a reserved slot in the traffic pool, not a new object. That slot still enters the
// simulation's spatial grid, so the AI cars' own look-ahead sees it and stops behind it,
// and the existing renderer draws it because it draws whatever is in the pool. What the
// simulation no longer does is steer it, audit it, or hold the pedestrian phase red for it.
//
// Handling is arcade: the car goes where it is pointed, with no slide. Momentum can come
// later; this stage is about the loop -- get in, drive, get out -- being right first.

import {VEHICLES} from '../traffic/config.mjs';
import {DODGE_SPEED} from '../life/simulation.mjs';
import {safePose} from '../traffic/graph.mjs';
import {corners, boxOverlap} from '../traffic/path.mjs';
import {bounds, inPolygon} from '../geo/core.mjs';

export const CAR = Object.freeze({
 type: 'sedan',
 accel: 6.5, brake: 11, drag: 1.4,      // m/s^2
 reverseMax: 4.5,                        // reverse is slower than forward, as it should be
 steer: 1.9,                             // rad/s at full lock
 steerEase: 6,                           // how fast the wheel reaches full lock
 // Inertia. `heading` is where the nose points, `course` is where the body is actually
 // going, and they converge at `grip` per second rather than instantly -- that lag is the
 // slide. It is self-limiting: steering authority already falls away as the car slows, so a
 // parking car barely builds any slip while a fast turn washes out properly.
 grip: 9,
 slipMax: .45,                           // rad the course may lag the nose by, about 26 deg
 carPad: .05,                            // m of clearance kept from other cars
 // Steering authority falls away as the car slows, so a stopped car does not spin on the
 // spot, and a fast one is not twitchy.
 steerLow: 1.2, steerFull: 7,
 enterRange: 5.5,                        // the car parks on the road, the player waits on the kerb
 kerbLift: 9,                            // m/s the body rises and falls mounting a kerb
 pivot: 1.1,                             // rad/s the wheel turns the body when it cannot move
 // A body is a small box for this purpose; the crowd's own radius is .25.
 bodyWidth: .5, bodyLength: .5,
 // Getting out of the way. People react to where the car is going to be, not to where it
 // is, so the corridor is the body swept forward by `alertLead` seconds of travel. Below
 // `alertSpeed` a car is just traffic and nobody scatters for it.
 alertSpeed: 3, alertLead: 1.5, alertReach: 18, alertWidth: 2.6,
 // Damage. A hit costs speed proportional to how fast it was taken, and a wrecked car keeps
 // only `wreckFloor` of its performance -- it never becomes undriveable.
 damagePerSpeed: .025, wreckFloor: .45,
 takeOverRange: 6,                       // how far you can reach another car to take it over
 // The camera rides further back and higher than the walking one: at 11 m/s the walking
 // arm puts the road under the bonnet and nothing else in frame.
 followBack: 8.2, followUp: 3.2, eye: 1.4
});

/** Do two segments cross? Used to catch a wall thinner than the car's corner spacing. */
/** Shortest signed angle between two headings. */
function wrapAngle(a) {return Math.atan2(Math.sin(a), Math.cos(a));}

function segmentsCross(a, b, c, d) {
 const s = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
 return s(a, b, c) !== s(a, b, d) && s(c, d, a) !== s(c, d, b);
}

export function createPlayerVehicle(sim, ctx) {
 // Not const: taking over a parked van makes the player a van, and every box test from the
 // pose check to the strike scan has to use the body that is actually being driven.
 let def = VEHICLES[CAR.type];
 const state = {x: 0, z: 0, y: 0, heading: 0, course: 0, speed: 0, steering: 0,
                type: CAR.type, damage: 0, stalled: false, active: false, slot: null};
 const probe = {x: 0, z: 0, heading: 0};

 /**
  * Is this pose legal for the car?
  *
  * safePose asks two things: that all four corners sit on carriageway, and that the body
  * touches nothing solid. Driving over a kerb means dropping the first and keeping the
  * second -- a car may leave the road, it may not drive through a wall. The solid half is
  * reimplemented here rather than loosened in traffic/graph.mjs, which is a STATIC_ROOT and
  * would have moved the static pack's key for something only the player ever does.
  */
 const clearOfSolids = (x, z, heading) => {
  probe.x = x; probe.z = z; probe.heading = heading;
  const ring = corners(probe, def.width, def.length, .05);
  for (const {value: s} of sim.graph.ctx.solid.query(bounds(ring))) {
   const outer = s.outer ?? s.polygon?.outer; if (!outer) continue;
   if (ring.some(p => inPolygon(p, {outer, holes: []}))) return false;
   if (outer.some(p => inPolygon(p, {outer: ring, holes: []}))) return false;
   // Corner-to-corner crossing, for a wall thinner than the gap between sampled points.
   for (let i = 0; i < 4; i++) for (let j = 0; j < outer.length; j++)
    if (segmentsCross(ring[i], ring[(i + 1) % 4], outer[j], outer[(j + 1) % outer.length])) return false;
  }
  return true;
 };
 /**
  * Is this pose legal at all? Solids are static, the other cars are not, and the car has to
  * respect both -- driving through an AI car was the one thing decided but never built.
  * The traffic simulation already answers the moving half for its own cars, against the same
  * spatial grid the player's slot lives in, so it answers it here too; the player's own slot
  * is excluded or the car would collide with itself.
  */
 const poseOk = (x, z, heading) => {
  if (!clearOfSolids(x, z, heading)) return false;
  probe.x = x; probe.z = z; probe.heading = heading;
  return !sim.blocked(probe, state.type, state.slot, CAR.carPad);
 };
 /** Road-only test, still used when parking the car so it starts on the carriageway. */
 const onRoadPose = (x, z, heading) => {
  probe.x = x; probe.z = z; probe.heading = heading;
  return safePose(sim.graph.ctx, probe, state.type, .05);
 };

 const api = {
  state, def,
  /** Take a pool slot and stand the car on legal ground near `x,z`. */
  spawn(x, z, heading = 0) {
   const slot = state.slot ?? sim.pool.find(v => !v.active);
   if (!slot) return false;
   // Search outward for somewhere the car legally fits, since the player is on a pavement
   // and the car needs road under all four corners. The heading has to have road *ahead* of
   // it too: picking the first of eight that merely fits parks the car facing a kerb, and it
   // then cannot pull away.
   for (let r = 3; r <= 40; r += 1.5) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    for (let h = 0; h < 16; h++) {
     const ph = h * Math.PI / 8;
     if (!onRoadPose(px, pz, ph)) continue;
     if (!onRoadPose(px + Math.sin(ph) * 6, pz + Math.cos(ph) * 6, ph)) continue;   // road ahead
     state.slot = slot; state.x = px; state.z = pz; state.heading = ph; state.course = ph;
     state.speed = 0; state.steering = 0; state.type = CAR.type; state.damage = 0; state.stalled = false;
     def = VEHICLES[CAR.type];
     Object.assign(slot, {
      active: true, controlled: true, parked: true, service: false, platoon: undefined,
      type: CAR.type, x: px, z: pz, heading: ph, speed: 0, brake: false, blinker: 0,
      lane: 0, transition: -1, next: -1, progress: 0, age: 0, stuck: 0, junction: null
     });
     slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
     state.active = true;
     return true;
    }
   }
   return false;
  },

  /**
   * The nearest car a person standing here could get into, which need not be the one this
   * object is currently holding. Only parked cars: stepping into moving traffic and taking
   * the wheel mid-flow would drop a car out of its lane with a queue behind it.
   */
  nearestTakeover(x, z) {
   let best = null, bestD = CAR.takeOverRange;
   for (const v of sim.pool) {
    if (!v.active || !v.parked || v === state.slot || v.controlled) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bestD) {bestD = d; best = v;}
   }
   return best;
  },

  /**
   * Take the wheel of another car. The slot being left goes back to being ordinary parked
   * traffic -- leaving it `controlled` would hide it from the AI, the audit and the tier
   * budget for the rest of the session -- and the body being driven changes with it, so a
   * van is a van for every box test from here on.
   */
  takeOver(slot) {
   if (!slot || slot === state.slot) return false;
   if (state.slot) {state.slot.controlled = false; state.slot.parked = true; state.slot.speed = 0;}
   state.slot = slot; state.type = slot.type; def = VEHICLES[slot.type];
   state.x = slot.x; state.z = slot.z; state.heading = slot.heading; state.course = slot.heading;
   state.y = ctx.height(slot.x, slot.z); state.speed = 0; state.steering = 0; state.damage = 0; state.stalled = false;
   Object.assign(slot, {controlled: true, parked: true, service: false, platoon: undefined,
    speed: 0, brake: false, blinker: 0, lane: 0, transition: -1, next: -1, progress: 0,
    age: 0, stuck: 0, junction: null});
   slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
   state.active = true;
   return true;
  },

  /**
   * The nearest car this person could get into, and whether they are close enough yet.
   *
   * Pressing the button out of range used to do nothing at all and say nothing about why,
   * which on a phone is indistinguishable from a broken button. This is what the label reads
   * from, so the answer is on screen before the button is pressed.
   */
  nearestEntry(x, z) {
   let best = null;
   const offer = (d, range, slot, kind) => {
    if (!best || d < best.distance) best = {distance: d, range, slot, kind, inRange: d <= range};
   };
   if (state.active) offer(Math.hypot(state.x - x, state.z - z), CAR.enterRange, state.slot, 'own');
   for (const v of sim.pool) {
    if (!v.active || !v.parked || v === state.slot || v.controlled) continue;
    offer(Math.hypot(v.x - x, v.z - z), CAR.takeOverRange, v, 'parked');
   }
   return best;
  },

  /** Where a person standing here could get in from. */
  nearestDoor(x, z) {
   if (!state.active) return null;
   const d = Math.hypot(state.x - x, state.z - z);
   return d <= CAR.enterRange ? d : null;
  },

  /**
   * Somewhere beside the car a person can stand. The car is on the carriageway, so the point
   * immediately beside it is road too: the search has to reach the kerb, nearest first, and
   * both sides are tried before widening so you step out onto the closer pavement.
   */
  doorstep() {
   for (let out = def.width / 2 + .8; out <= 9; out += .6) {
    for (const side of [-1, 1]) for (const back of [0, -1.4, 1.4]) {
     const s = Math.sin(state.heading), c = Math.cos(state.heading);
     const x = state.x + c * side * out + s * back, z = state.z - s * side * out + c * back;
     if (ctx.safe(x, z)) return [x, z];
    }
   }
   return null;
  },

  step(dt, input) {
   if (!state.active) return;
   const throttle = (input.forward ?? 0), turn = (input.strafe ?? 0);
   const health = Math.max(CAR.wreckFloor, 1 - (1 - CAR.wreckFloor) * state.damage);
   // S brakes while moving forward, and becomes reverse once stopped.
   if (throttle > 0) state.speed += CAR.accel * health * dt;
   else if (throttle < 0) {
    if (state.speed > .2) state.speed -= CAR.brake * dt;
    else state.speed = Math.max(-CAR.reverseMax, state.speed - CAR.accel * .7 * dt);
   } else state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), CAR.drag * dt);
   state.speed = Math.max(-CAR.reverseMax * health, Math.min(def.speed * health, state.speed));

   // Ease the wheel rather than snapping it, and give a crawling car little authority.
   state.steering += (turn - state.steering) * Math.min(1, dt * CAR.steerEase);
   const bite = Math.min(1, Math.max(0, (Math.abs(state.speed) - CAR.steerLow) / (CAR.steerFull - CAR.steerLow)));
   const heading = state.heading - state.steering * CAR.steer * dt * bite * Math.sign(state.speed || 1);

   // Give way progressively rather than refusing the whole step. A turn that would put a
   // wheel over the kerb is first tried at half lock, then straight, then at half the
   // travel, so the car scrubs along the edge of the carriageway instead of stalling every
   // other frame -- which is what killing the speed on a rejected pose used to feel like.
   // The course chases the nose instead of matching it, and is not allowed to fall more than
   // slipMax behind, so the car slides through a hard turn without ever ending up sideways.
   const lag = 1 - Math.exp(-CAR.grip * dt);
   let course = state.course + wrapAngle(heading - state.course) * lag;
   course = heading - Math.max(-CAR.slipMax, Math.min(CAR.slipMax, wrapAngle(heading - course)));

   // Give way progressively rather than refusing the whole step. A turn that would put a
   // wheel over the kerb is first tried at half lock, then straight, then at half the
   // travel, so the car scrubs along the edge of the carriageway instead of stalling every
   // other frame -- which is what killing the speed on a rejected pose used to feel like.
   const travel = state.speed * dt;
   const attempts = [[heading, course, travel], [heading, state.course + wrapAngle(course - state.course) / 2, travel],
                     [state.heading, state.course, travel], [state.heading, state.course, travel * .5]];
   let moved = false;
   for (const [h, c, d] of attempts) {
    const nx = state.x + Math.sin(c) * d, nz = state.z + Math.cos(c) * d;
    if (!poseOk(nx, nz, h)) continue;
    state.x = nx; state.z = nz; state.heading = h; state.course = c; moved = true; state.stalled = false; break;
   }
   if (!moved) {
    // Wear is charged per impact, not per frame in contact. Holding the throttle against a
    // wall is one crash however long you lean on it: charging it every frame wrote the car
    // off in a couple of seconds of leaning. Hitting something at 11 m/s costs more than
    // nosing into it at walking pace, so the charge is the speed that was just lost.
    if (!state.stalled) state.damage = Math.min(1, state.damage + Math.abs(state.speed) * CAR.damagePerSpeed);
    state.stalled = true;
    state.speed = 0;                          // nose against something: stop, do not bounce
    state.course = state.heading;             // and no momentum survives the impact
    // Stopping is not enough on its own. Steering authority is a function of speed, so a
    // car held at zero against a wall can never turn away from it: full throttle just
    // re-zeroes itself every frame and the only way out is reverse. Let the wheel swing the
    // body instead -- but about an axle, not about the centre. Turning about the centre
    // drives a front corner straight into the wall the car is already touching and is
    // always rejected; swinging about the rear axle takes the nose away from it, and about
    // the front axle takes the tail away, which between them cover nosing in and backing in.
    const swing = state.heading - state.steering * CAR.pivot * dt;
    if (state.steering) for (const arm of [-def.length * .35, def.length * .35]) {
     const px = state.x + Math.sin(state.heading) * arm, pz = state.z + Math.cos(state.heading) * arm;
     const nx = px - Math.sin(swing) * arm, nz = pz - Math.cos(swing) * arm;
     if (!poseOk(nx, nz, swing)) continue;
     state.x = nx; state.z = nz; state.heading = swing; break;
    }
   }
   // The pedestrian context is the only one that knows ground height, and a kerb is 15 cm:
   // without this the car sinks into the pavement the moment it leaves the road.
   const ground = ctx.height(state.x, state.z);
   state.y += Math.sign(ground - state.y) * Math.min(Math.abs(ground - state.y), CAR.kerbLift * dt);
   api.sync();
  },

  /** Write the pose back to the pool slot, which is what gets drawn and what the AI sees. */
  sync() {
   const slot = state.slot; if (!slot) return;
   slot.x = state.x; slot.z = state.z; slot.heading = state.heading; slot.y = state.y;
   slot.speed = Math.abs(state.speed); slot.brake = state.speed < 0 || Math.abs(state.speed) < .1;
  },

  /**
   * Who did the car just hit?
   *
   * Only the crowd cells the car actually covers are looked at -- there are nearly two
   * thousand pedestrians and the car spans a handful of two-metre cells -- and each
   * candidate is measured with the traffic model's own box overlap, so a person is judged
   * against the car exactly as the cars are against each other.
   *
   * The same threshold gates both halves of the rule. Below it the crowd treats the car as
   * an obstacle and walks around it, so it must not knock anyone down: otherwise creeping
   * into a queue, or braking to a stop in one, would scatter bodies at walking pace.
   */
  strikePedestrians(crowd) {
   if (!state.active || !crowd || Math.abs(state.speed) < DODGE_SPEED) return 0;
   const reach = Math.hypot(def.width, def.length) / 2 + 1;
   const x0 = Math.floor((state.x - reach) / 2), x1 = Math.floor((state.x + reach) / 2);
   const z0 = Math.floor((state.z - reach) / 2), z1 = Math.floor((state.z + reach) / 2);
   const body = {width: CAR.bodyWidth, length: CAR.bodyLength};
   let hit = 0;
   for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    for (const p of crowd.grid.get(i + ',' + j) ?? []) {
     if (!p.active || p.controlled || p.struck !== undefined) continue;
     if (boxOverlap(state, def, p, body, 0) && crowd.strike(p)) hit++;
    }
   }
   return hit;
  },

  /**
   * Warn everyone the car is about to reach.
   *
   * This is the half that was missing: people dodged the car where it stood, but walked on
   * regardless of one bearing down on them, so the first they knew of it was being hit.
   * The corridor is the body swept forward by alertLead seconds of travel, and the scan
   * runs over the crowd's own grid cells, so the cost is the corridor rather than the two
   * thousand pedestrians. Whoever is inside it is told which way is out -- perpendicular to
   * the car's course, towards whichever side they are already nearer -- and the crowd does
   * the actual moving, so nobody is pushed anywhere the walkable context forbids.
   */
  alertPedestrians(crowd) {
   if (!state.active || !crowd || Math.abs(state.speed) < CAR.alertSpeed) return 0;
   const dir = Math.sign(state.speed);
   const s = Math.sin(state.course) * dir, c = Math.cos(state.course) * dir;
   const reach = Math.min(CAR.alertReach, Math.abs(state.speed) * CAR.alertLead) + def.length / 2;
   const half = def.width / 2 + CAR.alertWidth;
   // Cells covering the swept corridor, which is the body plus everything ahead of it.
   const ex = state.x + s * reach, ez = state.z + c * reach;
   const x0 = Math.floor((Math.min(state.x, ex) - half) / 2), x1 = Math.floor((Math.max(state.x, ex) + half) / 2);
   const z0 = Math.floor((Math.min(state.z, ez) - half) / 2), z1 = Math.floor((Math.max(state.z, ez) + half) / 2);
   let warned = 0;
   for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    for (const p of crowd.grid.get(i + ',' + j) ?? []) {
     if (!p.active || p.controlled || p.struck !== undefined) continue;
     const dx = p.x - state.x, dz = p.z - state.z;
     const along = dx * s + dz * c, across = dx * c - dz * s;   // car-relative coordinates
     if (along < -def.length / 2 || along > reach || Math.abs(across) > half) continue;
     // Out is sideways, towards the shoulder they are already closer to.
     const side = across >= 0 ? 1 : -1;
     if (crowd.scatter(p, c * side, -s * side)) warned++;
    }
   }
   return warned;
  },

  release() {
   const slot = state.slot;
   if (slot) {slot.controlled = false; slot.parked = true; slot.speed = 0;}
   state.active = false; state.slot = null;
  }
 };
 return api;
}

/** Third-person camera for the car, framed further back than the walking one. */
export function vehicleCamera(state, out = {}) {
 const s = Math.sin(state.heading), c = Math.cos(state.heading);
 const eye = state.y + CAR.eye;
 out.x = state.x - s * CAR.followBack; out.z = state.z - c * CAR.followBack;
 out.y = eye + CAR.followUp;
 const ahead = 14;
 out.tx = state.x + s * ahead; out.ty = eye + 0.4; out.tz = state.z + c * ahead;
 return out;
}
