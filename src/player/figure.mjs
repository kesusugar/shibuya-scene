// The played figure, with limbs that actually swing.
//
// The crowd cannot do this. Its arms and legs are merged into one body geometry, which is
// what makes two thousand pedestrians affordable, and a merged limb has nothing to rotate
// about: the crowd's gait is whole-body lean and rise, and on the one figure the camera is
// locked to that reads as a slide. So the player gets a figure of its own -- seven small
// meshes rather than an instanced slot -- built to the crowd's proportions so it stands in
// the same street without looking borrowed from somewhere else.
//
// The crowd slot is still reserved and still active: it is what the pedestrians' neighbour
// avoidance sees, so they part around the player. The crowd simply does not draw it.

import {BoxGeometry, CapsuleGeometry, SphereGeometry, Group, Mesh, MeshStandardMaterial} from 'three';

export const FIGURE = Object.freeze({
 height: 1.76,
 shirt: 0xff3b1f,     // the outfit colour, matching the marker's family
 trousers: 0x2f3440,
 skin: 0xdfb994,      // taken from the crowd's own skin palette
 hair: 0x25282a,
 // A stride is about .75 m, so a full two-step cycle is 1.5 m: advancing the phase by
 // distance rather than by time is what keeps the feet from skating at any speed.
 cycle: 1.5,
 swing: .28,          // radians of limb swing per m/s, capped below
 swingMax: .85,
 bob: .028, lean: .05,
 // What the player is carrying. The crowd gets its accessories from a hash of its id; there
 // is only one player, so this is simply chosen. A shoulder bag rides on the body rather
 // than in a hand, which keeps it out of the arm swing and off the steering wheel.
 //
 // Pale, not dark. The first try was navy, which at night against a crowd of dark bodies was
 // simply not there -- a prop nobody can see is draw cost for nothing, and the whole point of
 // this figure is to be findable in two thousand people. Sand reads against both the night
 // and the red of the hoodie.
 bag: 0xe0d2b0, bagStrap: 0x3a2f24
});

const limb = (material, radius, len, geometryCache) => {
 const key = radius + ':' + len;
 const geometry = geometryCache.get(key) ?? geometryCache.set(key, new CapsuleGeometry(radius, len, 2, 6)).get(key);
 const pivot = new Group(), mesh = new Mesh(geometry, material);
 // Hung below its pivot, so rotating the pivot swings the limb from hip or shoulder.
 mesh.position.y = -len / 2 - radius;
 pivot.add(mesh);
 return pivot;
};

export function createPlayerFigure() {
 const H = FIGURE.height;
 const materials = {
  shirt: new MeshStandardMaterial({color: FIGURE.shirt, roughness: .85}),
  trousers: new MeshStandardMaterial({color: FIGURE.trousers, roughness: .9}),
  skin: new MeshStandardMaterial({color: FIGURE.skin, roughness: .7}),
  hair: new MeshStandardMaterial({color: FIGURE.hair, roughness: .8})
 };
 const geometries = new Map(), owned = [];
 const root = new Group(); root.name = 'player-figure';

 const torso = new Mesh(new CapsuleGeometry(H * .15, H * .3, 2, 7), materials.shirt);
 torso.position.y = H * .63; owned.push(torso.geometry); root.add(torso);
 const head = new Mesh(new SphereGeometry(H * .085, 12, 9), materials.skin);
 head.position.y = H * .9; owned.push(head.geometry); root.add(head);
 const hair = new Mesh(new SphereGeometry(H * .092, 12, 7, 0, Math.PI * 2, 0, Math.PI * .62), materials.hair);
 hair.position.y = H * .905; owned.push(hair.geometry); root.add(hair);

 // A shoulder bag, hung on the torso so it rides the lean and the bob without needing to be
 // posed. Two boxes: the bag itself on one hip and the strap across the chest.
 materials.bag = new MeshStandardMaterial({color: FIGURE.bag, roughness: .95});
 materials.strap = new MeshStandardMaterial({color: FIGURE.bagStrap, roughness: .95});
 const bag = new Mesh(new BoxGeometry(H * .16, H * .2, H * .08), materials.bag);
 // Tucked behind and below the hip rather than out at the shoulder line: at the arm's own
 // offset the two interpenetrate every stride.
 bag.position.set(H * .135, H * .52, -H * .085); bag.rotation.z = -.1;
 owned.push(bag.geometry); root.add(bag);
 const strap = new Mesh(new BoxGeometry(H * .035, H * .3, H * .025), materials.strap);
 strap.position.set(H * .05, H * .72, H * .05); strap.rotation.z = -.5;
 owned.push(strap.geometry); root.add(strap);

 const legs = [], arms = [];
 for (const side of [-1, 1]) {
  const leg = limb(materials.trousers, H * .05, H * .38, geometries);
  leg.position.set(side * H * .07, H * .49, 0); root.add(leg); legs.push(leg);
  const arm = limb(materials.shirt, H * .042, H * .32, geometries);
  arm.position.set(side * H * .155, H * .76, 0); root.add(arm); arms.push(arm);
 }
 for (const g of geometries.values()) owned.push(g);

 let phase = 0, disposed = false;
 return {
  root,
  /** Advance the gait by distance covered, and pose the figure at the player. */
  update(state, dt = 0) {
   root.visible = true;
   phase += state.speed * dt * (Math.PI * 2 / FIGURE.cycle);
   const amplitude = Math.min(FIGURE.swingMax, state.speed * FIGURE.swing);
   const swing = Math.sin(phase) * amplitude;
   legs[0].rotation.x = swing; legs[1].rotation.x = -swing;
   // Arms lead with the opposite leg, and swing a little less than the legs do.
   arms[0].rotation.x = -swing * .72; arms[1].rotation.x = swing * .72;
   root.position.set(state.x, state.y + Math.abs(Math.cos(phase)) * FIGURE.bob * amplitude, state.z);
   root.rotation.y = state.heading;
   root.rotation.x = Math.min(FIGURE.lean, state.speed * .012);
  },
  hide() {root.visible = false;},
  dispose() {
   if (disposed) return; disposed = true;
   root.removeFromParent();
   for (const g of owned) g.dispose();
   for (const m of Object.values(materials)) m.dispose();
  }
 };
}
