// The player's weapons in the scene (PLAN-WEAPONS). The scene hands this one object its systems
// each frame; the rules live in weapons.mjs (inventory), combat.mjs (the katana's cut and a
// gunshot's wound), ballistics.mjs (where a bullet goes) and weapon-effects.mjs (what it looks
// like).
//
// It owns what the player is holding, and writes it onto the player's state -- `weapon`, and for
// the pistol `aim`, `aimTarget`, `aimHeading`, `shotLeft`, `reloadLeft` -- which is what the
// figure draws (figure.mjs, aim-layer.mjs) and combat reads.
import {createInventory,WEAPONS,GUNS,SHAPE} from './weapons.mjs';
import {createWeaponEffects} from './weapon-effects.mjs';
import {createImpactMarks,wallNormal} from './impact-marks.mjs';
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
 * §9ah: a round's direction off the aim for an automatic: the spread cone (a deterministic
 * sunflower spiral over the burst, so a test can repeat it) plus the recoil's climb. Pure.
 * `dir` is the aim direction; returns a new unit vector.
 */
export function spreadDirection(dir, {spread = 0, climb = 0, index = 0} = {}) {
 const len = Math.hypot(dir.x, dir.y, dir.z) || 1, d = {x: dir.x / len, y: dir.y / len, z: dir.z / len};
 // The aim's own frame: a horizontal side vector r, and up = d x r (for d = +Z, r = +X, up = +Y).
 let rx = d.z, rz = -d.x; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
 const ux = d.y * rz, uy = d.z * rx - d.x * rz, uz = -d.y * rx;
 const golden = 2.399963, r = spread * Math.sqrt(((index * .618034) % 1)), a = index * golden;
 const off = Math.tan(climb);
 const x = d.x + (rx * Math.cos(a) + ux * Math.sin(a)) * r + ux * off;
 const y = d.y + uy * Math.sin(a) * r + uy * off;
 const z = d.z + (rz * Math.cos(a) + uz * Math.sin(a)) * r + uz * off;
 const n = Math.hypot(x, y, z);
 return {x: x / n, y: y / n, z: z / n};
}

/**
 * @param {object} [options]
 * @param {any} [options.effects]
 * @param {null|((shot:any)=>void)} [options.onShot] every shot: the scene's sound, bloom and crimes
 * @param {null|((event:any)=>number)} [options.onWitness] the HQ crowd's visual reaction (bounded there)
 * @param {null|((x:number,y:number,z:number,kind:string)=>any)} [options.onLand] stage 1: a casing or magazine hits the ground
 */
