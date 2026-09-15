import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {prepareHero} from '../src/heroes/model.mjs';
import {BUILDERS} from '../src/heroes/builders.mjs';
import {HERO_DEFINITIONS} from '../src/heroes/config.mjs';
import {CAMERAS} from '../src/app/foundation.mjs';
import {REFERENCE_ADS, REFERENCE_VIEW, MOUNT_CATEGORY, MAX_WIDTH, MAX_RANGE, MIN_FACING,
 AD_ANCHORS, EXCLUDED_ADS, MAX_BLADE_WIDTH, referenceBasis, adRay, intersectHosts,
 bestCameraEdge, placeAnchorGroup, visibleWallPatch, resolveReferenceAds} from '../src/signs/reference-ads.mjs';
import {applyReferenceAds} from '../src/signs/reference-layer.mjs';
import {buildSignModel} from '../src/signs/model.mjs';
import {commercialLayout} from '../src/signs/commercial-layout.mjs';

const data = JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground = buildGroundModel(data), generic = buildBuildingModel(data);
const heroes = HERO_DEFINITIONS.map(d => {const h = prepareHero(data, d); BUILDERS[d.builder](h); return h;});
const core = buildStationModel(data, {ground, generic});
const hosts = [
 ...generic.buildings.map(b => ({id: b.id, key: b.key, polygon: b.polygon, bottom: b.base, top: b.base + b.height})),
 ...heroes.flatMap(h => h.masses.map((m, i) => ({id: h.id, key: h.key + ':mass:' + i, ...m}))),
 ...core.masses.map(m => ({id: 'station:' + m.owner, key: 'station:' + m.owner, ...m}))
];
const camera = CAMERAS.find(c => c.id === 'scramble');
const resolved = resolveReferenceAds(hosts, camera);

test('the inventory is complete, uniquely identified and mountable', () => {
 assert.equal(REFERENCE_ADS.length, 30);
 assert.equal(new Set(REFERENCE_ADS.map(a => a.id)).size, 30);
 for (const ad of REFERENCE_ADS) {
  assert.ok(MOUNT_CATEGORY[ad.mount], `unmapped mount ${ad.mount}`);
  assert.ok(MAX_WIDTH[ad.mount] > 0, `no width limit for ${ad.mount}`);
  assert.ok(['critical', 'high', 'medium', 'low'].includes(ad.priority));
  for (const key of ['left', 'top', 'width', 'height']) assert.ok(ad[key] >= 0 && ad[key] <= 100, `${ad.id} ${key}`);
  assert.ok(ad.left + ad.width <= 100.01 && ad.top + ad.height <= 100.01, `${ad.id} leaves the frame`);
 }
});

test('rays are unprojected through the frame the inventory was measured in', () => {
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 assert.ok(Math.abs(Math.hypot(...basis.forward) - 1) < 1e-9);
 assert.ok(Math.abs(basis.forward[0] * basis.right[0] + basis.forward[1] * basis.right[1] + basis.forward[2] * basis.right[2]) < 1e-9);
 // The frame centre must look straight down the camera axis, and the corners must spread
 // apart by the recorded aspect rather than the viewer's current canvas.
 const centre = adRay({left: 50, top: 50, width: 0, height: 0}, basis);
 for (let i = 0; i < 3; i++) assert.ok(Math.abs(centre.direction[i] - basis.forward[i]) < 1e-9);
 const right = adRay({left: 100, top: 50, width: 0, height: 0}, basis);
 const up = adRay({left: 50, top: 0, width: 0, height: 0}, basis);
 const spreadX = Math.abs(right.direction[0] * basis.right[0] + right.direction[1] * basis.right[1] + right.direction[2] * basis.right[2]);
 const spreadY = Math.abs(up.direction[0] * basis.up[0] + up.direction[1] * basis.up[1] + up.direction[2] * basis.up[2]);
 assert.ok(spreadX > spreadY, 'a wide frame must spread further horizontally than vertically');
});

