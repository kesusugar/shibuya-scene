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

/**
 * The katana's cut (PLAN-WEAPONS W1, R6). MEASURED like the punches, by
 * `node qa/gta-upgrade/sword-timing.mjs`: the blade tip placed where the game holds it and
 * followed through Sword_Attack. The window is the first fast pass of the tip in front of the
 * body; `sweep` is the tip's bearing through it (radians in the body frame, + is the body's left),
 * sampled, because the cut is fast at the start and slows into the follow-through. It is a
 * diagonal cut from high on the right (the tip over 2 m up) down to the left knee (0.4 m).
 *
 * Kept apart from ATTACKS: those alternate as the fists' one-two.
 */
export const SWORD=Object.freeze({name:'SwordAttack',hand:'right',duration:1.533,windup:0.383,activeEnd:0.473,peak:0.447,
 sweepFrom:-1.211,sweepTo:0.761,tipReach:1.593,
 sweep:Object.freeze([[0.383,-1.211],[0.396,-0.649],[0.409,-0.359],[0.422,-0.172],[0.434,0.034],[0.447,0.286],[0.46,0.542],[0.473,0.761]]),
 tipHeight:Object.freeze([0.39,2.04])});

/** The katana tip's bearing (body frame) `t` seconds into a cut at normal speed, clamped to the window. */
export function swordBearing(t){
 const s=SWORD.sweep;
 if(t<=s[0][0])return s[0][1];
 for(let i=1;i<s.length;i++)if(t<=s[i][0]){const [t0,a0]=s[i-1],[t1,a1]=s[i];return a0+(a1-a0)*(t-t0)/(t1-t0);}
 return s[s.length-1][1];
}
