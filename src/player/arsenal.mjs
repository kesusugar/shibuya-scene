// The player's weapons in the scene (PLAN-WEAPONS). The scene hands this one object its systems
// each frame; the rules live in weapons.mjs (inventory), combat.mjs (the katana's cut and a
// gunshot's wound), ballistics.mjs (where a bullet goes) and weapon-effects.mjs (what it looks
// like).
//
// It owns what the player is holding, and writes it onto the player's state -- `weapon`, and for
// the pistol `aim`, `aimTarget`, `aimHeading`, `shotLeft`, `reloadLeft` -- which is what the
// figure draws (figure.mjs, aim-layer.mjs) and combat reads.
import {createInventory,WEAPONS} from './weapons.mjs';
import {createWeaponEffects} from './weapon-effects.mjs';
import {castShot,peopleAlong,BALLISTICS} from './ballistics.mjs';
import {onRails} from './combat.mjs';
import {VEHICLES} from '../traffic/config.mjs';
import {ARCHETYPES} from '../life/config.mjs';

export const ARSENAL = Object.freeze({
 // Soft lock-on with a mouse: a person whose chest is this close to the crosshair ray (radians)
 // and this near is aimed at instead of the point behind them.
 softLock: .05, softRange: 40,
 // A pad's stick is coarser than a mouse (C3): its soft lock is a little wider.
 padLock: .12,
 // A phone aims by lock-on only (R16): the nearest person this far and this wide of the view.
 touchLock: .52, touchRange: 30,
 // A click without aiming raises the gun first; the shot waits for the aim, up to this long.
 raiseWait: .5, raiseWeight: .8,
 chest: 1.3,       // m above the feet: where a lock-on aims, on a 1.76 m body
 muzzleFallback: 1.4
});

const heightOf = p => ARCHETYPES[p?.archetype]?.height ?? BALLISTICS.bodyHeight;
const aliveTarget = p => p?.active && !p.controlled && p.struck === undefined && !p.combatDead;

/**
 * Gunfire in the street (R14): the nearest people within `radius` who can run, run -- at most
 * `cap` of them, so one shot cannot empty the crossing. Anyone on rails (a crossing in progress,
 * the Scramble cast on its track) is never taken off it: being stopped there holds the signals
 * (§16a), and the crossing's own clear-out moves them on. Pure over the crowd's grid. Returns how
 * many were sent running.
 */
export function gunfirePanic(crowd, x, z, {radius = WEAPONS.pistol.witnessRadius, cap = WEAPONS.pistol.panicCap,
                                         severity = WEAPONS.pistol.witnessSeverity} = {}) {
 if (!crowd?.grid || !crowd.flee) return 0;
 const near = [];
 const r = Math.ceil(radius / 2);
 for (let i = Math.floor(x / 2) - r; i <= Math.floor(x / 2) + r; i++) for (let j = Math.floor(z / 2) - r; j <= Math.floor(z / 2) + r; j++)
  for (const p of crowd.grid.get(i + ',' + j) ?? []) {
   if (!aliveTarget(p) || p.combatTarget === 'player' || p.officer) continue;
   const d = Math.hypot(p.x - x, p.z - z);
   if (d <= radius) near.push([d, p]);
  }
 near.sort((a, b) => a[0] - b[0]);
 let n = 0;
 for (const [d, p] of near) {
  if (n >= cap) break;
  if (onRails(p)) {crowd.say?.(p, 'alert', .8); continue;}
  if (crowd.flee(p, p.x - x, p.z - z, {urgency: severity * (1 - .4 * d / radius), from: {x, z}})) n++;
 }
 return n;
}

/**
 * @param {object} [options]
 * @param {any} [options.effects]
 * @param {null|((shot:any)=>void)} [options.onShot] every shot: the scene's sound, bloom and crimes
 * @param {null|((event:any)=>number)} [options.onWitness] the HQ crowd's visual reaction (bounded there)
 */
