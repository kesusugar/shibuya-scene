// PLAN-POLICE-VOICE-KAZE-DETAIL Step K1: Kaze FR's proportions, body sections, and wheel arches.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVehicleShape, SILHOUETTE_TABLES, wheelRadius} from '../src/traffic/vehicle-shape.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';

const within = (actual, target, pct = .03) => Math.abs(actual - target) <= target * pct;

test('Kaze FR\'s proportions are within 3% of the plan\'s numbers',()=>{
 const d = VEHICLES.ownCar;
 assert.ok(within(d.length, 4.30), `length ${d.length}`);
 assert.ok(within(d.width, 1.76), `width ${d.width}`);
 assert.ok(within(d.height, 1.23), `height ${d.height}`);
 const shape = buildVehicleShape('ownCar');
 assert.ok(within(shape.dimensions.wheelbase, 2.43), `wheelbase ${shape.dimensions.wheelbase}`);
 assert.ok(within(wheelRadius('ownCar') * 2, .66), `wheel diameter ${wheelRadius('ownCar') * 2}`);
});

test('the body has at least 15 authored stations',()=>{
 assert.ok(SILHOUETTE_TABLES.fastback.belt.length >= 15, SILHOUETTE_TABLES.fastback.belt.length);
});

test('the fender peaks stand higher than the bonnet valley between them, at the front axle',()=>{
 const shape = buildVehicleShape('ownCar', {detail: 1});
 const pos = shape.geometry.paint.attributes.position;
 const axleZ = VEHICLES.ownCar.length * SILHOUETTE_TABLES.fastback.axle;
 let centreY = -Infinity, edgeY = -Infinity, found = 0;
 for (let i = 0; i < pos.count; i++) {
  const z = pos.getZ(i), x = pos.getX(i), y = pos.getY(i);
  if (Math.abs(z - axleZ) > .09) continue;
  found++;
  if (Math.abs(x) < .05) centreY = Math.max(centreY, y);
  else if (Math.abs(x) > VEHICLES.ownCar.width * .35) edgeY = Math.max(edgeY, y);
 }
 assert.ok(found > 0, 'no vertices found near the front axle');
 assert.ok(centreY > -Infinity && edgeY > -Infinity, 'centre or fender edge not sampled');
 assert.ok(edgeY > centreY, `fender ${edgeY.toFixed(3)} should stand above the valley ${centreY.toFixed(3)}`);
});

test('other silhouettes keep their flat bonnet -- the valley is opt-in, not a global change',()=>{
 assert.equal(SILHOUETTE_TABLES.sedan.fenderPeak, undefined);
 const shape = buildVehicleShape('sedan', {detail: 1});
 const pos = shape.geometry.paint.attributes.position;
 let centreY = null, edgeY = -Infinity;
 for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
  if (Math.abs(z) > .07) continue;               // near the sedan's own belt midpoint
  if (Math.abs(x) < .01) centreY = y;
  else if (Math.abs(x) > VEHICLES.sedan.width * .35) edgeY = Math.max(edgeY, y);
 }
 assert.ok(centreY !== null && edgeY > -Infinity, 'centre or edge not sampled');
 assert.ok(Math.abs(edgeY - centreY) < .01, `sedan's bonnet is not flat: centre ${centreY} edge ${edgeY}`);
});

test('the arch cut-out exposes at least 60% of the front wheel\'s height, seen from the side',()=>{
 const shape = buildVehicleShape('ownCar', {detail: 1});
 const pos = shape.geometry.paint.attributes.position;
 const axleZ = VEHICLES.ownCar.length * SILHOUETTE_TABLES.fastback.axle;
 const radius = wheelRadius('ownCar');
 // The floor and its rounded corner sit at the same low height across the whole car and are not
 // the arch opening -- exclude them by height, not by x, since the floor and sill widths are
 // close enough in this profile that an x-only filter catches both.
 const floorY = VEHICLES.ownCar.height * SILHOUETTE_TABLES.fastback.floor;
 const round = Math.min(.09, VEHICLES.ownCar.width * .055);
 let sillY = Infinity, found = 0;
 for (let i = 0; i < pos.count; i++) {
  const z = pos.getZ(i), x = Math.abs(pos.getX(i)), y = pos.getY(i);
  if (Math.abs(z - axleZ) > .09 || x < VEHICLES.ownCar.width * .36) continue;
  if (y < floorY + round + .01) continue;
  found++; sillY = Math.min(sillY, y);
 }
 assert.ok(found > 0, 'no outer-flank vertices found near the front axle');
 const exposed = sillY / (radius * 2);
 assert.ok(exposed >= .6, `only ${(exposed * 100).toFixed(1)}% of the wheel is exposed (sill ${sillY.toFixed(3)})`);
});

test('the front wheels sit at the new, shorter wheelbase, flush with the arches',()=>{
 const shape = buildVehicleShape('ownCar');
 const [, , frontZ] = shape.anchors.frontLeftWheel;
 assert.ok(within(frontZ, VEHICLES.ownCar.length * SILHOUETTE_TABLES.fastback.axle, .01));
});
