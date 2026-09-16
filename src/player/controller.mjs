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

export const PLAYER = Object.freeze({
 radius: .35,          // body radius used against solids, matching the crowd's own footprint
 walk: 1.5, run: 4.2,  // m/s; the crowd walks 0.85-2.0, so walking blends into it
 eye: 1.55,            // camera height in first person
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
  speed: 0, running: false, moving: false, alive: true, mode: 'third',
  runOver: 0, hitBy: null
 };
 const keys = new Set();
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
  /** Keyboard and pointer, attached only while the player has the scene. */
  attach(element) {
   if (detach) return;
   const down = (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
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
   window.addEventListener('keydown', down); window.addEventListener('keyup', up);
   window.addEventListener('blur', blur);
   element.addEventListener('mousemove', move); element.addEventListener('click', click);
   detach = () => {
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    element.removeEventListener('mousemove', move); element.removeEventListener('click', click);
    if (document.pointerLockElement === element) document.exitPointerLock?.();
    keys.clear(); detach = null;
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

  step(dt) {
   if (!state.alive) {state.runOver += dt; state.speed = 0; state.moving = false; return;}
   let fx = 0, fz = 0;
   if (keys.has('w')) fz += 1; if (keys.has('s')) fz -= 1;
   if (keys.has('a')) fx -= 1; if (keys.has('d')) fx += 1;
   const len = Math.hypot(fx, fz);
   state.running = keys.has('shift');
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

/** Where the camera sits for the player's current pose. `out` is a {x,y,z,tx,ty,tz} scratch. */
export function playerCamera(state, out = {}) {
 const s = Math.sin(state.heading), c = Math.cos(state.heading), cp = Math.cos(state.pitch);
 const eye = state.y + PLAYER.eye;
 if (state.mode === 'first') {
  out.x = state.x; out.y = eye; out.z = state.z;
 } else {
  const back = PLAYER.followBack * cp;
  out.x = state.x - s * back; out.z = state.z - c * back;
  out.y = eye + PLAYER.followUp + PLAYER.followBack * Math.sin(state.pitch);
 }
 // Both modes look the same way, so switching does not swing the view.
 const ahead = 6;
 out.tx = state.x + s * cp * ahead;
 out.ty = eye + Math.sin(state.pitch) * ahead;
 out.tz = state.z + c * cp * ahead;
 return out;
}
