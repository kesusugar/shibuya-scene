// A single walking player, driven by the same ground the crowd walks on.
//
// There is no new collision geometry here. The pedestrian context the crowd already builds
// carries body-height solids, the walkable surface and the ground height, so the player is
// tested against exactly what the simulated pedestrians are tested against, and a wall that
// stops them stops the player too.
//
// The figure itself is a crowd agent. Reserving one slot in the crowd pool means the
// existing instanced renderer draws and animates the player at no extra draw call, and the
// crowd's own neighbour avoidance sees the player and parts around them.

import {inPolygon} from '../geo/core.mjs';

// The camera arm. Solids are tested at the camera's own height rather than on the ground,
// so it is a facade that pulls the camera in and not a bollard it is sailing well above.
export const CAMERA = Object.freeze({samples: 12, pad: .5, minBack: .9});

export const PLAYER = Object.freeze({
 radius: .35,          // body radius used against solids, matching the crowd's own footprint
 walk: 1.5, run: 4.2,  // m/s; the crowd walks 0.85-2.0, so walking blends into it
 eye: 1.55,            // height the camera frames the player from
 archetype: 'hoodie',  // fixed, so the player is the same person every session
 look: .0022,          // radians per pixel of mouse travel
 pitchLimit: 1.15,     // keeps the follow camera out of the ground and off the zenith
 followBack: 4.6, followUp: 2.1, followLerp: 9,
 // Where a session starts. Chosen by sampling the walkable surface: full kerb height, so
 // it is pavement rather than a gap between solids, and 27 m out with the crossing in view.
 start: [12, 24], startHeading: Math.atan2(-12, -24)
});

/** Furthest the player may stand from the middle, matching the modelled extent. */
const LIMIT = 244;

