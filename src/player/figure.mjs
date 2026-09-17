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

import {BoxGeometry, CapsuleGeometry, CylinderGeometry, SphereGeometry, Group, Mesh, MeshStandardMaterial} from 'three';

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

 // Hips to shoulders, 46% to 80% of the height, which is where a person's are. The old torso
 // reached 93% and left no room for a head that was not buried in it. The width matters as
 // much as the span: a first pass kept the old radius over the new, shorter span and produced
 // a ball with arms floating off it.
 const torso = new Mesh(new CapsuleGeometry(H * .115, H * .11, 2, 7), materials.shirt);
 torso.position.y = H * .63; owned.push(torso.geometry); root.add(torso);
 // A head a little over life-size, carried on a neck, with its crown at the figure's full
 // height. At the old size its chin sat twenty centimetres inside the chest, which is what
 // made it a mushroom; at life-size it made a bowling pin. This is between the two, and
 // matches the crowd so the player looks like one of them rather than a visitor.
 const neck = new Mesh(new CylinderGeometry(H * .04, H * .045, H * .10, 8), materials.skin);
 neck.position.y = H * .80; owned.push(neck.geometry); root.add(neck);
 const head = new Mesh(new SphereGeometry(1, 12, 9), materials.skin);
 head.scale.set(H * .076, H * .088, H * .079);
 head.position.y = H * .912; owned.push(head.geometry); root.add(head);
 // Hair wraps the skull and leaves the face open, rather than capping the crown and leaving
 // the back of the head bare -- which is the view the follow camera spends its life on.
 const hair = new Mesh(new SphereGeometry(1, 14, 8, Math.PI / 2 + .52, Math.PI * 2 - 1.04, 0, Math.PI * .72), materials.hair);
 hair.scale.set(H * .079, H * .091, H * .082);
 hair.position.y = H * .912; owned.push(hair.geometry); root.add(hair);

 // A shoulder bag, hung on the torso so it rides the lean and the bob without needing to be
 // posed. Two boxes: the bag itself on one hip and the strap across the chest.
 materials.bag = new MeshStandardMaterial({color: FIGURE.bag, roughness: .95});
 materials.strap = new MeshStandardMaterial({color: FIGURE.bagStrap, roughness: .95});
 const bag = new Mesh(new BoxGeometry(H * .115, H * .15, H * .07), materials.bag);
 // Against the hip, overlapping the torso rather than hovering beside it. Sized down with
 // the torso: at the old dimensions it was a suitcase floating a hand's width off the body.
 bag.position.set(H * .088, H * .53, -H * .055); bag.rotation.z = -.1;
 owned.push(bag.geometry); root.add(bag);
 const strap = new Mesh(new BoxGeometry(H * .03, H * .24, H * .022), materials.strap);
 strap.position.set(H * .04, H * .655, H * .04); strap.rotation.z = -.5;
 owned.push(strap.geometry); root.add(strap);

 const legs = [], arms = [];
 for (const side of [-1, 1]) {
  const leg = limb(materials.trousers, H * .05, H * .38, geometries);
  leg.position.set(side * H * .062, H * .47, 0); root.add(leg); legs.push(leg);
  const arm = limb(materials.shirt, H * .042, H * .32, geometries);
  arm.position.set(side * H * .125, H * .755, 0); root.add(arm); arms.push(arm);
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
