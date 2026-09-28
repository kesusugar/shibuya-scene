// Backlog ③: the underground passage's meshes (tunnel.mjs is its shape and rules).
//
// One ribbon along the route, mitred at the corners: the floor, both walls and the ceiling. Below
// ground it is lit as a passage is -- by its own strip lights, the same by day and by night -- so its
// surfaces are unlit with the light baked into vertex colours (the sun must not reach down a stair
// well). The staircases' walls and roof above the pavement are the entrance: steel and green-grey
// glass that the day and night light like any street object. A sign on a post at each entrance
// (the exit's letter and 渋谷駅; no operator's mark), and a direction board at each corner.
// Six draw calls in all; every geometry and material is the passage's own and disposed with it.
import {BufferGeometry,CanvasTexture,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,MeshStandardMaterial,SRGBColorSpace,RepeatWrapping,BoxGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** A tile or step texture on a canvas (null without a DOM: the meshes go without it). */
function canvasTexture(draw, size = 256, aspect = 1) {
 if (typeof document === 'undefined') return null;
 const c = document.createElement('canvas'); c.width = size; c.height = Math.round(size / aspect);
 draw(c.getContext('2d'), size);
 const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
 return t;
}
const tiles = () => canvasTexture((g, n) => {
 g.fillStyle = '#c9c3b6'; g.fillRect(0, 0, n, n);
 g.strokeStyle = '#9d978b'; g.lineWidth = 3;
 for (let i = 0; i <= 4; i++) {g.beginPath(); g.moveTo(i * n / 4, 0); g.lineTo(i * n / 4, n); g.stroke(); g.beginPath(); g.moveTo(0, i * n / 4); g.lineTo(n, i * n / 4); g.stroke();}
});
const signTexture = (lines, bg = '#1d3557') => canvasTexture((g, n) => {
 g.fillStyle = bg; g.fillRect(0, 0, n, n / 2);
 g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
 lines.forEach(([text, size, y]) => {g.font = `bold ${size}px sans-serif`; g.fillText(text, n / 2, y);});
}, 512, 2);

/**
 * The meshes for `tunnel` (createTunnel). Returns {root, dispose}. Add `root` to the scene.
 */
export function buildTunnelMesh(tunnel) {
 const {route, width, height} = tunnel, half = width / 2;
 // Cumulative distance and the mitred left/right offsets at every vertex.
 const s = [0];for (let i = 1; i < route.length; i++) s.push(s[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z));
 const dir = i => {const a = route[Math.max(0, i - 1)], b = route[Math.min(route.length - 1, i === 0 ? 1 : i)];const l = Math.hypot(b.x - a.x, b.z - a.z);return {x: (b.x - a.x) / l, z: (b.z - a.z) / l};};
 const side = route.map((p, i) => {
  const d0 = dir(i), d1 = i < route.length - 1 ? dir(i + 1) : d0;
  let nx = -(d0.z + d1.z), nz = d0.x + d1.x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  const miter = 1 / Math.max(.35, nx * -d0.z + nz * d0.x);
  return {lx: p.x + nx * half * miter, lz: p.z + nz * half * miter, rx: p.x - nx * half * miter, rz: p.z - nz * half * miter};
 });
 const floor = route.map((p, i) => tunnel.floorAt(s[i]));
 const stairs = new Set([0, route.length - 2]);   // segment indices

 // Light along the passage: brighter under each strip light (every 5 m), dimmer between, the
 // floor lighter than the walls, the ceiling darkest away from the strips.
 const glow = at => .9 + .1 * Math.cos((at % 5) / 5 * Math.PI * 2);
 const inner = {floor: [], steps: [], wall: [], ceiling: []}, outer = {wall: [], roof: []};
 const push = (arr, verts, uvs, shade) => arr.push({verts, uvs, shade});
 for (let i = 0; i < route.length - 1; i++) {
  const A = side[i], B = side[i + 1], y0 = floor[i], y1 = floor[i + 1], len = s[i + 1] - s[i];
  const c0 = y0 + height, c1 = y1 + height;
  const n = stairs.has(i) ? 8 : Math.max(1, Math.ceil(len / 1.25));
  for (let k = 0; k < n; k++) {
   const t0 = k / n, t1 = (k + 1) / n, lerp = (a, b, t) => a + (b - a) * t;
   const L0 = [lerp(A.lx, B.lx, t0), lerp(A.lz, B.lz, t0)], L1 = [lerp(A.lx, B.lx, t1), lerp(A.lz, B.lz, t1)];
   const R0 = [lerp(A.rx, B.rx, t0), lerp(A.rz, B.rz, t0)], R1 = [lerp(A.rx, B.rx, t1), lerp(A.rz, B.rz, t1)];
   const f0 = lerp(y0, y1, t0), f1 = lerp(y0, y1, t1), g0 = lerp(c0, c1, t0), g1 = lerp(c0, c1, t1);
   const at0 = s[i] + len * t0, at1 = s[i] + len * t1, v0 = at0, v1 = at1;
   const q = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
   push(stairs.has(i) ? inner.steps : inner.floor, q([L0[0], f0, L0[1]], [R0[0], f0, R0[1]], [R1[0], f1, R1[1]], [L1[0], f1, L1[1]]),
    [0, v0, width, v0, width, v1, 0, v0, width, v1, 0, v1].map((u, j) => j % 2 ? u : u), [glow(at0), glow(at0), glow(at1), glow(at0), glow(at1), glow(at1)].map(x => x * .95));
   // Walls: the part below the pavement is the passage's, the part above it the entrance's.
   for (const [P0, P1] of [[L0, L1], [R1, R0]]) {
    const back = P0 === R1, fa = back ? f1 : f0, fb = back ? f0 : f1, ga = back ? g1 : g0, gb = back ? g0 : g1;
    const low = [fa, fb], top = [Math.min(ga, 0), Math.min(gb, 0)];
    if (top[0] > low[0] || top[1] > low[1]) push(inner.wall, q([P0[0], low[0], P0[1]], [P1[0], low[1], P1[1]], [P1[0], Math.max(low[1], top[1]), P1[1]], [P0[0], Math.max(low[0], top[0]), P0[1]]),
     [back ? v1 : v0, 0, back ? v0 : v1, 0, back ? v0 : v1, 1, back ? v1 : v0, 0, back ? v0 : v1, 1, back ? v1 : v0, 1].map((u, j) => j % 2 ? u * height : u),
     [.62, .62, .72, .62, .72, .72].map(x => x * glow(back ? at1 : at0)));
    if (ga > 0 || gb > 0) push(outer.wall, q([P0[0], Math.max(fa, 0), P0[1]], [P1[0], Math.max(fb, 0), P1[1]], [P1[0], Math.max(gb, 0), P1[1]], [P0[0], Math.max(ga, 0), P0[1]]), null, null);
   }
   // The ceiling: under the pavement the passage's, above it the entrance's roof.
   if (g0 <= 0 && g1 <= 0) push(inner.ceiling, q([L1[0], g1, L1[1]], [R1[0], g1, R1[1]], [R0[0], g0, R0[1]], [L0[0], g0, L0[1]]),
    [0, v1, 1, v1, 1, v0, 0, v1, 1, v0, 0, v0], [glow(at1), glow(at1), glow(at0), glow(at1), glow(at0), glow(at0)].map(x => x * .78));
   else push(outer.roof, q([L1[0], g1, L1[1]], [R1[0], g1, R1[1]], [R0[0], g0, R0[1]], [L0[0], g0, L0[1]]), null, null);
  }
 }
 const geometry = (parts, colours = true) => {
  const pos = [], uv = [], col = [];
  for (const p of parts) {pos.push(...p.verts); if (p.uvs) uv.push(...p.uvs); if (colours && p.shade) for (const v of p.shade) col.push(v, v, v * .97);}
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  if (uv.length) g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  if (col.length) g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
 };
 const tileMap = tiles(); if (tileMap) tileMap.repeat.set(1 / 1.2, 1 / 1.2);
 // Steps: a nosing every 0.3 m down the stair (the texture repeats along it).
 const stepMap = canvasTexture((g, n) => {g.fillStyle = '#bdb6a8'; g.fillRect(0, 0, n, n); g.fillStyle = '#e9e3d6'; g.fillRect(0, 0, n, n * .12); g.fillStyle = '#6b665d'; g.fillRect(0, n * .12, n, n * .05);}, 64);
 if (stepMap) stepMap.repeat.set(1, 1 / .3);
 const materials = {
  floor: new MeshBasicMaterial({vertexColors: true, map: tileMap, side: DoubleSide}),
  steps: new MeshBasicMaterial({vertexColors: true, map: stepMap, color: stepMap ? 0xffffff : 0xbdb6a8, side: DoubleSide}),
  roof: new MeshStandardMaterial({color: 0x587a74, metalness: .2, roughness: .12, transparent: true, opacity: .42, side: DoubleSide, depthWrite: false}),
  wall: new MeshBasicMaterial({vertexColors: true, color: 0xe4ded2, side: DoubleSide}),
  ceiling: new MeshBasicMaterial({vertexColors: true, color: 0xb9b6ae, side: DoubleSide}),
  frame: new MeshStandardMaterial({color: 0x3f4448, metalness: .6, roughness: .45, side: DoubleSide}),
  glass: new MeshStandardMaterial({color: 0x6f8d86, metalness: .1, roughness: .15, transparent: true, opacity: .55, side: DoubleSide, depthWrite: false}),
  light: new MeshBasicMaterial({color: 0xfdfbf2})
 };
 const root = new Group(); root.name = 'tunnel';
 const meshes = [
  new Mesh(geometry(inner.floor), materials.floor), new Mesh(geometry(inner.wall), materials.wall),
  new Mesh(geometry(inner.ceiling), materials.ceiling),
  new Mesh(geometry(outer.wall, false), materials.glass), new Mesh(geometry(outer.roof, false), materials.roof),
  new Mesh(geometry(inner.steps), materials.steps)
 ];
 meshes.forEach((m, i) => {m.name = ['tunnel-floor', 'tunnel-wall', 'tunnel-ceiling', 'tunnel-entrance-glass', 'tunnel-entrance-roof', 'tunnel-steps'][i]; root.add(m);});
 meshes[3].renderOrder = 2; meshes[4].renderOrder = 2;
 // Strip lights, every 5 m along the passage (not on the staircases' glass roofs).
 const strips = [];
 for (let at = 2.5; at < tunnel.length; at += 5) {
  const p = tunnel.pointAt(at), c = tunnel.ceilingAt(at);
  if (c > -.2) continue;
  const b = new BoxGeometry(.18, .05, 1.6); b.rotateY(p.heading); b.translate(p.x, c - .04, p.z); strips.push(b);
 }
 // The entrance frames: a portal of steel over each open end.
 for (const e of tunnel.ends) {
  for (const sgn of [-1, 1]) {const post = new BoxGeometry(.14, height, .14); post.translate(e.top.x - e.out.z * half * sgn, height / 2, e.top.z + e.out.x * half * sgn); strips.push(post);}
  const lintel = new BoxGeometry(width + .3, .22, .22); lintel.rotateY(Math.atan2(-e.out.x, -e.out.z)); lintel.translate(e.top.x, height - .11, e.top.z); strips.push(lintel);
 }
 const lights = mergeGeometries(strips.slice(0, strips.length - tunnel.ends.length * 3)), frames = mergeGeometries(strips.slice(strips.length - tunnel.ends.length * 3));
 const lightMesh = new Mesh(lights, materials.light); lightMesh.name = 'tunnel-lights'; root.add(lightMesh);
 const frameMesh = new Mesh(frames, materials.frame); frameMesh.name = 'tunnel-entrance-frames'; root.add(frameMesh);
 // Signs: at each entrance a panel on a post beside the open end; at each corner below, a board.
 const signs = [];
 for (const e of tunnel.ends) {
  const tex = signTexture([[e.name, 150, 110], ['渋谷駅  Shibuya Sta.', 44, 215]]);
  const mat = new MeshBasicMaterial({map: tex, color: tex ? 0xffffff : 0x1d3557, side: DoubleSide}); signs.push(mat);
  const panel = new Mesh(new BoxGeometry(1.1, .55, .06), mat);
  const px = e.top.x + e.out.x * .9 + e.out.z * (half + .7), pz = e.top.z + e.out.z * .9 - e.out.x * (half + .7);
  panel.position.set(px, 2.35, pz); panel.rotation.y = Math.atan2(e.out.x, e.out.z); panel.name = `tunnel-sign-${e.name}`; root.add(panel);
  const post = new Mesh(new BoxGeometry(.08, 2.1, .08), materials.frame); post.position.set(px, 1.05, pz); root.add(post);
 }
 const boardTex = signTexture([[`← ${tunnel.ends[0].name}    ${tunnel.ends[1].name} →`, 90, 128]], '#243447');
 const boardMat = new MeshBasicMaterial({map: boardTex, color: boardTex ? 0xffffff : 0x243447, side: DoubleSide}); signs.push(boardMat);
 for (let i = 2; i < route.length - 2; i++) {
  const at = s[i], p = tunnel.pointAt(at), c = tunnel.ceilingAt(at);
  const board = new Mesh(new BoxGeometry(1.6, .4, .04), boardMat); board.position.set(p.x, c - .45, p.z); board.rotation.y = p.heading + Math.PI / 2; root.add(board);
 }
 return {
  root,
  dispose() {root.traverse(o => {if (o.isMesh) o.geometry.dispose();}); for (const m of [...Object.values(materials), ...signs]) {m.map?.dispose(); m.dispose();}}
 };
}