export function createPlayer(ctx, {start = PLAYER.start, heading = PLAYER.startHeading} = {}) {
 const state = {
  x: start[0], z: start[1], y: 0, heading, pitch: -.12,
  speed: 0, running: false, moving: false, alive: true,
  runOver: 0, hitBy: null
 };
 const keys = new Set();
 let padPoll = null;
 /** The first connected pad. Chrome hands back a fresh snapshot each call, never a live one. */
 const gamepad = () => {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) if (pad?.connected) return pad;
  return null;
 };
 let detach = null;

 const standable = (x, z) => Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT && !ctx.solid(x, z, PLAYER.radius);

 /**
  * Move along `dx,dz`, and where that is blocked try each axis alone so the player slides
  * along a wall instead of sticking to it. Resolving the axes separately is what keeps a
  * glancing approach to a facade from stopping dead.
  */
 const advance = (dx, dz) => {
  if (standable(state.x + dx, state.z + dz)) {state.x += dx; state.z += dz; return true;}
  if (dx && standable(state.x + dx, state.z)) {state.x += dx; return true;}
  if (dz && standable(state.x, state.z + dz)) {state.z += dz; return true;}
  return false;
 };

 const api = {
  state,
  /**
   * Keyboard and pointer, attached only while the player has the scene.
   *
   * Pointer lock takes the cursor, so the only way back to the rest of the browser is a key.
   * Escape releases the lock natively but a click on the scene takes it straight back, which
   * leaves no way out at all; `onExit` is called so Escape leaves play entirely. `onDrive`
   * is the get-in/get-out key.
   */
  attach(element, {onExit, onDrive} = {}) {
   if (detach) return;
   const down = (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {keys.clear(); onExit?.(); return;}
    if (k === 'f') {onDrive?.(); e.preventDefault(); return;}
    if (!'wasd'.includes(k) && k !== 'shift' && k !== ' ') return;
    keys.add(k === ' ' ? 'shift' : k); e.preventDefault();
   };
   const up = (e) => {const k = e.key.toLowerCase(); keys.delete(k === ' ' ? 'shift' : k);};
   const blur = () => keys.clear();
   const move = (e) => {
    if (document.pointerLockElement !== element) return;
    state.heading -= e.movementX * PLAYER.look;
    state.pitch = Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, state.pitch - e.movementY * PLAYER.look));
   };
   const click = () => {if (document.pointerLockElement !== element) element.requestPointerLock?.();};
   // Edge-detected, because a held button would otherwise fire get-in/get-out every frame.
   let padPrev = {drive: false, exit: false};
   padPoll = () => {
    const pad = gamepad(); if (!pad) return;
    const drive = pad.buttons[0]?.pressed ?? false, exit = pad.buttons[9]?.pressed ?? false;
    if (drive && !padPrev.drive) onDrive?.();
    if (exit && !padPrev.exit) {keys.clear(); onExit?.();}
    padPrev = {drive, exit};
    const look = pad.axes[2] ?? 0, pitch = pad.axes[3] ?? 0;
    if (Math.abs(look) > PLAYER.padDeadzone) state.heading -= look * PLAYER.padLook;
    if (Math.abs(pitch) > PLAYER.padDeadzone)
     state.pitch = Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, state.pitch - pitch * PLAYER.padLook));
   };
   window.addEventListener('keydown', down); window.addEventListener('keyup', up);
   window.addEventListener('blur', blur);
   element.addEventListener('mousemove', move); element.addEventListener('click', click);
   detach = () => {
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    element.removeEventListener('mousemove', move); element.removeEventListener('click', click);
    if (document.pointerLockElement === element) document.exitPointerLock?.();
    keys.clear(); padPoll = null; detach = null;
   };
  },
  detach() {detach?.();},

  /**
   * Drop the player onto walkable ground near `x,z`. Merely being clear of solids is not
   * enough for a starting point -- a gap between two buildings satisfies that and leaves the
   * player standing on bare land -- so the walkable surface is required first, and only if
   * nothing is found within the search does it fall back to any clear spot.
   */
  place(x = PLAYER.start[0], z = PLAYER.start[1], heading = PLAYER.startHeading) {
   const land = (px, pz) => {
    Object.assign(state, {x: px, z: pz, heading, speed: 0, alive: true, runOver: 0, hitBy: null});
    state.y = ctx.height(px, pz); return true;
   };
   for (const test of [ctx.safe, standable]) {
    for (let r = 0; r <= 24; r += 1.5) for (let i = 0; i < (r ? 12 : 1); i++) {
     const a = i * Math.PI / 6, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
     if (test(px, pz)) return land(px, pz);
    }
   }
   return false;
  },

  /**
   * The movement axes, shared by walking and driving.
   *
   * A pad is merged in rather than replacing the keys, so both are live at once and neither
   * has to be selected. Sticks are analogue and the keys are not, so the larger of the two
   * wins per axis: resting a thumb on a drifting stick cannot then cancel a held key. The
   * deadzone is what keeps a worn stick from walking the player across the street on its own.
   */
  input() {
   // Polled here rather than in step(): driving calls input() and never calls step(), so the
   // pad would go dead the moment the player got into a car.
   padPoll?.();
   let fx = 0, fz = 0;
   if (keys.has('w')) fz += 1; if (keys.has('s')) fz -= 1;
   if (keys.has('a')) fx -= 1; if (keys.has('d')) fx += 1;
   let running = keys.has('shift');
   const pad = gamepad();
   if (pad) {
    const dead = v => Math.abs(v) < PLAYER.padDeadzone ? 0 : v;
    const px = dead(pad.axes[0] ?? 0), pz = dead(-(pad.axes[1] ?? 0));
    // Triggers drive: right is throttle, left is brake and reverse.
    const rt = pad.buttons[7]?.value ?? 0, lt = pad.buttons[6]?.value ?? 0;
    const drive = dead(rt - lt);
    const wants = Math.abs(pz) > Math.abs(drive) ? pz : drive;
    if (Math.abs(wants) > Math.abs(fz)) fz = wants;
    if (Math.abs(px) > Math.abs(fx)) fx = px;
    running = running || (pad.buttons[10]?.pressed ?? false) || (pad.buttons[1]?.pressed ?? false);
   }
   return {forward: fz, strafe: fx, running};
  },
  /** While driving, the body rides in the car and is posed from it rather than walked. */
  rideTo(x, z, heading) {
   state.x = x; state.z = z; state.heading = heading; state.speed = 0; state.moving = false;
  },

  step(dt) {
   if (!state.alive) {state.runOver += dt; state.speed = 0; state.moving = false; return;}
   const {forward: fz, strafe: fx, running} = api.input();
   const len = Math.hypot(fx, fz);
   state.running = running;
   state.moving = len > 0;
   if (len > 0) {
    const target = state.running ? PLAYER.run : PLAYER.walk;
    state.speed += (target - state.speed) * Math.min(1, dt * 10);
    // Forward is where the player is looking; strafing is perpendicular to it.
    const s = Math.sin(state.heading), c = Math.cos(state.heading);
    const step = state.speed * dt / len;
    advance((fz * s + fx * c) * step, (fz * c - fx * s) * step);
   } else state.speed += (0 - state.speed) * Math.min(1, dt * 12);
   state.y = ctx.height(state.x, state.z);
  },

  /** True while the player is standing on carriageway rather than pavement. */
  get onRoad() {return ctx.onRoad(state.x, state.z);},

  /** Called when a vehicle box overlaps the player; the run-over is recorded, not simulated. */
  knockDown(vehicle) {
   if (!state.alive) return false;
   state.alive = false; state.runOver = 0; state.hitBy = vehicle?.type ?? 'vehicle'; return true;
  },
  revive() {return api.place();}
 };
 return api;
}