test('resolved advertisements land on a real facade at a buildable size', () => {
 assert.ok(resolved.placed.length >= 20, `only ${resolved.placed.length} placed`);
 for (const p of resolved.placed) {
  assert.ok(hosts.includes(p.host), `${p.ad.id} left the host set`);
  assert.ok(p.distance > 0 && p.distance <= MAX_RANGE, `${p.ad.id} range ${p.distance}`);
  assert.ok(p.width > .4 && p.width <= MAX_WIDTH[p.ad.mount], `${p.ad.id} width ${p.width}`);
  assert.ok(p.height > .3, `${p.ad.id} height ${p.height}`);
  assert.ok(p.foreshortening >= MIN_FACING, `${p.ad.id} sits on a receding wall`);
  assert.ok([p.along, p.y, ...p.point].every(Number.isFinite), `${p.ad.id} transform`);
  // Wall mounts stay inside the host; only roof mounts are allowed to clear the roofline.
  assert.ok(p.along - p.width / 2 >= -1e-6 && p.along + p.width / 2 <= p.edge.length + 1e-6, `${p.ad.id} overruns its wall`);
  if (!p.roof) assert.ok(p.y - p.height / 2 >= p.host.bottom - 1e-6 && p.y + p.height / 2 <= p.host.top + 1e-6, `${p.ad.id} leaves its host`);
  else assert.ok(p.y - p.height / 2 >= p.host.top - 1e-6, `${p.ad.id} sinks into its roof`);
 }
});

test('advertisements with no building are reported, never relocated', () => {
 for (const u of resolved.unplaced) {
  assert.ok(u.reason, `${u.id} rejected without a reason`);
  assert.ok(!resolved.placed.some(p => p.ad.id === u.id), `${u.id} is both placed and unplaced`);
 }
 assert.equal(resolved.placed.length + resolved.unplaced.length, REFERENCE_ADS.length);
});

test('placement is deterministic', () => {
 const again = resolveReferenceAds(hosts, camera);
 assert.deepEqual(again.placed.map(p => [p.ad.id, p.host.key, p.along, p.y, p.width, p.height]),
  resolved.placed.map(p => [p.ad.id, p.host.key, p.along, p.y, p.width, p.height]));
 assert.deepEqual(again.unplaced.map(u => [u.id, u.reason]), resolved.unplaced.map(u => [u.id, u.reason]));
});

test('the render layer clears the panels a reference slot covers', () => {
 const procedural = [];
 for (const p of resolved.placed) {
  // A generated panel sitting squarely inside the slot must not survive alongside it.
  procedural.push({id: 'sticker:' + p.ad.id, hostKey: p.host.key, edge: p.edge, along: p.along,
   width: Math.min(1.2, p.width / 2), height: Math.min(1.2, p.height / 2), category: 'billboard', region: 'frontage',
   position: [p.edge.a[0] + p.edge.tangent[0] * p.along, p.y, p.edge.a[1] + p.edge.tangent[1] * p.along]});
 }
 const far = {id: 'sticker:far', hostKey: 'none', edge: null, along: 0, width: 1, height: 1,
  category: 'billboard', region: 'frontage', position: [9999, 5, 9999]};
 const result = applyReferenceAds([...procedural, far], hosts, {camera});
 assert.equal(result.replaced, procedural.length);
 assert.ok(result.signs.includes(far), 'a panel outside every slot must be kept');
 assert.equal(result.signs.length, 1 + resolved.placed.length);
 for (const sign of result.signs.filter(s => s.referenceAd)) {
  assert.ok(sign.id.startsWith('ref:'));
  assert.ok(Number.isFinite(sign.heading) && sign.position.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...sign.normal) - 1) < 1e-6);
  assert.equal(sign.emissive.class, ['screen', 'rooftop'].includes(sign.category) ? 'screen' : 'commercial');
 }
});

