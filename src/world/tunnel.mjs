// Backlog ③: the underground passage -- a way to lose the police, as GTA V's tunnels are.
//
// One passage, taken from the real one in the map data: OSM way/664498381, the level -1 footway that
// runs west under Dogenzaka from near exit A3 of Shibuya Station. The data's own exits end inside
// building footprints (basements), so each end rises instead into the nearest open lot, by a
// staircase entered from the pavement: A3 on Dogenzaka (the lot south of the pavement, entered from
// the east) and A0 near the passage's west bend (the lot north of it, entered from the west). In
// between, the passage's own line is kept; short links join it to the stairs. The corners break a
// chaser's line of sight.
//
// The route is a polyline in the ground plane; everything else is measured along it (`s`, metres
// from the A3 top). The floor is the surface at the two tops, `depth` below it along the passage,
// and a straight ramp on each staircase. Its ceiling is `height` above the floor: on a staircase
// that rises above the pavement near the top, which is the entrance's sloping glass roof.
//
// Two layers. On the surface the stair wells are solid except at their open ends; underground the
// walls are everything outside the passage, except beyond an open end, which is the pavement.
// `track(state)` moves a body between them: stepping into an open end goes down, walking out of it
// comes up. Pure: no scene, no DOM.

export const TUNNEL = Object.freeze({
 depth: 4.2,          // m: the passage floor below the pavement
 width: 3.6,          // m
 height: 2.8,         // m, floor to ceiling
 entry: .6,           // share of a staircase, from its top, where stepping in goes underground
 down: .5,            // m into a staircase before a body counts as underground
 up: .3,              // m out beyond a top before a body counts as on the street again
 sight: 28,           // m: how far an officer in the passage sees along a clear line
 escapeRate: 2.5,     // the escape clock runs this much faster, unseen, underground, with nobody on the trail
 lose: 40,            // m along the passage: an officer below nearer than this is still on the trail
 trailAt: 15,         // m: an officer above this near the stairs the player took is still on the trail
 descendAt: 2.4,      // m: an officer this near an open end goes down after the player
 officerSpeed: 3.4,   // m/s, as on the street (units.mjs officerRun): slower than a sprint
 // The Shibuya route (see above). Vertices 4-5 are OSM way/664498381's own; 3 and 6 lie on it.
 route: Object.freeze([[-78, -17], [-86, -17], [-89, -17], [-89, 3.17], [-91.1, 4.2], [-138.9, 20.9], [-165, 29.94], [-165, 37], [-168, 37], [-176, 37]]),
 names: Object.freeze(['A3', 'A0']),
 osmWay: 'way/664498381'
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The passage. `route` [[x,z],...]: its first and last segments are the staircases. */
export function createTunnel({route = TUNNEL.route, depth = TUNNEL.depth, width = TUNNEL.width, height = TUNNEL.height, names = TUNNEL.names} = {}) {
 const pts = route.map(([x, z]) => ({x, z}));
 const segs = [];
 let total = 0;
 for (let i = 1; i < pts.length; i++) {
  const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z);
  segs.push({a, b, len, s0: total, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len});
  total += len;
 }
 const first = segs[0].len, last = segs.at(-1).len, half = width / 2;
 /** The floor `s` metres along: the ramps at each end, flat between. */
 const floorAt = s => (s <= first ? -depth * clamp(s / first, 0, 1) : s >= total - last ? -depth * clamp((total - s) / last, 0, 1) : -depth) + 0;
 /** Where the ceiling of a staircase meets the pavement: the length of its glass roof. */
 const roof = first * height / depth;

 /** The nearest point of the route to (x,z): {s, d (m from the centre line), seg}. */
 function project(x, z) {
  let best = null;
  for (const g of segs) {
   const t = clamp((x - g.a.x) * g.ux + (z - g.a.z) * g.uz, 0, g.len);
   const px = g.a.x + g.ux * t, pz = g.a.z + g.uz * t, d = Math.hypot(x - px, z - pz);
   if (!best || d < best.d) best = {s: g.s0 + t, d, seg: g, px, pz};
  }
  return best;
 }
 /** Along the route, beyond an open end (past a top, outward, by `margin` m): the pavement, not the tunnel. */
 function beyondEnd(x, z, margin = 0) {
  const g0 = segs[0], gn = segs.at(-1);
  const along0 = (x - g0.a.x) * g0.ux + (z - g0.a.z) * g0.uz, side0 = Math.abs(-(x - g0.a.x) * g0.uz + (z - g0.a.z) * g0.ux);
  if (along0 < -margin && side0 <= half) return 0;
  const alongN = (x - gn.b.x) * gn.ux + (z - gn.b.z) * gn.uz, sideN = Math.abs(-(x - gn.b.x) * gn.uz + (z - gn.b.z) * gn.ux);
  if (alongN > margin && sideN <= half) return 1;
  return -1;
 }
 const inside = (x, z, r = 0) => project(x, z).d <= half - r;
 const ends = [0, 1].map(i => {
  const g = i ? segs.at(-1) : segs[0], top = i ? g.b : g.a, out = i ? {x: g.ux, z: g.uz} : {x: -g.ux, z: -g.uz};
  // The open end: the top of the staircase, and the point on the pavement just outside it.
  return {index: i, name: names[i], s: i ? total : 0, top: {x: top.x, z: top.z}, out,
   entry: {x: top.x + out.x * 1.2, z: top.z + out.z * 1.2}, heading: Math.atan2(-out.x, -out.z)};
 });
 /** A staircase's glass-roofed part, as a rectangle in the ground plane: the hole in the land. */
 const holes = ends.map(e => {
  const g = e.index ? segs.at(-1) : segs[0], dir = e.index ? {x: -g.ux, z: -g.uz} : {x: g.ux, z: g.uz};
  const nx = -dir.z * half, nz = dir.x * half, a = e.top, b = {x: a.x + dir.x * roof, z: a.z + dir.z * roof};
  return [[a.x + nx, a.z + nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz], [a.x - nx, a.z - nz]];
 });

 const api = {
  route: pts, segs, length: total, width, depth, height, ends, holes, roof,
  floorAt, project, inside,
  /** The ceiling over (x,z) in the passage (m). */
  ceilingAt: s => floorAt(s) + height,
  /** A point `s` along, `lateral` m to its left: {x, z, y, heading}. */
  pointAt(s, lateral = 0) {
   s = clamp(s, 0, total);
   const g = segs.find(g => s <= g.s0 + g.len) ?? segs.at(-1), t = s - g.s0;
   return {x: g.a.x + g.ux * t - g.uz * lateral, z: g.a.z + g.uz * t + g.ux * lateral, y: floorAt(s), heading: Math.atan2(g.ux, g.uz)};
  },
  /** Underground, the walls: everything outside the passage, except the pavement beyond an open end. */
  solidBelow: (x, z, r = 0) => !inside(x, z, r) && beyondEnd(x, z) < 0,
  /**
   * On the surface, the staircases' wells: solid (a wall or a drop) except their open ends, the
   * first metre from each top. `r` widens them by a body's radius.
   */
  solidAbove(x, z, r = 0) {
   for (const e of ends) {
    const g = e.index ? segs.at(-1) : segs[0], dir = e.index ? {x: -g.ux, z: -g.uz} : {x: g.ux, z: g.uz};
    const along = (x - e.top.x) * dir.x + (z - e.top.z) * dir.z, side = Math.abs(-(x - e.top.x) * dir.z + (z - e.top.z) * dir.x);
    if (side <= half + r && along >= 1 - r && along <= g.len + r) return true;
   }
   return false;
  },
  /**
   * Move a body between the layers: `state` {x, z, layer?}. Stepping into an open end (the top
   * `entry` share of a staircase, from `down` m in) goes underground; walking out beyond one (by
   * `up` m) comes up. The gap between the two keeps a body standing at a top from flickering
   * between the layers. Returns the layer, and sets `state.tunnelEnd` to the end last passed
   * (0 A3, 1 A0).
   */
  track(state) {
   state.layer ??= 'surface';
   const p = project(state.x, state.z);
   if (state.layer === 'surface') {
    const inEnd = p.d <= half && ((p.s >= TUNNEL.down && p.s <= first * TUNNEL.entry) || (p.s <= total - TUNNEL.down && p.s >= total - last * TUNNEL.entry));
    if (inEnd) {state.layer = 'tunnel'; state.tunnelEnd = p.s < total / 2 ? 0 : 1;}
   } else if (p.d > half || beyondEnd(state.x, state.z, TUNNEL.up) >= 0) {
    const e = beyondEnd(state.x, state.z, TUNNEL.up);
    state.layer = 'surface'; if (e >= 0) state.tunnelEnd = e;
   }
   state.tunnelS = state.layer === 'tunnel' ? p.s : null;
   return state.layer;
  },
  /**
   * The ground context for a body that may go underground: `ctx` (the street's) on the surface,
   * the passage below. `layer()` reads the body's current layer.
   */
  context(ctx, layer) {
   // The street's own height at each top (a lot may sit at the kerb's height): each ramp starts
   // there, so there is no step between the pavement and the first stair.
   const tops = ends.map(e => ctx.height?.(e.top.x, e.top.z) ?? 0);
   const below = (x, z) => {const s = project(x, z).s, f = floorAt(s), open = 1 + f / depth;
    return f + (s < total / 2 ? tops[0] : tops[1]) * Math.max(0, open);};
   return {
    ...ctx,
    solid: (x, z, r = 0) => layer() === 'tunnel' ? api.solidBelow(x, z, r) : (ctx.solid?.(x, z, r) || api.solidAbove(x, z, r)),
    height: (x, z) => layer() === 'tunnel' && beyondEnd(x, z) < 0 ? below(x, z) : (ctx.height?.(x, z) ?? 0),
    safe: (x, z, r) => layer() === 'tunnel' ? inside(x, z, r ?? 0) : ctx.safe?.(x, z, r),
    onRoad: (x, z) => layer() === 'tunnel' ? false : ctx.onRoad?.(x, z),
    /** The ceiling over a body underground (Infinity on the surface), for the camera. */
    ceiling: (x, z) => layer() === 'tunnel' ? floorAt(project(x, z).s) + height : Infinity
   };
  },
  /**
   * Does an officer in the passage (`o.tunnelS`) see a body in it at `s`? Within `sight` along it,
   * over a straight line that stays inside the passage (the corners hide).
   */
  sees(o, x, z, s, sight = TUNNEL.sight) {
   if (o?.tunnelS == null || s == null || Math.abs(o.tunnelS - s) > sight) return false;
   const steps = Math.max(2, Math.ceil(Math.hypot(x - o.x, z - o.z) / .75));
   for (let i = 1; i < steps; i++) {const t = i / steps; if (!inside(o.x + (x - o.x) * t, o.z + (z - o.z) * t, .15)) return false;}
   return true;
  }
 };
 return api;
}