/** Is anything solid at this point, at this height? */
function solidAt(ctx, x, z, y, r) {
 for (const {value: s} of ctx.solids.query({minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r})) {
  if (s.bottom > y || s.top < y) continue;                 // the camera clears it
  if (inPolygon([x, z], s.polygon)) return true;
  const ring = s.polygon.outer;
  for (let i = 0; i < ring.length; i++) {
   const a = ring[i], b = ring[(i + 1) % ring.length];
   const dx = b[0] - a[0], dz = b[1] - a[1];
   const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
   if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < r) return true;
  }
 }
 return false;
}

/**
 * Where the third-person camera sits for the player's current pose, into an
 * {x,y,z,tx,ty,tz} scratch.
 *
 * With a context, the arm is shortened to the last clear point between the player and where
 * the camera would like to be, so backing into a facade slides the camera forward rather
 * than through the wall. The look-at point does not move with it: the arm changes length,
 * never direction, so the view does not swing when a wall is brushed.
 */
export function playerCamera(state, out = {}, ctx = null) {
 const s = Math.sin(state.heading), c = Math.cos(state.heading), cp = Math.cos(state.pitch);
 const eye = state.y + PLAYER.eye;
 const back = PLAYER.followBack * cp;
 const wantX = state.x - s * back, wantZ = state.z - c * back;
 const wantY = eye + PLAYER.followUp + PLAYER.followBack * Math.sin(state.pitch);
 out.x = wantX; out.y = wantY; out.z = wantZ;
 if (ctx) {
  const floor = CAMERA.minBack / Math.max(.01, PLAYER.followBack);
  for (let i = CAMERA.samples; i >= 1; i--) {
   const t = i / CAMERA.samples;
   const px = state.x + (wantX - state.x) * t, pz = state.z + (wantZ - state.z) * t;
   const py = eye + (wantY - eye) * t;
   if (!solidAt(ctx, px, pz, py, CAMERA.pad)) {out.x = px; out.y = py; out.z = pz; break;}
   if (t <= floor) {out.x = state.x; out.y = eye; out.z = state.z; break;}
  }
 }
 const ahead = 6;
 out.tx = state.x + s * cp * ahead;
 out.ty = eye + Math.sin(state.pitch) * ahead;
 out.tz = state.z + c * cp * ahead;
 return out;
}