test('a reference slot is audited like any other sign and never stamped onto one', () => {
 // Regression: slots 19 and 20 resolved onto the QFRONT facade at the same position as
 // that building's own large screen, so IKEA and ACN rendered stuck through the middle of
 // it. Two more hung over the roadway. Reference advertisements must clear the same
 // placement audit the procedural signs already clear.
 const model = buildSignModel(data, {generic, ground, core, heroes, tier: 'high'});
 const layout = commercialLayout(model.signs, 32);
 const audited = applyReferenceAds(layout, model.hosts, {camera, context: model.context});
 const unaudited = applyReferenceAds(layout, model.hosts, {camera});

 const screens = audited.signs.filter(s => s.screenUV);
 assert.ok(screens.length, 'the scene must still carry its hero screens');
 for (const ad of audited.signs.filter(s => s.referenceAd)) {
  for (const screen of screens) {
   const dx = ad.position[0] - screen.position[0], dz = ad.position[2] - screen.position[2];
   const offPlane = Math.abs(dx * screen.normal[0] + dz * screen.normal[2]);
   const across = Math.abs(dx * screen.normal[2] - dz * screen.normal[0]);
   const apart = offPlane > 2.5 || across >= (ad.width + screen.width) / 2 ||
    Math.abs(ad.position[1] - screen.position[1]) >= (ad.height + screen.height) / 2;
   assert.ok(apart, `${ad.referenceAd.brand} is stamped onto ${screen.id}`);
  }
 }
 // The audit must be doing the work, not luck: it has to reject placements that the
 // unaudited path accepts, and every rejection has to name the fault it found.
 assert.ok(audited.rejected.length > 0, 'the audit rejected nothing at all');
 assert.ok(audited.placed.length < unaudited.placed.length, 'the audit changed no outcome');
 for (const r of audited.rejected) {
  assert.match(r.reason, /^placement-audit:/);
  assert.ok(!audited.placed.some(p => p.ad.id === r.ad?.id ?? r.id), 'a rejected slot is still placed');
 }
 assert.equal(audited.placed.length + audited.unplaced.length, REFERENCE_ADS.length);
});

test('an anchored advertisement sits on the building it was anchored to', () => {
 // Regression: the centre block's percentages were measured off a reference image whose
 // composition is not this scene's, so unprojecting them sent Hisamitsu, Rakuten, DMM and
 // 大盛堂書店 onto neighbouring plots, over the roadway, or past every roof into open sky.
 // Naming the host makes the placement follow the scene's own geometry.
 const anchored = resolved.placed.filter(p => p.anchored);
 assert.equal(anchored.length, Object.keys(AD_ANCHORS).length, 'an anchored slot went missing');
 for (const p of anchored) {
  assert.equal(p.host.key, AD_ANCHORS[p.ad.id], `${p.ad.brand} drifted off its anchor`);
  assert.ok(p.foreshortening >= MIN_FACING, `${p.ad.brand} sits on a wall turned from the camera`);
 }
});

test('an anchored group keeps the reference arrangement without overlapping', () => {
 for (const key of new Set(Object.values(AD_ANCHORS))) {
  const group = resolved.placed.filter(p => p.anchored && p.host.key === key);
  assert.ok(group.length >= 2, `${key} carries no group`);
  // One wall, so a shared facade rectangle: the panels must tile it, not stack on it.
  assert.equal(new Set(group.map(p => p.edge.index)).size, 1, `${key} spread across walls`);
  for (const p of group) {
   assert.ok(p.along - p.width / 2 > 0 && p.along + p.width / 2 < p.edge.length, `${p.ad.brand} overruns its wall`);
   assert.ok(p.y - p.height / 2 >= p.host.bottom && p.y + p.height / 2 <= p.host.top, `${p.ad.brand} leaves its host`);
  }
  for (const a of group) for (const b of group) {
   if (a.ad.id >= b.ad.id) continue;
   const apart = Math.abs(a.along - b.along) >= (a.width + b.width) / 2 - 1e-9 ||
    Math.abs(a.y - b.y) >= (a.height + b.height) / 2 - 1e-9;
   assert.ok(apart, `${a.ad.brand} overlaps ${b.ad.brand}`);
  }
  // Scaling the group uniformly is what preserves the reference proportions; check the two
  // that sit one above the other kept their relative sizes.
  const [wide, tall] = [...group].sort((a, b) => b.width * b.height - a.width * a.height);
  if (wide.category !== 'blade' && tall.category !== 'blade')
   assert.ok(Math.abs(wide.width / tall.width - wide.ad.width / tall.ad.width) < 1e-6, `${key} lost its proportions`);
 }
});

test('the visibility scan reports what standing in front of a wall does to it', () => {
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 const host = hosts.find(h => h.key === AD_ANCHORS[15]);
 const edge = bestCameraEdge(host, basis, hosts).edge;
 const open = visibleWallPatch(host, edge, basis, hosts);
 assert.ok(open && open.coverage > .9, 'the anchor wall should be effectively unobstructed');
 assert.ok(open.along[1] > open.along[0] && open.y[1] > open.y[0]);
 assert.ok(open.along[0] >= -1e-9 && open.along[1] <= edge.length + 1e-9);

 // Drop a wall in front of it and the reported patch has to shrink.
 const t = edge.tangent, n = edge.normal, mid = 40;
 const c = [edge.a[0] + t[0] * edge.length / 2 + n[0] * mid, edge.a[1] + t[1] * edge.length / 2 + n[1] * mid];
 const wall = {key: 'test:wall', bottom: 0, top: 60, polygon: {outer: [
  [c[0] - t[0] * 60 - n[0], c[1] - t[1] * 60 - n[1]], [c[0] + t[0] * 60 - n[0], c[1] + t[1] * 60 - n[1]],
  [c[0] + t[0] * 60 + n[0], c[1] + t[1] * 60 + n[1]], [c[0] - t[0] * 60 + n[0], c[1] - t[1] * 60 + n[1]]]}};
 const blocked = visibleWallPatch(host, edge, basis, [...hosts, wall]);
 assert.ok(!blocked || blocked.coverage < open.coverage, 'a wall in the way changed nothing');
});

