/**
 * When each punch clip actually lands.
 *
 * RUN 8. These numbers are MEASURED, not chosen. `qa/gta-upgrade/punch-timing.mjs` samples the
 * clip at 120 steps, finds which hand travels furthest from the pelvis, and reads the window
 * where that hand is within 12% of full extension -- which is the part of the swing where a
 * fist would be touching someone. Picking a plausible-looking fraction of the duration instead
 * is how you get damage that lands before the arm moves, which is the bug this run exists to
 * fix.
 *
 * Punch is a LEFT jab and PunchCross is a RIGHT cross, so alternating them reads as a one-two
 * rather than the same arm twice. That is a property of the clips, not a decision.
 *
 * Re-measure rather than edit by hand:
 *   node qa/gta-upgrade/punch-timing.mjs
 */
export const ATTACKS=Object.freeze([
 Object.freeze({name:'Punch',      hand:'left',  duration:0.867, windup:0.188, activeEnd:0.368, peak:0.202}),
 Object.freeze({name:'PunchCross', hand:'right', duration:1.000, windup:0.233, activeEnd:0.508, peak:0.400})
]);

const BY_NAME=new Map(ATTACKS.map(a=>[a.name,a]));

/** The timing for a named attack, or the first one if the name is unknown. */
export function attackOf(name){return BY_NAME.get(name)??ATTACKS[0];}

/**
 * How far into the swing the fist is out, as a fraction of the clip.
 *
 * Only used for reporting and for the visual QA, which checks that the frame a body reacts on
 * is the frame the hand is extended.
 */
export const activeWindow=a=>({from:a.windup/a.duration,to:a.activeEnd/a.duration});
