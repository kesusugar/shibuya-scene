// Reference advertisement inventory measured from the CAM-02 reference frame.
//
// The inventory records where each advertisement sits in the reference image as a
// percentage of the frame, so it is resolution independent but NOT aspect independent:
// the percentages only describe the same world direction when they are unprojected
// through the aspect ratio they were measured at. REFERENCE_VIEW therefore pins the
// measuring frame, and placement always unprojects through that frame rather than the
// viewer's current canvas.
//
// Artwork for these slots is reconstructed procedurally in this repository. No official
// logo files, fonts or brand assets are downloaded or committed. Positions are derived
// from a single reference frame and are approximations, not a surveyed advertising
// inventory.

import {inPolygon} from '../geo/core.mjs';

export const REFERENCE_VIEW = Object.freeze({camera: 'scramble', fov: 50, width: 1491, height: 812});

// id, zone, brand, category, left%, top%, width%, height%, aspect, mount, priority
export const REFERENCE_ADS = Object.freeze([
 {id:1,zone:'left_front_building_1f',brand:'カラオケ BIGECHO',category:'karaoke',left:1.3,top:37.6,width:8.1,height:8.6,aspect:0.942,mount:'wall_panel',priority:'high'},
 {id:2,zone:'left_front_building_1f',brand:'AEON',category:'general_retail',left:9.7,top:37.6,width:3.7,height:3.7,aspect:1.0,mount:'wall_panel',priority:'high'},
 {id:3,zone:'left_front_building_2f',brand:'本 渋谷書店',category:'bookstore',left:10.1,top:46.6,width:8.0,height:3.7,aspect:2.162,mount:'wall_panel',priority:'low'},
 {id:4,zone:'left_front_building_2f',brand:'Cafeレストラン ガスト',category:'family_restaurant_chain',left:18.4,top:43.3,width:7.8,height:2.0,aspect:3.9,mount:'wall_panel',priority:'medium'},
 {id:5,zone:'left_front_building_3f',brand:'7F しゃぶ葉',category:'hotpot_restaurant_chain',left:1.3,top:46.6,width:8.1,height:5.4,aspect:1.5,mount:'wall_panel',priority:'medium'},
 {id:6,zone:'left_front_building_3f',brand:'英会話 イーオン',category:'english_school_chain',left:10.1,top:50.7,width:8.0,height:4.7,aspect:1.702,mount:'wall_panel',priority:'medium'},
 {id:7,zone:'left_front_building_4f',brand:'光回線 イーチカン',category:'internet_isp',left:1.3,top:53.2,width:8.1,height:6.5,aspect:1.246,mount:'wall_panel_small',priority:'low'},
 {id:8,zone:'center_left_vertical',brand:'もんじゃ',category:'okonomiyaki_monja_restaurant',left:23.5,top:32.6,width:4.7,height:11.7,aspect:0.402,mount:'wall_panel_vertical',priority:'medium'},
 {id:9,zone:'left_front_building_5f',brand:'LIVE MAX',category:'karaoke_live_house',left:1.3,top:61.0,width:8.1,height:4.9,aspect:1.653,mount:'wall_panel',priority:'medium'},
 {id:10,zone:'left_front_building_5f',brand:'アコム',category:'consumer_finance',left:10.1,top:59.7,width:8.0,height:6.2,aspect:1.29,mount:'wall_panel',priority:'high'},
 {id:11,zone:'left_front_building_5f',brand:'LUSH',category:'cosmetics_goods',left:18.4,top:61.0,width:7.8,height:4.9,aspect:1.592,mount:'wall_panel',priority:'medium'},
 {id:12,zone:'center_vertical_tower_sign',brand:'SHIBUYA 109',category:'fashion_building',left:26.0,top:20.3,width:2.2,height:3.7,aspect:0.595,mount:'sleeve_sign_vertical',priority:'medium'},
 {id:13,zone:'center_upper_round_logo',brand:'UC',category:'credit_card',left:32.4,top:20.3,width:5.5,height:6.2,aspect:0.887,mount:'wall_panel',priority:'high'},
 {id:14,zone:'center_upper',brand:'龍角散ダイレクト',category:'pharma_throat_medicine',left:37.9,top:21.2,width:5.4,height:5.3,aspect:1.019,mount:'wall_panel',priority:'medium'},
 {id:15,zone:'center_upper_blue',brand:'Hisamitsu',category:'pharma',left:45.1,top:20.9,width:5.7,height:5.6,aspect:1.018,mount:'wall_panel',priority:'high'},
 {id:16,zone:'center_upper_green',brand:'サロンパス',category:'pharma_patch',left:45.1,top:26.8,width:5.7,height:5.0,aspect:1.14,mount:'wall_panel',priority:'high'},
 {id:17,zone:'center_vertical_neon',brand:'もん字',category:'restaurant',left:40.1,top:30.8,width:3.8,height:11.7,aspect:0.325,mount:'neon_sign_vertical',priority:'low'},
 {id:18,zone:'center_right_red_black',brand:'Rakuten',category:'ecommerce',left:45.1,top:36.1,width:6.2,height:7.0,aspect:0.886,mount:'wall_panel',priority:'high'},
 {id:19,zone:'center_right_yellow',brand:'IKEA',category:'furniture_interior',left:52.0,top:31.4,width:5.3,height:4.3,aspect:1.233,mount:'wall_panel',priority:'high'},
 {id:20,zone:'center_right_black',brand:'ACN',category:'corporate_logo_media',left:53.0,top:37.6,width:4.3,height:6.7,aspect:0.642,mount:'wall_panel',priority:'medium'},
 {id:21,zone:'center_lower_vision',brand:'DMM',category:'video_streaming_media',left:46.8,top:48.0,width:4.4,height:5.6,aspect:0.786,mount:'large_led_vision',priority:'medium'},
 {id:22,zone:'center_lower_white',brand:'大盛堂書店',category:'bookstore',left:45.1,top:55.4,width:6.6,height:3.1,aspect:2.129,mount:'wall_panel',priority:'low'},
 {id:23,zone:'right_tower_top',brand:'Coca-Cola',category:'beverage',left:64.1,top:2.5,width:15.0,height:12.3,aspect:1.22,mount:'rooftop_large_led_vision',priority:'critical'},
 {id:24,zone:'right_tower_building_name',brand:'QFRONT',category:'building_name',left:77.5,top:16.6,width:4.3,height:1.9,aspect:2.263,mount:'building_nameplate',priority:'low'},
 {id:25,zone:'right_tower_midlevel',brand:'Start saving now!',category:'finance_banner_ad',left:67.4,top:33.3,width:7.4,height:11.0,aspect:0.673,mount:'large_led_vision',priority:'medium'},
 {id:26,zone:'right_building_1f',brand:'STARBUCKS',category:'cafe_chain',left:64.4,top:57.3,width:4.0,height:1.8,aspect:2.222,mount:'facade_logo',priority:'high'},
 {id:27,zone:'right_building_1f',brand:'TSUTAYA',category:'rental_bookstore',left:74.1,top:61.0,width:6.1,height:2.4,aspect:2.542,mount:'facade_logo',priority:'medium'},
 {id:28,zone:'right_edge_building_vertical',brand:'SEIBU',category:'department_store',left:86.3,top:34.5,width:1.2,height:17.2,aspect:0.07,mount:'sleeve_sign_vertical_banner',priority:'medium'},
 {id:29,zone:'right_edge_building_green',brand:'CITY DRUG',category:'drugstore',left:90.2,top:61.0,width:9.7,height:8.0,aspect:1.212,mount:'wall_panel',priority:'low'},
 {id:30,zone:'right_edge_building_red',brand:'サンドラッグ',category:'drugstore',left:90.2,top:69.6,width:9.7,height:8.0,aspect:1.212,mount:'wall_panel',priority:'high'}
]);

