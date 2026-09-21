import {spawn} from 'node:child_process';

// Maintained contracts for the current integrated scene. Historical S0-S15
// stage-lock tests remain available through `npm run test:legacy`.
const files=[
 'tests/player-experience.test.mjs',
 'tests/vehicle-dynamics.test.mjs',
 'tests/vehicle-shape.test.mjs',
 'tests/vehicle-contact.test.mjs',
 'tests/deferred-vehicle-visual.test.mjs',
 'tests/character-animation.test.mjs',
 'tests/character-asset.test.mjs',
 'tests/locomotion.test.mjs',
 'tests/hybrid-clip.test.mjs',
 'tests/near-characters.test.mjs',
 'tests/pedestrian-threat.test.mjs',
 'tests/launch-config.test.mjs',
 'tests/asphalt-material.test.mjs',
 'tests/build-runner.test.mjs',
 'tests/build-scheduling.test.mjs',
 'tests/cafe-frontage.test.mjs',
 'tests/core-readability.test.mjs',
 'tests/headlight-glows.test.mjs',
 'tests/high-graphics.test.mjs',
 'tests/lightboxes.test.mjs',
 'tests/network-startup.test.mjs',
 'tests/performance-da.test.mjs',
 'tests/qa-capture.test.mjs',
 'tests/frame-samples.test.mjs',
 'tests/qfront-glass.test.mjs',
 'tests/qfront-interior.test.mjs',
 'tests/r1-crowd-density.test.mjs',
 'tests/crowd-voices.test.mjs',
 'tests/crowd-shadows.test.mjs',
 'tests/real-brands.test.mjs',
 'tests/reference-ads.test.mjs',
 'tests/static-key.test.mjs',
 'tests/reference-art.test.mjs',
 'tests/sign-overlap.test.mjs',
 'tests/rendered-html.test.mjs',
 'tests/retail-frontage.test.mjs',
 'tests/road-spill.test.mjs',
 'tests/shader-errors.test.mjs',
 'tests/sign-exposure.test.mjs',
 'tests/sign-palette-variety.test.mjs',
 'tests/signal-clearance-cycle.test.mjs',
 'tests/solar.test.mjs',
 'tests/startup-timing.test.mjs',
 'tests/static-context.test.mjs',
 'tests/static-mobility.test.mjs',
 'tests/static-models.test.mjs',
 'tests/ui-commercial-mobility.test.mjs',
 'tests/ui-components.test.mjs',
 'tests/s16-1-polish.test.mjs',
 'tests/s16-3-fidelity.test.mjs',
 'tests/s16-4-calibration.test.mjs',
 'tests/s16-visual.test.mjs',
];

const child=spawn(process.execPath,['--test','--test-concurrency=4',...files],{stdio:'inherit'});
const exitCode=await new Promise(resolve=>{
 child.once('error',error=>{console.error(error);resolve(1);});
 child.once('exit',(code,signal)=>{
  if(signal)console.error(`Current test suite terminated by ${signal}.`);
  resolve(signal?1:code??1);
 });
});
process.exitCode=exitCode;