export function createArsenal({effects = createWeaponEffects(), onShot = null, onWitness = null, onLand = null} = {}) {
 const inventory = createInventory();
 // Stage 1: holes, casings, smoke, dropped magazines and blood pools (impact-marks.mjs), drawn
 // with the rest of the weapon effects. `onLand` hears a casing or a magazine hit the ground.
 const marks = createImpactMarks(); effects.root.add(marks.root);
 let groundOf = null;
 const dropMag = at => marks.magazine(at);
 let wasDriving = false, aimHeld = false, pendingShot = 0, lastShot = null, touchAim = 0;
 // §9ah: the automatic's trigger, held; its spread and recoil, and the round index in the burst.
 let triggerHeld = false, spread = 0, recoil = 0, burst = 0;
 // §9aj: the person the crosshair's ray last met, if any.
 let lastRayTarget = null;
 const isGun = id => GUNS.includes(id);
 const stats = {switches: 0, clanks: 0, shots: 0, hits: 0, headshots: 0, kills: 0, walls: 0, cars: 0, misses: 0, panicked: 0, maxPanic: 0};

 /** Where the camera's centre ray first meets something, or `range` out along it. */
 function cameraPoint(camera, world, range) {
  const o = camera.position, d = camera.direction;
  const hit = castShot({from: o, dir: d, range, solid: world.solid, ground: world.ground,
   cars: world.cars, dimsOf: world.dimsOf, people: world.people(o, d, range), skip: world.skip, bodyOf: world.bodyOf});
  lastRayTarget = hit.kind === 'person' ? hit.target : null;
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
  const s = player.state, t = s.aimTarget, gunId = inventory.current, w = WEAPONS[gunId];
  if (!inventory.fire()) return null;
  // The muzzle as the figure holds it; without a figure, in front of the chest.
  const from = (figure && world.muzzle?.(figure)) ||
   {x: s.x + Math.sin(s.aimHeading ?? s.heading) * .45, y: s.y + ARSENAL.muzzleFallback, z: s.z + Math.cos(s.aimHeading ?? s.heading) * .45};
  let dir = {x: t.x - from.x, y: t.y - from.y, z: t.z - from.z};
  if (w.auto) {
   // The round goes where the gun points after the recoil so far, inside the burst's spread;
   // then this round adds its own climb and opens the spread.
   dir = spreadDirection(dir, {spread: w.spread.first + spread, climb: recoil, index: burst});
   burst++; spread = Math.min(w.spread.max, spread + w.spread.perShot); recoil += w.recoil.climb;
  }
  const hit = castShot({from, dir, range: w.range, solid: world.solid, ground: world.ground,
   cars: world.cars, dimsOf: world.dimsOf, people: world.people(from, dir, w.range), skip: world.skip, bodyOf: world.bodyOf});
  stats.shots++;
  s.shotLeft = w.shotSeconds;
  effects.muzzle(from.x, from.y, from.z, hit.dir);
  effects.tracer(from, hit.point);
  // Stage 1: the spent case out of the port (above the grip, behind the muzzle) and a breath of
  // smoke off the muzzle; an automatic's rounds each leave a little, and it gathers.
  {const port = (SHAPE[gunId]?.muzzle?.[2] ?? .2) - (w.auto ? .12 : .05), d = hit.dir;
   marks.casing({x: from.x - d.x * port, y: from.y - d.y * port + .02, z: from.z - d.z * port}, d);
   marks.smoke(from, d, w.auto ? 1 : 3);}
  let outcome = null;
  if (hit.kind === 'person') {
   stats.hits++; if (hit.zone === 'head') stats.headshots++;
   outcome = world.wound?.(hit.target, {damage: w.bodyDamage, head: hit.zone === 'head', dir: hit.dir, weapon: gunId, part: hit.part}) ?? null;
   if (outcome === 'killed') stats.kills++;
   world.bleed?.(hit.point, hit.dir);
   // §9ai H2: blood out of the wound, along the round (an automatic's rounds spray less each).
   effects.blood(hit.point.x, hit.point.y, hit.point.z, {dir: hit.dir, count: w.auto ? 10 : 18, spread: .45});
  } else if (hit.kind === 'wall' || hit.kind === 'ground') {
   stats.walls++;
   // Stage 1: the hole it leaves.
   marks.hole(hit.point, hit.kind === 'ground' ? {x: 0, y: 1, z: 0} : wallNormal(hit.point, hit.dir, world.solid));
   effects.burst(hit.point.x, hit.point.y, hit.point.z, {count: 10, nx: -hit.dir.x, nz: -hit.dir.z});
   effects.burst(hit.point.x, hit.point.y, hit.point.z, {count: 6, dust: true, nx: -hit.dir.x, nz: -hit.dir.z});
  } else if (hit.kind === 'car') {
   stats.cars++;
   effects.burst(hit.point.x, hit.point.y, hit.point.z, {count: 14, nx: -hit.dir.x, nz: -hit.dir.z});
  } else stats.misses++;
  // The street hears it (R14): the nearest run, capped; the HQ crowd looks, bounded there.
  const panicked = gunfirePanic(world.crowd, s.x, s.z, {radius: w.witnessRadius, cap: w.panicCap, severity: w.witnessSeverity});
  stats.panicked += panicked; stats.maxPanic = Math.max(stats.maxPanic, panicked);
  onWitness?.({x: s.x, z: s.z, severity: w.witnessSeverity, radius: w.witnessRadius, kind: 'gunshot'});
  lastShot = {kind: hit.kind, zone: hit.zone, distance: +hit.distance.toFixed(2), outcome, time,
   from: {...from}, point: hit.point, target: hit.target?.id ?? null, weapon: gunId};
  onShot?.({...lastShot, heading: s.aimHeading ?? s.heading, hit});
  if (inventory.state.rounds === 0) inventory.reload();
  return lastShot;
 }

 const api = {
  inventory, effects, marks,
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
  /** §9ah: the attack button held (the mouse's left, E, the pad's ZR): an automatic keeps firing. */
  hold(on) {triggerHeld = !!on; if (!on && WEAPONS[inventory.current]?.auto) pendingShot = 0;},
  /** §9ah: the drawn automatic's muzzle climb (radians) and spread, for the figure and the camera. */
  get recoil() {return recoil;},
  get spread() {return spread;},
  /**
   * The attack button with the pistol out. With the gun already up it fires at once; otherwise
   * it raises the gun and fires when it is up (a hip shot is not a thing this body can do). On a
   * phone (`touch`) it also locks on for the shot. Returns false if this is not a gun.
   */
  trigger({touch = false} = {}) {
   if (!isGun(inventory.current)) return false;
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
   if (world?.ground) groundOf = world.ground;
   marks.update(dt, {ground: groundOf ?? undefined, onLand});
   // A magazine the hand lets go of during the automatic's reload falls to the ground (hands.mjs).
   if (figure?.hands) figure.hands.onDrop = dropMag;
   const s = player?.state; if (!s) return;
   if (driving) s.crouching = false;              // W4: nobody crouches in a car seat
   s.weapon = inventory.current;
   s.shotLeft = Math.max(0, (s.shotLeft ?? 0) - dt);
   // §9ah: an automatic's recoil settles and its spread closes; a released trigger ends the burst.
   const drawnGun = WEAPONS[inventory.current];
   if (drawnGun?.auto) {
    recoil = Math.max(0, recoil - recoil * Math.min(1, drawnGun.recoil.settle * dt));
    if (!triggerHeld) {spread = Math.max(0, spread - drawnGun.spread.recover * dt); burst = 0;}
   } else {recoil = 0; spread = 0; burst = 0;}
   s.recoil = recoil;
   s.reloadLeft = inventory.state.reloading;
   pendingShot = Math.max(0, pendingShot - dt); touchAim = Math.max(0, touchAim - dt);
   const gun = isGun(inventory.current) && !driving && s.alive !== false && !(s.vehiclePhase > 0);
   const auto = gun && !!WEAPONS[inventory.current].auto;
   // An automatic keeps the gun up while the trigger is held, as a pending shot does.
   if (auto && triggerHeld && inventory.state.rounds > 0) pendingShot = Math.max(pendingShot, .05);
   const wants = gun && (aimHeld || pendingShot > 0 || touchAim > 0);
   s.aim = wants && inventory.state.reloading <= 0 ? 1 : 0;
   if (!gun || !world) {if (!gun) s.aim = 0; return;}
   if (s.aim || s.shotLeft > 0) {
    // What the crosshair is on: the person the lock picks, or the first thing on the camera ray.
    const lock = lockTarget(player, camera, world, touch, pad);
    let point;
    if (lock) point = {x: lock.x, y: lock.y, z: lock.z};
    else if (camera) point = cameraPoint(camera, world, WEAPONS[inventory.current].range).point;
    else point = {x: s.x + Math.sin(s.heading) * 20, y: s.y + ARSENAL.chest, z: s.z + Math.cos(s.heading) * 20};
    s.aimTarget = point; s.aimLock = lock?.p?.id ?? null;
    // §9aj G1: whoever is on the crosshair gets a detailed body before the round lands.
    const on = lock?.p ?? (camera && !lock ? lastRayTarget : null);
    if (on && world.crowd) on.aimedUntil = (world.crowd.time ?? 0) + .6;
    s.aimHeading = Math.atan2(point.x - s.x, point.z - s.z);
    // Standing, the body's heading is the aim: a step off then starts from where the gun points.
    if ((s.speed ?? 0) < .16) s.bodyHeading = s.aimHeading;
   }
   // Fire once the gun is up (or at once without a figure to wait for).
   // Stage 1: and not while the hand is still changing weapons (hands.mjs).
   const up = (!figure?.aim || figure.aim.aimWeight >= ARSENAL.raiseWeight) && !figure?.hands?.busy;
   if (pendingShot > 0 && s.aim && up && inventory.canFire) {
    // The pistol fires once per press; an automatic, every refire while the trigger is held.
    if (!auto || !triggerHeld) pendingShot = 0;
    fire(player, world, figure, time);
   }
  },
  /** Respawn or leaving play: fists, a full magazine, nothing in flight. */
  reset() {inventory.reset(); wasDriving = false; aimHeld = false; pendingShot = 0; touchAim = 0; triggerHeld = false; spread = 0; recoil = 0; burst = 0;},
  snapshot() {return {...inventory.snapshot(), ...stats, aiming: aimHeld, lastShot, effects: effects.stats, marks: marks.stats};},
  dispose() {marks.dispose(); effects.dispose();}
 };
 return api;
}
