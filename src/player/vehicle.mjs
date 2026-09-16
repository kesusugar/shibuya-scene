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
import {safePose} from '../traffic/graph.mjs';

export const CAR = Object.freeze({
 type: 'sedan',
 accel: 6.5, brake: 11, drag: 1.4,      // m/s^2
 reverseMax: 4.5,                        // reverse is slower than forward, as it should be
 steer: 1.9,                             // rad/s at full lock
 steerEase: 6,                           // how fast the wheel reaches full lock
 grip: 14,                               // arcade: heading and travel converge quickly
 // Steering authority falls away as the car slows, so a stopped car does not spin on the
 // spot, and a fast one is not twitchy.
 steerLow: 1.2, steerFull: 7,
 enterRange: 5.5,                        // the car parks on the road, the player waits on the kerb
 // The camera rides further back and higher than the walking one: at 11 m/s the walking
 // arm puts the road under the bonnet and nothing else in frame.
 followBack: 8.2, followUp: 3.2, eye: 1.4
});

export function createPlayerVehicle(sim, ctx) {
 const def = VEHICLES[CAR.type];
 const state = {x: 0, z: 0, y: 0, heading: 0, speed: 0, steering: 0, active: false, slot: null};
 const probe = {x: 0, z: 0, heading: 0};

 /** Is this pose legal for the car? Stage 1a defers to the traffic model's own test. */
 const poseOk = (x, z, heading) => {
  probe.x = x; probe.z = z; probe.heading = heading;
  return safePose(sim.graph.ctx, probe, CAR.type, .05);
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
     if (!poseOk(px, pz, ph)) continue;
     if (!poseOk(px + Math.sin(ph) * 6, pz + Math.cos(ph) * 6, ph)) continue;   // road ahead
     state.slot = slot; state.x = px; state.z = pz; state.heading = ph; state.speed = 0; state.steering = 0;
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
   // S brakes while moving forward, and becomes reverse once stopped.
   if (throttle > 0) state.speed += CAR.accel * dt;
   else if (throttle < 0) {
    if (state.speed > .2) state.speed -= CAR.brake * dt;
    else state.speed = Math.max(-CAR.reverseMax, state.speed - CAR.accel * .7 * dt);
   } else state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), CAR.drag * dt);
   state.speed = Math.max(-CAR.reverseMax, Math.min(def.speed, state.speed));

   // Ease the wheel rather than snapping it, and give a crawling car little authority.
   state.steering += (turn - state.steering) * Math.min(1, dt * CAR.steerEase);
   const bite = Math.min(1, Math.max(0, (Math.abs(state.speed) - CAR.steerLow) / (CAR.steerFull - CAR.steerLow)));
   const heading = state.heading - state.steering * CAR.steer * dt * bite * Math.sign(state.speed || 1);

   // Give way progressively rather than refusing the whole step. A turn that would put a
   // wheel over the kerb is first tried at half lock, then straight, then at half the
   // travel, so the car scrubs along the edge of the carriageway instead of stalling every
   // other frame -- which is what killing the speed on a rejected pose used to feel like.
   const travel = state.speed * dt;
   const attempts = [[heading, travel], [(heading + state.heading) / 2, travel],
                     [state.heading, travel], [state.heading, travel * .5]];
   let moved = false;
   for (const [h, d] of attempts) {
    const nx = state.x + Math.sin(h) * d, nz = state.z + Math.cos(h) * d;
    if (!poseOk(nx, nz, h)) continue;
    state.x = nx; state.z = nz; state.heading = h; moved = true; break;
   }
   if (!moved) state.speed = 0;               // nose against something: stop, do not bounce
   api.sync();
  },

  /** Write the pose back to the pool slot, which is what gets drawn and what the AI sees. */
  sync() {
   const slot = state.slot; if (!slot) return;
   slot.x = state.x; slot.z = state.z; slot.heading = state.heading;
   slot.speed = Math.abs(state.speed); slot.brake = state.speed < 0 || Math.abs(state.speed) < .1;
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