test('a blade is sized by how far it may stand off the wall', () => {
 // A blade's width is its reach over the street, so panel-sized widths put a neon sign
 // metres above the pavement and the placement audit throws it out.
 for (const p of resolved.placed.filter(p => p.category === 'blade'))
  assert.ok(p.width <= MAX_BLADE_WIDTH, `${p.ad.brand} reaches ${p.width} m off its facade`);
});

test('an excluded advertisement is reported, not placed and not forgotten', () => {
 for (const [id, reason] of Object.entries(EXCLUDED_ADS)) {
  assert.ok(REFERENCE_ADS.some(a => a.id === Number(id)), `${id} is excluded but not in the inventory`);
  assert.ok(!resolved.placed.some(p => p.ad.id === Number(id)), `${id} is excluded but placed`);
  assert.equal(resolved.unplaced.find(u => u.id === Number(id))?.reason, reason);
 }
});

test('the wall an anchored group lands on is the one the camera can see most of', () => {
 // Facing alone picks the widest wall, which in a street this dense is regularly the one
 // standing behind its neighbour. Measured visibility has to be what decides.
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 for (const key of new Set(Object.values(AD_ANCHORS))) {
  const host = hosts.find(h => h.key === key);
  assert.ok(host, `anchor host ${key} is missing from the scene`);
  const seen = bestCameraEdge(host, basis, hosts);
  assert.ok(seen?.patch, `${key} shows no visible facade`);
  assert.ok(seen.facing >= MIN_FACING && seen.edge.length > 1);
  for (const p of resolved.placed.filter(p => p.host.key === key && p.anchored)) {
   assert.equal(p.edge.index, seen.edge.index, `${p.ad.brand} is not on the most visible wall`);
   // And the panel has to sit inside the patch that scan found, not merely on that wall.
   assert.ok(p.along - p.width / 2 >= seen.patch.along[0] - 1e-6 &&
    p.along + p.width / 2 <= seen.patch.along[1] + 1e-6, `${p.ad.brand} runs past the visible patch`);
   assert.ok(p.y - p.height / 2 >= seen.patch.y[0] - 1e-6 &&
    p.y + p.height / 2 <= seen.patch.y[1] + 1e-6, `${p.ad.brand} sits outside the visible band`);
  }
  // Geometry-only selection remains available and must still answer.
  assert.ok(bestCameraEdge(host, basis), `${key} shows no facade to the camera`);
 }
});

test('a wall too hidden to read carries nothing at all', () => {
 // Squeezing a group into a sliver produces panels smaller than the procedural stickers
 // beside them, which reads as litter on the facade rather than as an advertisement.
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 const host = hosts.find(h => h.key === AD_ANCHORS[19]);
 const ads = REFERENCE_ADS.filter(a => AD_ANCHORS[a.id] === host.key);
 const sliver = {...host, polygon: host.polygon, bottom: host.bottom, top: host.bottom + .9};
 const out = placeAnchorGroup(ads, sliver, basis, hosts);
 assert.ok(!Array.isArray(out), 'a wall with no room still produced placements');
});

test('an empty host set leaves the procedural signs untouched', () => {
 const signs = [{id: 'a', position: [0, 5, 0], width: 1, height: 1, category: 'billboard', region: 'frontage'}];
 const result = applyReferenceAds(signs, [], {camera});
 assert.equal(result.signs, signs);
 assert.deepEqual(result.placed, []);
});

test('a ray that faces away from every wall finds nothing', () => {
 const basis = referenceBasis(camera, REFERENCE_VIEW);
 const skyward = {origin: basis.origin, direction: [0, 1, 0]};
 assert.equal(intersectHosts(skyward, hosts), null);
});