// Mount types describe how the advertisement is carried, which decides both the sign
// category used for placement auditing and how brightly the face is driven at night.
export const MOUNT_CATEGORY = Object.freeze({
 wall_panel: 'billboard', wall_panel_small: 'flush', wall_panel_vertical: 'blade',
 sleeve_sign_vertical: 'blade', sleeve_sign_vertical_banner: 'blade', neon_sign_vertical: 'blade',
 large_led_vision: 'screen', rooftop_large_led_vision: 'rooftop', facade_logo: 'box',
 building_nameplate: 'rooftop'
});

// Rooftop mounts stand above the roofline, so a ray aimed at them passes over every
// facade and would otherwise land on whatever happens to be far behind.
export const ROOF_MOUNTS = new Set(['rooftop_large_led_vision', 'building_nameplate']);

// A wall panel that resolves far wider than its mount type ever gets built is a sign that
// the ray found the wrong wall, not that Shibuya has a 30 m karaoke panel.
export const MAX_WIDTH = Object.freeze({
 rooftop_large_led_vision: 44, large_led_vision: 28, wall_panel: 26, wall_panel_small: 20,
 wall_panel_vertical: 12, facade_logo: 16, building_nameplate: 22,
 sleeve_sign_vertical: 9, sleeve_sign_vertical_banner: 9, neon_sign_vertical: 12
});

