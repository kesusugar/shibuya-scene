// Police units (PLAN-POLICE-AND-OWN-CAR W2): patrol cars that chase, traffic that gives way,
// officers on foot, and the arrest. Bounded: cars come from the traffic pool and officers from the
// crowd's own pedestrians, so no new crowd or car system exists per unit.
//
// Nothing appears in view: a patrol car is placed on the lane graph 80–200 m away and outside the
// camera, an officer is a pedestrian 40–140 m away and out of view who is re-drawn in uniform.
import {pose} from '../traffic/path.mjs';
import {VEHICLES} from '../traffic/config.mjs';
import {OFFICER_BASE} from '../life/appearance.mjs';
import {COMBAT} from '../player/combat.mjs';

/** Per star (index 0 unused). */
export const UNITS = Object.freeze({
 cars: [0, 1, 2, 4, 5, 6],
 officers: [0, 2, 4, 6, 8, 8],
 spawnNear: 80, spawnFar: 200,       // m, patrol cars
 officerNear: 40, officerFar: 140,   // m, officers
 spawnEvery: 1.5,                    // s between two new units
 chaseSpeed: 13, accel: 5,           // m/s, m/s²
 straightIn: 30,                     // m: the last stretch is driven straight at the player
 stopShort: 4.5,                     // m from the player's centre a patrol car stops
 reroute: 2,                         // s between route searches
 officerRun: 3.4,                    // m/s
 giveWayReach: 40, giveWayCone: 1.05,// m ahead of a siren, and the heading difference that counts
 arrestReach: 1.2, arrestFoot: 2,    // m, s: an officer's hands on a player who is not fighting
 closeTo: .95,                       // m: how near an officer comes
 batonReach: 1.7, batonEvery: 1.1,   // m, s: a player who fights back is hit with the baton
 carPin: 3.6, arrestCar: 3,          // m, s: a stopped player car with a patrol car against it
 leaveAfter: 60                      // m out of view before a unit that lost the player is freed
});

/** Lane sample points, for "the lane nearest this point" without scanning every path. */
function laneSamples(graph) {
 const out = [];
 const p = {};
 for (const lane of graph?.lanes ?? []) {
  if (!lane.allowed?.includes('police')) continue;
  for (let d = 0; d < lane.path.length; d += 10) {pose(lane.path, d, p); out.push({lane: lane.id, d, x: p.x, z: p.z});}
 }
 return out;
}

/** Lanes from `from` to `to` over transitions, breadth first. Returns [{lane}|{transition}] or null. */
export function routeLanes(graph, from, to, limit = 400) {
 if (from === to) return [{lane: from}];
 const prev = new Map([[from, null]]), queue = [from];
 while (queue.length && prev.size < limit) {
  const id = queue.shift();
  for (const t of graph.lanes[id]?.next ?? []) {
   const next = graph.transitions[t].to;
   if (prev.has(next) || !graph.lanes[next]?.allowed?.includes('police')) continue;
   prev.set(next, {id, t});
   if (next === to) {
    const steps = [{lane: to}];
    let at = to;
    while (prev.get(at)) {const {id: back, t: via} = prev.get(at); steps.unshift({lane: back}, {transition: via}); at = back;}
    // Collapse the duplicated lane entries the unshift pairs produce.
    return steps.filter((s, i) => !(s.lane !== undefined && steps[i - 1]?.lane === s.lane));
   }
   queue.push(next);
  }
 }
 return null;
}