export function createArsenal({effects = createWeaponEffects(), onShot = null, onWitness = null} = {}) {
 const inventory = createInventory();
 let wasDriving = false, aimHeld = false, pendingShot = 0, lastShot = null, touchAim = 0;
 const stats = {switches: 0, clanks: 0, shots: 0, hits: 0, headshots: 0, kills: 0, walls: 0, cars: 0, misses: 0, panicked: 0, maxPanic: 0};

 /** Where the camera's centre ray first meets something, or `range` out along it. */
 function cameraPoint(camera, world, range) {
  const o = camera.position, d = camera.direction;
  const hit = castShot({from: o, dir: d, range, solid: world.solid, ground: world.ground,
   cars: world.cars, dimsOf: world.dimsOf, people: world.people(o, d, range), skip: world.skip, bodyOf: world.bodyOf});
  return hit;
 }
 /** Soft lock (mouse) or lock-on (touch): the person the aim should snap to, or null. */
 function lockTarget(player, camera, world, touch, pad = false) {
  const s = player.state, o = camera?.position ?? {x: s.x, y: s.y + 1.5, z: s.z};
  const d = camera?.direction ?? {x: Math.sin(s.heading), y: 0, z: Math.cos(s.heading)};
  const range = touch ? ARSENAL.touchRange : ARSENAL.softRange, limit = touch ? ARSENAL.touchLock : pad ? ARSENAL.padLock : ARSENAL.softLock;
  let best = null, score = Infinity;
  for (const p of world.people(o, d, range, touch)) {
   if (!aliveTarget(p) || p.archetype === 'kid') continue;
   const body = world.bodyOf?.(p) ?? {y: 0, height: heightOf(p)};
   const cy = body.y + ARSENAL.chest * body.height / BALLISTICS.bodyHeight;
   const vx = p.x - o.x, vy = cy - o.y, vz = p.z - o.z, dist = Math.hypot(vx, vy, vz);
   if (dist > range || dist < 1) continue;
   const cos = (vx * d.x + vy * d.y + vz * d.z) / (dist * Math.hypot(d.x, d.y, d.z));
   const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
   if (angle > limit) continue;
   if (!world.clear(s, p)) continue;   // behind a wall: no lock
   const sc = angle * 20 + dist * .05;
   if (sc < score) {score = sc; best = {p, x: p.x, y: cy, z: p.z};}
  }
  return best;
 }

 function fire(player, world, figure, time) {
  const s = player.state, t = s.aimTarget;
  if (!inventory.fire()) return null;
  // The muzzle as the figure holds it; without a figure, in front of the chest.
  const from = (figure && world.muzzle?.(figure)) ||
   {x: s.x + Math.sin(s.aimHeading ?? s.heading) * .45, y: s.y + ARSENAL.muzzleFallback, z: s.z + Math.cos(s.aimHeading ?? s.heading) * .45};
  const dir = {x: t.x - from.x, y: t.y - from.y, z: t.z - from.z};
  const hit = castShot({from, dir, range: WEAPONS.pistol.range, solid: world.solid, ground: world.ground,
   cars: world.cars, dimsOf: world.dimsOf, people: world.people(from, dir, WEAPONS.pistol.range), skip: world.skip, bodyOf: world.bodyOf});
  stats.shots++;
  s.shotLeft = WEAPONS.pistol.shotSeconds;
  effects.muzzle(from.x, from.y, from.z, hit.dir);
  effects.tracer(from, hit.point);
  let outcome = null;
  if (hit.kind === 'person') {
   stats.hits++; if (hit.zone === 'head') stats.headshots++;
   outcome = world.wound?.(hit.target, {damage: WEAPONS.pistol.bodyDamage, head: hit.zone === 'head', dir: hit.dir}) ?? null;
   if (outcome === 'killed') stats.kills++;
   world.bleed?.(hit.point, hit.dir);
  } else if (hit.kind === 'wall' || hit.kind === 'ground') {
   stats.walls++;
   effects.burst(hit.point.x, hit.point.y, hit.point.z, {count: 10, nx: -hit.dir.x, nz: -hit.dir.z});
   effects.burst(hit.point.x, hit.point.y, hit.point.z, {count: 6, dust: true, nx: -hit.dir.x, nz: -hit.dir.z});
  } else if (hit.kind === 'car') {
   stats.cars++;
   effects.burst(hit.point.x, hit.point.y, hit.point.z, {count: 14, nx: -hit.dir.x, nz: -hit.dir.z});
  } else stats.misses++;
  // The street hears it (R14): the nearest run, capped; the HQ crowd looks, bounded there.
  const panicked = gunfirePanic(world.crowd, s.x, s.z);
  stats.panicked += panicked; stats.maxPanic = Math.max(stats.maxPanic, panicked);
  onWitness?.({x: s.x, z: s.z, severity: WEAPONS.pistol.witnessSeverity, radius: WEAPONS.pistol.witnessRadius, kind: 'gunshot'});
  lastShot = {kind: hit.kind, zone: hit.zone, distance: +hit.distance.toFixed(2), outcome, time,
   from: {...from}, point: hit.point, target: hit.target?.id ?? null};
  onShot?.({...lastShot, heading: s.aimHeading ?? s.heading, hit});
  if (inventory.state.rounds === 0) inventory.reload();
  return lastShot;
 }

 const api = {
  inventory, effects,
  get current() {return inventory.current;},
  get weapon() {return WEAPONS[inventory.current];},
  get aiming() {return aimHeld;},
  get lastShot() {return lastShot;},
  /** 1/2/3. Refused mid-swing (`busy`), while reloading, and in a car. */
  select(slot, {busy = false, driving = false} = {}) {
   if (driving) return false;
   const ok = inventory.select(slot, {busy});
   if (ok) {stats.switches++; pendingShot = 0;}
   return ok;
  },
  cycle(step, {busy = false, driving = false} = {}) {
   if (driving) return false;
   const ok = inventory.cycle(step, {busy});
   if (ok) {stats.switches++; pendingShot = 0;}
   return ok;
  },
  /** The right mouse button, or the pad's LB. */
  aim(on) {aimHeld = !!on;},
  /**
   * The attack button with the pistol out. With the gun already up it fires at once; otherwise
   * it raises the gun and fires when it is up (a hip shot is not a thing this body can do). On a
   * phone (`touch`) it also locks on for the shot. Returns false if this is not a gun.
   */
  trigger({touch = false} = {}) {
   if (inventory.current !== 'pistol') return false;
   if (inventory.state.rounds === 0) {inventory.reload(); return true;}
   pendingShot = ARSENAL.raiseWait; if (touch) touchAim = ARSENAL.raiseWait + .35;
   return true;
  },
  reload() {return inventory.reload();},
  /** What the feedback bus says about the weapons. Returns true if it was a weapon event. */
  event(e) {
   if (e.kind === 'blade_clank') {effects.burst(e.x, 1.2, e.z, {count: 18}); stats.clanks++; return true;}
   return false;
  },
  /**
   * One frame. `player` is the controller, `figure` the drawn body (for the muzzle and the aim
   * weight), `driving` whether the player is in a car (R18: a car holsters everything, and
   * stepping out brings back the fists). `world` is the scene's collision world:
   *   {solid, ground, cars, dimsOf, people(from, dir, range), skip, clear(a, p), crowd,
   *    wound(p, hit), bleed(point, dir), muzzle(figure)}
   * `camera` {position, direction} is the view's centre ray; without one the aim is straight
   * ahead. `touch` means aiming is lock-on only (R16).
   */
  frame(dt, {player, figure = null, driving = false, world = null, camera = null, touch = false, pad = false, time = 0} = {}) {
   inventory.update(dt);
   if (driving && !wasDriving) {inventory.holster(); aimHeld = false; pendingShot = 0;}
   if (!driving && wasDriving) inventory.unholster();
   wasDriving = driving;
   effects.update(dt);
   const s = player?.state; if (!s) return;
   if (driving) s.crouching = false;              // W4: nobody crouches in a car seat
   s.weapon = inventory.current;
   s.shotLeft = Math.max(0, (s.shotLeft ?? 0) - dt);
   s.reloadLeft = inventory.state.reloading;
   pendingShot = Math.max(0, pendingShot - dt); touchAim = Math.max(0, touchAim - dt);
   const gun = inventory.current === 'pistol' && !driving && s.alive !== false && !(s.vehiclePhase > 0);
   const wants = gun && (aimHeld || pendingShot > 0 || touchAim > 0);
   s.aim = wants && inventory.state.reloading <= 0 ? 1 : 0;
   if (!gun || !world) {if (!gun) s.aim = 0; return;}
   if (s.aim || s.shotLeft > 0) {
    // What the crosshair is on: the person the lock picks, or the first thing on the camera ray.
    const lock = lockTarget(player, camera, world, touch, pad);
    let point;
    if (lock) point = {x: lock.x, y: lock.y, z: lock.z};
    else if (camera) point = cameraPoint(camera, world, WEAPONS.pistol.range).point;
    else point = {x: s.x + Math.sin(s.heading) * 20, y: s.y + ARSENAL.chest, z: s.z + Math.cos(s.heading) * 20};
    s.aimTarget = point; s.aimLock = lock?.p?.id ?? null;
    s.aimHeading = Math.atan2(point.x - s.x, point.z - s.z);
    // Standing, the body's heading is the aim: a step off then starts from where the gun points.
    if ((s.speed ?? 0) < .16) s.bodyHeading = s.aimHeading;
   }
   // Fire once the gun is up (or at once without a figure to wait for).
   const up = !figure?.aim || figure.aim.aimWeight >= ARSENAL.raiseWeight;
   if (pendingShot > 0 && s.aim && up && inventory.canFire) {pendingShot = 0; fire(player, world, figure, time);}
  },
  /** Respawn or leaving play: fists, a full magazine, nothing in flight. */
  reset() {inventory.reset(); wasDriving = false; aimHeld = false; pendingShot = 0; touchAim = 0;},
  snapshot() {return {...inventory.snapshot(), ...stats, aiming: aimHeld, lastShot, effects: effects.stats};},
  dispose() {effects.dispose();}
 };
 return api;
}