// Hits past this range are behind the buildings the reference frame actually shows.
export const MAX_RANGE = 220;
// Below this the facade is too edge-on for the recorded screen coverage to mean anything.
export const MIN_FACING = .3;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const unit = a => {const l = Math.hypot(...a); if (!(l > 0)) throw Error('Zero-length vector'); return scale(a, 1 / l);};

/** Camera basis for the frame the inventory percentages were measured in. */
export function referenceBasis(camera, view = REFERENCE_VIEW) {
 const origin = camera.position, forward = unit(sub(camera.target, origin));
 const right = unit(cross(forward, [0, 1, 0])), up = cross(right, forward);
 return {origin, forward, right, up, tanHalf: Math.tan(view.fov * Math.PI / 360), aspect: view.width / view.height};
}

/**
 * World-space ray through a point in an inventory rectangle, given as fractions of the
 * rectangle (0,0 is its top-left corner and .5,.5 its centre).
 */
export function adRay(ad, basis, u = .5, v = .5) {
 const ndcX = (ad.left + ad.width * u) / 50 - 1, ndcY = 1 - (ad.top + ad.height * v) / 50;
 const x = ndcX * basis.tanHalf * basis.aspect, y = ndcY * basis.tanHalf;
 return {origin: basis.origin, direction: unit([
  basis.right[0] * x + basis.up[0] * y + basis.forward[0],
  basis.right[1] * x + basis.up[1] * y + basis.forward[1],
  basis.right[2] * x + basis.up[2] * y + basis.forward[2]])};
}