const INNER = [[0, 0], [.35, .35], [-.35, .35], [.35, -.35], [-.35, -.35]];
/** The carriageway as a 4 m grid, and distances over it from a target. */
export function createRoadField(ctx, {cell = 4, origin = -250, size = 500} = {}) {
 const N = Math.ceil(size / cell), road = new Uint8Array(N * N), dist = new Int32Array(N * N).fill(-1);
 let built = 0, target = -1, queue = new Int32Array(N * N);
 const index = (x, z) => {const i = Math.floor((x - origin) / cell), j = Math.floor((z - origin) / cell);
  return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;};
 const centre = k => ({x: origin + (k % N + .5) * cell, z: origin + ((k / N | 0) + .5) * cell});
 const nearestRoad = (x, z) => {
  const k = index(x, z); if (k < 0) return -1; if (road[k]) return k;
  const i0 = k % N, j0 = k / N | 0;
  for (let r = 1; r <= 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
   if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
   const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
   if (road[j * N + i]) return j * N + i;
  }
  return -1;
 };
 const api = {
  get ready() {return built >= N * N;},
  /** Build up to `budget` more cells. */
  build(budget = 300) {
   // A cell is road if its centre or any of four inner points is: centre-only sampling cut the
   // narrow necks and left 56 islands (95% in one piece); this leaves 6 (98.8%). Measured.
   for (; built < N * N && budget-- > 0; built++) {
    const c = centre(built); let on = 0;
    for (const [a, b] of INNER) if (ctx.onRoad([c.x + a * cell, c.z + b * cell])) {on = 1; break;}
    road[built] = on;
   }
   return api.ready;
  },
  /** Distances from the road cell nearest (x,z). Cheap enough to redo every second. */
  flow(x, z) {
   const start = nearestRoad(x, z); if (start < 0 || start === target) return;
   target = start; dist.fill(-1); dist[start] = 0;
   let head = 0, tail = 0; queue[tail++] = start;
   while (head < tail) {
    const k = queue[head++], i = k % N, j = k / N | 0, dk = dist[k] + 1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
     if (!di && !dj) continue;
     const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
     const n = b * N + a; if (!road[n] || dist[n] >= 0) continue;
     // No cutting a corner across a kerb: a diagonal needs both sides to be road.
     if (di && dj && (!road[j * N + a] || !road[b * N + i])) continue;
     dist[n] = dk; queue[tail++] = n;
    }
   }
  },
  /** Where to steer from (x,z): three cells down the field (or up it, `away`). Null off the field. */
  ahead(x, z, away = false) {
   let k = nearestRoad(x, z); if (k < 0 || dist[k] < 0) return null;
   for (let s = 0; s < 3; s++) {
    const i = k % N, j = k / N | 0; let best = k, bd = dist[k];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
     const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
     const n = b * N + a; if (dist[n] < 0) continue;
     if (away ? dist[n] > bd : dist[n] < bd) {bd = dist[n]; best = n;}
    }
    if (best === k) break; k = best;
   }
   return centre(k);
  },
  distanceAt(x, z) {const k = nearestRoad(x, z); return k < 0 ? -1 : dist[k];}
 };
 return api;
}

