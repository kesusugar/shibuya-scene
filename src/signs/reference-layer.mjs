// Render-time layer that puts the reference advertisement inventory on real facades.
//
// This runs at render time rather than during the static bake so that re-aiming or
// re-drawing an advertisement does not invalidate the expensive geometry pack. It takes
// the display signs the procedural layout produced and swaps the generic panels that
// occupy a reference slot for the reference advertisement itself.

import {makePlacement, placementIssues} from './model.mjs';
import {CAMERAS} from '../app/foundation.mjs';
import {resolveReferenceAds} from './reference-ads.mjs';

/** Vertical mounts read as blades; everything else keeps the facade plane. */
const VERTICAL = new Set(['wall_panel_vertical', 'sleeve_sign_vertical', 'sleeve_sign_vertical_banner', 'neon_sign_vertical']);

function overlaps(a, b, margin = 0) {
 return Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > -margin;
}

/**
 * Replace procedural panels that sit where a reference advertisement belongs. A generic
 * sign is dropped when it shares a facade with a reference slot and their footprints
 * overlap, so the reference artwork never renders on top of a sticker it did not replace.
 */
/**
 * Placement faults that disqualify a reference advertisement outright.
 *
 * A reference slot is aimed from a photograph, so it can land on a wall that already
 * carries something — most visibly QFRONT's own screen, which a slot measured beside it
 * will happily sit on top of. These are the faults the procedural signs are already
 * audited for; reference advertisements must clear the same bar rather than bypass it.
 *
 * `vertical-host-bounds` is deliberately absent: a rooftop mount is supposed to stand
 * above its host's roofline, which that check reads as leaving the building.
 */
export const FATAL_ISSUES = Object.freeze([
 'invalid-transform', 'invalid-normal', 'backface', 'corner-overrun', 'facade-distance',
 'host-penetration', 'neighbor-penetration', 'duplicate-overlap', 'near-overlap',
 'road-projection', 'crosswalk-projection', 'rail-clearance', 'tile-edge'
]);

export function applyReferenceAds(signs, hosts, {camera = CAMERAS.find(c => c.id === 'scramble'), variantOf, context} = {}) {
 if (!hosts?.length) return {signs, placed: [], unplaced: []};
 const {placed, unplaced} = resolveReferenceAds(hosts, camera);
 // Reference slots are measured from the frame, not from the procedural grid, so a slot
 // routinely straddles several generated panels on a neighbouring host key. Clearing by
 // world footprint rather than by host identity is what actually stops the reference
 // artwork rendering on top of the stickers it is meant to replace.
 const boxes = placed.map(p => ({
  centre: [p.edge.a[0] + p.edge.tangent[0] * p.along, p.y, p.edge.a[1] + p.edge.tangent[1] * p.along],
  normal: [p.edge.normal[0], 0, p.edge.normal[1]], tangent: [p.edge.tangent[0], 0, p.edge.tangent[1]],
  half: p.width / 2, vertical: [p.y - p.height / 2, p.y + p.height / 2]
 }));
 const kept = signs.filter(s => {
  if (s.screenUV) return true; // hero screens keep their own segmented mapping
  return !boxes.some(b => {
   const delta = [s.position[0] - b.centre[0], 0, s.position[2] - b.centre[2]];
   if (Math.abs(delta[0] * b.normal[0] + delta[2] * b.normal[2]) > 1.5) return false; // different wall plane
   const along = delta[0] * b.tangent[0] + delta[2] * b.tangent[2];
   return overlaps([along - s.width / 2, along + s.width / 2], [-b.half, b.half], -.15) &&
    overlaps([s.position[1] - s.height / 2, s.position[1] + s.height / 2], b.vertical, -.15);
  });
 });

 const rejected = [];
 const added = placed.map(p => {
  const vertical = VERTICAL.has(p.ad.mount);
  const sign = makePlacement(
   {id: p.host.id ?? p.host.key, key: p.host.key, label: 'reference-ad', polygon: p.host.polygon, bottom: p.host.bottom, top: p.host.top},
   p.edge,
   {id: 'ref:' + p.ad.id, category: vertical ? 'blade' : p.category, along: p.along, y: p.y,
    width: p.width, height: p.height, region: 'frontage',
    offset: p.roof ? .2 : .18, variant: variantOf?.(p.ad) ?? 0});
  sign.referenceAd = p.ad;
  sign.referenceMount = p.ad.mount;
  sign.referenceLowered = p.lowered;
  // Roof and vision mounts are lit as displays; painted wall panels stay printed.
  sign.emissive = {...sign.emissive, class: p.category === 'screen' || p.roof ? 'screen' : 'commercial'};
  return sign;
 });

 // Audit the reference advertisements against everything that survived, exactly as the
 // procedural signs are audited. Accepting them one at a time means two reference slots
 // resolving onto the same wall are caught against each other too.
 const accepted = [];
 for (const sign of added) {
  const issues = context ? placementIssues(sign, context, [...kept, ...accepted]) : [];
  const fatal = issues.filter(issue => FATAL_ISSUES.includes(issue));
  if (fatal.length) rejected.push({...sign.referenceAd, reason: 'placement-audit:' + fatal.join('+')});
  else accepted.push(sign);
 }
 const keptIds = new Set(accepted.map(s => s.referenceAd.id));
 return {signs: [...kept, ...accepted], placed: placed.filter(p => keptIds.has(p.ad.id)),
  unplaced: [...unplaced, ...rejected], rejected, replaced: signs.length - kept.length};
}
