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
 * followed through SwordAttack. The window is the first fast pass of the tip in front of the
 * body; `sweep` is the tip's bearing through it (radians in the body frame, + is the body's left),
 * sampled, because the cut accelerates through the middle.
 *
 * Since §9ah SwordAttack is the TWO-HANDED cut retargeted from CMU 02_07 (scripts/cmu/
 * weapon-clip.mjs, baked by convert-character.mjs): raised over the head, then a diagonal from
 * high on the left (the tip 2.25 m up) across to the right at knee height (0.69 m), the tip at
 * 17 m/s. The one-handed Quaternius cut it replaced ran the other way, right to left.
 *
 * Kept apart from ATTACKS: those alternate as the fists' one-two.
 */
export const SWORD=Object.freeze({name:'SwordAttack',hand:'right',duration:1.526,windup:0.674,activeEnd:0.89,peak:0.814,
 sweepFrom:1.362,sweepTo:-0.592,tipReach:1.424,
 sweep:Object.freeze([[0.674,1.362],[0.686,1.17],[0.699,1.013],[0.712,0.844],[0.725,0.723],[0.737,0.607],[0.75,0.495],[0.763,0.395],
  [0.775,0.29],[0.788,0.189],[0.801,0.087],[0.814,-0.02],[0.826,-0.132],[0.839,-0.231],[0.852,-0.328],[0.864,-0.425],[0.877,-0.511],[0.89,-0.592]]),
 tipHeight:Object.freeze([0.69,2.25])});

/** The katana tip's bearing (body frame) `t` seconds into a cut at normal speed, clamped to the window. */
export function swordBearing(t){
 const s=SWORD.sweep;
 if(t<=s[0][0])return s[0][1];
 for(let i=1;i<s.length;i++)if(t<=s[i][0]){const [t0,a0]=s[i-1],[t1,a1]=s[i];return a0+(a1-a0)*(t-t0)/(t1-t0);}
 return s[s.length-1][1];
}

/**
 * Katana B: the cut closes the distance (a motion warp). A person picked by the cut further off
 * than a sword's length is stepped to through the wind-up -- the body turns onto them first, then
 * travels -- so the blade arrives where they stand. The controller moves the body (it alone owns
 * position, walls and bodies included); this only says where to and when. `from`/`to` are clip
 * seconds at normal speed, inside the wind-up (the blade goes live at SWORD.windup 0.674 s); the
 * travel follows a smootherstep, so it starts and stops without a jolt. `standoff` is the
 * centre-to-centre distance it stops at: the tip (SWORD.tipReach 1.42 m) passes through the body.
 * Nobody nearer than that is stepped to, and nobody is stepped away from.
 */
export const WARP=Object.freeze({range:3.6,standoff:1.15,from:.08,to:.62});
/** Smootherstep of `u` clamped to [0, 1]. */
export const smootherstep=u=>{const x=Math.max(0,Math.min(1,u));return x*x*x*(x*(x*6-15)+10);};
/**
 * How far along its path the warp moves the body over one frame, as a fraction of what is left:
 * from clip time `t0` to `t1` of a swing played at `rate`. Pure. Taken of what is LEFT, so a
 * person who moves during the wind-up is still arrived at, and a still one exactly on the curve.
 */
export function warpFraction(t0,t1,rate=1,{from=WARP.from,to=WARP.to}={}){
 const span=(to-from)/rate,s0=smootherstep((t0-from/rate)/span),s1=smootherstep((t1-from/rate)/span);
 return s0>=1?0:Math.max(0,(s1-s0)/(1-s0));
}