export function createPoliceUnits({koban = {x: 48.5, z: 20.4}, buildBudget = 150} = {}) {
 const cars = new Set(), officers = new Set();
 let samples = null, sampledGraph = null, clock = 0, spawnClock = 0;
 const arrest = {foot: 0, car: 0};
 let field = null, fieldCtx = null, flowClock = 0;
 const scratch = {};


 function spawnCar(traffic, me, visible) {
  const slot = traffic.pool.find(v => !v.active);
  if (!slot) return false;
  // Only where the flow field can bring the car to the player.
  field.flow(me.x, me.z);
  const pick = samples.filter(s => {
   const d = Math.hypot(s.x - me.x, s.z - me.z);
   return d >= UNITS.spawnNear && d <= UNITS.spawnFar && !visible(s.x, s.z) && field.distanceAt(s.x, s.z) >= 0;
  });
  if (!pick.length) return false;
  const s = pick[(clock * 997 | 0) % pick.length];
  const lane = traffic.graph.lanes[s.lane];
  pose(lane.path, s.d, scratch);
  Object.assign(slot, {active: true, parked: false, controlled: true, service: false, platoon: undefined,
   type: 'police', x: scratch.x, z: scratch.z, heading: scratch.heading, speed: 0, brake: false, blinker: 0,
   lane: s.lane, transition: -1, next: -1, progress: s.d, age: 0, stuck: 0, junction: null, siren: true,
   pursuit: {leaving: false}});
  slot.locks?.clear?.(); slot.passed?.clear?.(); slot.yellowStops?.clear?.();
  cars.add(slot);
  return true;
 }

 // Pursuit follows a flow field over the carriageway, not a lane route: the lane graph is built
 // for traffic that despawns at a route's end, and fewer than one lane pair in ten connects
 // (measured on the HIGH graph), so a routed chase wandered off; and steering by look-ahead
 // alone stalls in narrow streets. A 4 m grid of road cells is built once, a few hundred cells a
 // frame (ctx.onRoad is ~37 µs a call), and a breadth-first distance from the player's cell is
 // refreshed every second. A car steers at the point three cells down the field.
 function driveCar(v, traffic, me, dt, wanted, visible) {
  const P = v.pursuit;
  const d = Math.hypot(me.x - v.x, me.z - v.z);
  if (!wanted) {
   P.leaving = true;
   if (d > UNITS.leaveAfter && !visible(v.x, v.z)) {traffic.despawn(v, 'police'); cars.delete(v); return;}
  }
  let aim = null;
  if (!P.leaving && d <= UNITS.straightIn) aim = me;
  else if (field?.ready) aim = field.ahead(v.x, v.z, P.leaving);
  const want = !P.leaving && d < UNITS.stopShort + 1 ? 0 : aim ? (P.leaving ? UNITS.chaseSpeed * .6 : UNITS.chaseSpeed) : 0;
  if (aim) {
   const h = Math.atan2(aim.x - v.x, aim.z - v.z);
   const turn = Math.atan2(Math.sin(h - v.heading), Math.cos(h - v.heading));
   v.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, turn));
   const goal = Math.abs(turn) > .9 ? Math.min(want, 5) : want;
   v.speed += Math.max(-UNITS.accel * 2 * dt, Math.min(UNITS.accel * dt, goal - v.speed));
  } else v.speed = Math.max(0, v.speed - UNITS.accel * 2 * dt);
  v.brake = v.speed < want - .3;
  let step = v.speed * dt;
  if (!P.leaving) step = Math.min(step, Math.max(0, d - UNITS.stopShort));
  v.x += Math.sin(v.heading) * step; v.z += Math.cos(v.heading) * step;
 }

 function giveWay(traffic, dt) {
  const sirens = traffic.pool.filter(v => v.active && v.siren);
  if (!sirens.length) return 0;
  let n = 0;
  for (const v of traffic.pool) {
   if (!v.active || v.controlled || v.parked || v.siren) continue;
   for (const s of sirens) {
    const dx = v.x - s.x, dz = v.z - s.z, d = Math.hypot(dx, dz);
    if (d > UNITS.giveWayReach || d < 1) continue;
    const ahead = (dx * Math.sin(s.heading) + dz * Math.cos(s.heading)) / d;
    const same = Math.abs(Math.atan2(Math.sin(v.heading - s.heading), Math.cos(v.heading - s.heading)));
    if (ahead < .6 || same > UNITS.giveWayCone) continue;
    // Slow and hold: the traffic step takes it from this speed, so it stays slow while the
    // siren is behind it.
    v.speed = Math.max(0, v.speed - 6 * dt); v.brake = true; v.givingWay = true; n++;
    break;
   }
  }
  return n;
 }

 function officerCandidates(crowd, me, visible, nearKoban) {
  const out = [];
  for (const p of crowd.pool) {
   if (!p.active || p.officer || p.choreographed || p.crossing || p.combatDead || p.fatal || p.archetype === 'kid' || p.struck !== undefined) continue;
   const d = Math.hypot(p.x - me.x, p.z - me.z);
   if (d < UNITS.officerNear || d > UNITS.officerFar || visible(p.x, p.z)) continue;
   if (nearKoban && Math.hypot(p.x - koban.x, p.z - koban.z) > 45) continue;
   out.push(p);
  }
  return out;
 }

 function driveOfficer(p, crowd, me, dt, wanted, visible, attacking, hurt) {
  if (!wanted) {
   // Walk off, then become an ordinary pedestrian again, out of sight.
   p.combatTarget = null; p.combatUntil = 0;
   if (!visible(p.x, p.z) && Math.hypot(p.x - me.x, p.z - me.z) > UNITS.leaveAfter) {
    p.officer = false; p.appearanceId = undefined; p.active = false; p.downUntil = crowd.time + 1;
    officers.delete(p);
   }
   return;
  }
  p.combatTarget = 'player'; p.combatUntil = crowd.time + 5; p.combatHealth ??= 100;
  const d = Math.hypot(me.x - p.x, me.z - p.z);
  p.heading = Math.atan2(me.x - p.x, me.z - p.z); p.state = 'fighting';
  // The baton, for a player who is fighting back.
  p.batonNext ??= 0;
  if (attacking && d <= UNITS.batonReach && crowd.time >= p.batonNext) {p.batonNext = crowd.time + UNITS.batonEvery; hurt?.(COMBAT.officerDamage);}
  if (d > UNITS.closeTo) {
   const run = d > 4 ? UNITS.officerRun : 1.6;
   const step = Math.min(run * dt, d - UNITS.closeTo), nx = p.x + (me.x - p.x) / d * step, nz = p.z + (me.z - p.z) / d * step;
   p.speed = run;
   // An officer chasing crosses the road; only a wall stops them.
   const ctx = crowd.network?.ctx;
   if (!ctx?.solid?.(nx, nz, .28)) {
    const old = crowd.cell(p.x, p.z); p.x = nx; p.z = nz; p.renderX = nx; p.renderZ = nz;
    if (crowd.cell(nx, nz) !== old) {const b = crowd.grid.get(old), i = b?.indexOf(p); if (i >= 0) b.splice(i, 1); crowd.insert(p);}
   }
  }
 }

 const api = {
  cars, officers, arrest,
  get field() {return field;},
  /**
   * One frame. `stars` from the wanted level; `visible(x,z)` whether a point is in the camera;
   * `me` the player's position; `attacking` whether the player is mid-swing; `driving` and
   * `carSpeed` for the in-car arrest. Returns 'arrested' on the frame the arrest completes.
   */
  update(dt, {stars = 0, traffic = null, crowd = null, me, visible = () => false, attacking = false,
               driving = false, carSpeed = 0, alive = true, hurt = null}) {
   clock += dt; spawnClock -= dt;
   if (traffic?.graph && sampledGraph !== traffic.graph) {samples = laneSamples(traffic.graph); sampledGraph = traffic.graph;}
   if (traffic?.graph?.ctx?.onRoad && fieldCtx !== traffic.graph.ctx) {fieldCtx = traffic.graph.ctx; field = createRoadField(fieldCtx);}
   if (field && !field.ready) field.build(buildBudget);
   flowClock -= dt;
   if (field?.ready && cars.size && flowClock <= 0) {flowClock = 1; field.flow(me.x, me.z);}
   const wanted = stars > 0;
   // Units first leave when the level clears.
   if (traffic) for (const v of [...cars]) {if (!v.active || v.type !== 'police') {cars.delete(v); continue;} driveCar(v, traffic, me, dt, wanted, visible);}
   if (crowd) for (const p of [...officers]) {if (!p.active && !p.officerPending) {officers.delete(p); continue;} if (p.active) driveOfficer(p, crowd, me, dt, wanted && !driving, visible, attacking, hurt);}
   // Pending conversions: off for a frame so the HQ layer drops the old body, then back in uniform.
   if (crowd) for (const p of officers) if (p.officerPending && !p.active && crowd.time >= p.officerPending) {
    p.officerPending = 0; p.active = true; p.downUntil = 0;
    Object.assign(p, {officer: true, appearanceId: OFFICER_BASE + p.id, combatTarget: 'player', combatUntil: crowd.time + 5,
     combatHealth: 100, combatDead: false, fatal: false, state: 'fighting', speed: 0, choreographed: false, crossing: null});
    crowd.insert?.(p);
   }
   if (wanted && spawnClock <= 0) {
    spawnClock = UNITS.spawnEvery;
    if (traffic && samples?.length && field?.ready && cars.size < UNITS.cars[stars]) spawnCar(traffic, me, visible);
    else if (crowd && officers.size < UNITS.officers[stars]) {
     const near = stars === 1 && Math.hypot(koban.x - me.x, koban.z - me.z) < 180;
     const c = officerCandidates(crowd, me, visible, near);
     const p = c[(clock * 131 | 0) % Math.max(1, c.length)];
     if (p) {crowd.despawn?.(p, 'officer'); p.active = false; p.downUntil = crowd.time + 1; p.officerPending = crowd.time + .15; officers.add(p);}
    }
   }
   const yielded = traffic ? giveWay(traffic, dt) : 0;

   // --- the arrest -------------------------------------------------------------------------
   let result = null;
   if (wanted && alive) {
    if (!driving) {
     const hands = [...officers].some(p => p.active && !p.combatDead && Math.hypot(p.x - me.x, p.z - me.z) <= UNITS.arrestReach);
     arrest.foot = hands && !attacking ? arrest.foot + dt : 0;
     if (arrest.foot >= UNITS.arrestFoot) result = 'arrested';
    } else arrest.foot = 0;
    if (driving) {
     const pinned = Math.abs(carSpeed) < 1 && [...cars].some(v => Math.hypot(v.x - me.x, v.z - me.z) <= UNITS.carPin + VEHICLES.police.length / 2);
     arrest.car = pinned ? arrest.car + dt : 0;
     if (arrest.car >= UNITS.arrestCar) result = 'arrested';
    } else arrest.car = 0;
   } else {arrest.foot = 0; arrest.car = 0;}
   if (result) {arrest.foot = 0; arrest.car = 0;}
   return {result, cars: cars.size, officers: [...officers].filter(p => p.active).length, yielded};
  },
  /** Is this pedestrian an officer (for crimes against the police). */
  isOfficer: p => !!p?.officer,
  dispose(traffic, crowd) {
   for (const v of cars) if (v.active) traffic?.despawn?.(v, 'police');
   for (const p of officers) {p.officer = false; p.appearanceId = undefined; p.officerPending = 0;}
   cars.clear(); officers.clear();
  }
 };
 return api;
}