function hostEdges(polygon) {
 return polygon.outer.map((a, i) => {
  const b = polygon.outer[(i + 1) % polygon.outer.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tangent = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  return {a, b, length, tangent, normal: [tangent[1], -tangent[0]], index: i};
 }).filter(e => e.length > .1);
}

/**
 * Nearest front-facing facade hit by the ray, treating every host as a vertical prism
 * between its own bottom and top. Back faces are ignored so a ray never lands on the far
 * wall of the building it entered.
 */
export function intersectHosts(ray, hosts, minFacing = MIN_FACING) {
 let best = null;
 for (const host of hosts) {
  for (const e of hostEdges(host.polygon)) {
   const normal = [e.normal[0], 0, e.normal[1]], denom = dot(normal, ray.direction);
   if (denom > -minFacing) continue; // facing away, or too edge-on to size reliably
   const t = dot(normal, [e.a[0] - ray.origin[0], -ray.origin[1], e.a[1] - ray.origin[2]]) / denom;
   if (!(t > 0) || (best && t >= best.distance)) continue;
   const point = [ray.origin[0] + ray.direction[0] * t, ray.origin[1] + ray.direction[1] * t, ray.origin[2] + ray.direction[2] * t];
   if (point[1] < host.bottom || point[1] > host.top) continue;
   const along = (point[0] - e.a[0]) * e.tangent[0] + (point[2] - e.a[1]) * e.tangent[1];
   if (along < 0 || along > e.length) continue;
   best = {host, edge: e, point, along, distance: t};
  }
 }
 return best;
}

/**
 * World width and height that make the advertisement cover its recorded share of the
 * reference frame. Screen coverage shrinks as a facade turns away from the camera, so the
 * width is divided by how much of the facade tangent survives projection onto the screen.
 */
export function worldSize(ad, basis, hit) {
 const depth = dot(sub(hit.point, basis.origin), basis.forward);
 const tangent = [hit.edge.tangent[0], 0, hit.edge.tangent[1]];
 const foreshortening = Math.abs(dot(tangent, basis.right)), rise = Math.abs(dot([0, 1, 0], basis.up));
 const width = (ad.width / 50) * depth * basis.tanHalf * basis.aspect / Math.max(foreshortening, .15);
 const height = (ad.height / 50) * depth * basis.tanHalf / Math.max(rise, .15);
 return {width, height, depth, foreshortening};
}

/**
 * Host carrying a rooftop mount: the nearest building whose roof plane the ray crosses
 * inside the footprint. The ray is aimed at the foot of the rectangle, which is where the
 * sign meets the roof it stands on.
 */
export function roofHost(ad, basis, hosts) {
 const ray = adRay(ad, basis, .5, 1);
 if (!(ray.direction[1] < -1e-6)) return groundedRoofHost(ray, hosts);
 let best = null;
 for (const host of hosts) {
  const t = (host.top - ray.origin[1]) / ray.direction[1];
  if (!(t > 0) || (best && t >= best.distance)) continue;
  const point = [ray.origin[0] + ray.direction[0] * t, host.top, ray.origin[2] + ray.direction[2] * t];
  if (!inPolygon([point[0], point[2]], host.polygon)) continue;
  const facing = hostEdges(host.polygon)
   .map(e => ({e, facing: -dot([e.normal[0], 0, e.normal[1]], basis.forward)}))
   .sort((a, b) => b.facing - a.facing)[0];
  if (!facing || facing.facing < MIN_FACING) continue;
  const along = (point[0] - facing.e.a[0]) * facing.e.tangent[0] + (point[2] - facing.e.a[1]) * facing.e.tangent[1];
  best = {host, edge: facing.e, point, along: Math.min(Math.max(along, 0), facing.e.length), distance: t};
 }
 return best ?? groundedRoofHost(ray, hosts);
}

/**
 * Fallback for a rooftop sign whose reference building is taller than anything this scene
 * has in that direction: stand it on the roof of the nearest tall building the sight line
 * passes over. The sign then sits lower in frame than the reference, but on a real roof
 * instead of floating, and the caller is told the host was lowered.
 */
export function groundedRoofHost(ray, hosts, minHeight = 18) {
 let best = null;
 for (const host of hosts) {
  if (host.top < minHeight) continue;
  for (const e of hostEdges(host.polygon)) {
   const normal = [e.normal[0], 0, e.normal[1]], denom = dot(normal, ray.direction);
   if (denom > -MIN_FACING) continue;
   const t = dot(normal, [e.a[0] - ray.origin[0], 0, e.a[1] - ray.origin[2]]) / (normal[0] * ray.direction[0] + normal[2] * ray.direction[2]);
   if (!(t > 0) || (best && t >= best.distance)) continue;
   const point = [ray.origin[0] + ray.direction[0] * t, host.top, ray.origin[2] + ray.direction[2] * t];
   const along = (point[0] - e.a[0]) * e.tangent[0] + (point[2] - e.a[1]) * e.tangent[1];
   if (along < 0 || along > e.length) continue;
   best = {host, edge: e, point, along, distance: t, lowered: true};
  }
 }
 return best;
}

/**
 * Resolve the inventory against real hosts. A slot is only accepted when the ray lands on
 * a facade that faces the camera, within the range the reference frame covers, and at a
 * size its mount type is actually built at. Everything else is reported with a reason:
 * those advertisements belong to buildings this scene does not have yet, and inventing a
 * wall for them would put them somewhere the reference never showed them.
 */
export function resolveReferenceAds(hosts, camera, view = REFERENCE_VIEW) {
 const basis = referenceBasis(camera, view), placed = [], unplaced = [];
 for (const ad of REFERENCE_ADS) {
  const roof = ROOF_MOUNTS.has(ad.mount);
  const hit = roof ? roofHost(ad, basis, hosts) : intersectHosts(adRay(ad, basis), hosts);
  if (!hit) {unplaced.push({...ad, reason: roof ? 'no-roof-under-ray' : 'no-host-on-ray'}); continue;}
  if (hit.distance > MAX_RANGE) {unplaced.push({...ad, reason: 'host-beyond-reference-range', distance: hit.distance}); continue;}
  const size = worldSize(ad, basis, hit);
  // A wall running away from the camera shows almost no width on screen, so the recorded
  // screen coverage would demand an implausibly long sign. That is the wrong wall.
  if (size.foreshortening < MIN_FACING) {unplaced.push({...ad, reason: 'facade-recedes-from-view', foreshortening: size.foreshortening}); continue;}
  const limit = MAX_WIDTH[ad.mount] ?? 18;
  if (size.width > limit) {unplaced.push({...ad, reason: 'resolved-wider-than-mount-allows', width: size.width, limit}); continue;}
  // Trim to the wall it landed on rather than overhanging a corner or the roofline.
  const margin = .3, room = hit.edge.length - margin * 2;
  const width = Math.min(size.width, room);
  const span = hit.host.top - hit.host.bottom - margin * 2;
  const height = Math.min(size.height, roof ? size.height : span);
  if (!(width > .4 && height > .3)) {unplaced.push({...ad, reason: 'no-room-on-host-face'}); continue;}
  const along = Math.min(Math.max(hit.along, width / 2 + margin), hit.edge.length - width / 2 - margin);
  const y = roof
   ? hit.host.top + height / 2
   : Math.min(Math.max(hit.point[1], hit.host.bottom + height / 2 + margin), hit.host.top - height / 2 - margin);
  placed.push({ad, host: hit.host, edge: hit.edge, along, y, point: hit.point, distance: hit.distance, rayWidth: size.width,
   width, height, foreshortening: size.foreshortening, roof, lowered: !!hit.lowered,
   clamped: width < size.width - 1e-6 || height < size.height - 1e-6,
   category: MOUNT_CATEGORY[ad.mount] ?? 'billboard'});
 }
 return {basis, placed: fitGroupsToWalls(placed), unplaced};
}

// A wall needs this much clear edge around its advertisements.
const WALL_MARGIN = .3;
// Below this many advertisements a shared wall is not a facade grid, so each one keeps the
// size the raycast gave it rather than being stretched to fill the wall.
const GRID_MINIMUM = 3;

/**
 * Re-lay advertisements that share a wall.
 *
 * Each slot is sized independently from its own screen coverage, which is right in
 * isolation but collides once several slots land on the same facade: the reference frame's
 * left block carries nine advertisements across a facade far wider than the wall this
 * scene models, so nine correctly-sized panels overlap into an unreadable stack.
 *
 * For a wall carrying a grid of them, the group's screen rectangle is mapped linearly onto
 * the wall instead. That reproduces the reference arrangement — same columns, same rows,
 * same relative sizes — and cannot overlap, because the reference rectangles do not.
 */
export function fitGroupsToWalls(placed) {
 const groups = new Map();
 for (const p of placed) {
  if (p.roof) continue;
  const key = p.host.key + ':' + p.edge.index;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
 }
 for (const group of groups.values()) {
  if (group.length < GRID_MINIMUM) continue;
  const left = Math.min(...group.map(p => p.ad.left)), right = Math.max(...group.map(p => p.ad.left + p.ad.width));
  const top = Math.min(...group.map(p => p.ad.top)), bottom = Math.max(...group.map(p => p.ad.top + p.ad.height));
  const spanX = right - left, spanY = bottom - top;
  if (!(spanX > 0 && spanY > 0)) continue;
  const host = group[0].host, edge = group[0].edge;
  const usableX = edge.length - WALL_MARGIN * 2;
  // Keep the grid inside the storeys the raycast actually found it on, not the whole tower.
  const foundTop = Math.max(...group.map(p => p.y + p.height / 2));
  const foundBottom = Math.min(...group.map(p => p.y - p.height / 2));
  const ceiling = Math.min(host.top - WALL_MARGIN, foundTop);
  const floor = Math.max(host.bottom + WALL_MARGIN, foundBottom);
  const usableY = ceiling - floor;
  if (!(usableX > 1 && usableY > 1)) continue;
  for (const p of group) {
   p.width = p.ad.width / spanX * usableX;
   p.height = p.ad.height / spanY * usableY;
   p.along = WALL_MARGIN + (p.ad.left + p.ad.width / 2 - left) / spanX * usableX;
   p.y = ceiling - (p.ad.top + p.ad.height / 2 - top) / spanY * usableY;
   p.griddedWith = group.length;
   p.clamped = p.clamped || p.width < p.rayWidth - 1e-6;
  }
 }
 return placed;
}
