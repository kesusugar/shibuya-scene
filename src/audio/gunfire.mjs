// Gunfire you can hear (PLAN-WEAPONS R13). The shot itself is a recorded CC0 clip from the sound
// bank (assets/audio/upstream.lock.json names each source, its page, its licence and its SHA-256);
// what the street does to it is synthesised here: a slapback off the facades either side, timed
// from how far away they actually are, low-passed and quieter each time, so a shot on a narrow
// Center-gai street rings and one in the open Scramble does not.
//
// Until the bank has decoded (or if it never does) the shot falls back to a SYNTHESISED crack --
// filtered noise and a low thump. That fallback is TEMPORARY (仮) and is what plays only when the
// recordings are unavailable; it is not meant to sound real.
//
// The katana's clank on a wall is synthesised: three inharmonic partials of struck steel and a
// tick of noise. No recording was needed for it.

export const GUNFIRE = Object.freeze({
 speedOfSound: 343,
 echoReach: 45,           // m: facades further than this give no slapback worth hearing
 echoStep: 1,             // m between samples when looking for a facade
 echoGain: [.34, .2, .11],// the first reflection each side, then the two of them again
 echoLowpass: [2600, 1600, 1000],
 ricochetChance: .35,     // of a shot that hits a wall or a car
 fallbackGain: .5,        // the synthesised crack, relative to the bus
 clankGain: .28
});

/**
 * How far the nearest facade is to the left and right of a shot, along the line across the
 * shooter's facing. Pure. Returns [left, right] in metres, Infinity where there is none in reach.
 */
export function facadeDistances(solid, x, z, heading, reach = GUNFIRE.echoReach, step = GUNFIRE.echoStep) {
 const out = [];
 for (const side of [1, -1]) {
  const dx = Math.cos(heading) * side, dz = -Math.sin(heading) * side;
  let hit = Infinity;
  for (let d = step; d <= reach; d += step) if (solid(x + dx * d, z + dz * d)) {hit = d; break;}
  out.push(hit);
 }
 return out;
}

/**
 * The echo taps for a shot: [{delay, gain, lowpass, x, z}], one per side with a facade, and a
 * second, weaker bounce across the street. Pure, for the test.
 */
export function echoTaps(solid, x, z, heading) {
 const [left, right] = facadeDistances(solid, x, z, heading), taps = [];
 const add = (d, side, order) => {
  if (!Number.isFinite(d)) return;
  const delay = 2 * d / GUNFIRE.speedOfSound;
  taps.push({delay, gain: GUNFIRE.echoGain[order], lowpass: GUNFIRE.echoLowpass[order],
   x: x + Math.cos(heading) * side * d, z: z - Math.sin(heading) * side * d});
 };
 add(left, 1, 0); add(right, -1, 0);
 // Across and back: a street with both walls rings once more.
 if (Number.isFinite(left) && Number.isFinite(right)) {
  const d = left + right;
  taps.push({delay: 2 * d / GUNFIRE.speedOfSound, gain: GUNFIRE.echoGain[2], lowpass: GUNFIRE.echoLowpass[2], x, z});
 }
 return taps;
}

/**
 * @param {()=>any} getContext
 * @param {()=>any} getBank
 * @param {{solid?:(x:number,z:number)=>boolean}} [options]
 */
export function createGunfire(getContext, getBank, {solid = () => false} = {}) {
 const stats = {shots: 0, recorded: 0, synthesised: 0, echoes: 0, ricochets: 0, clanks: 0};
 let noise = null;
 const bus = () => getBank?.()?.bus ?? null;
 const noiseBuffer = ctx => {
  if (noise) return noise;
  const n = Math.floor(ctx.sampleRate * .35);
  noise = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noise.getChannelData(0); let s = 987654321;
  for (let i = 0; i < n; i++) {s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = (s / 2147483648 - 1) * Math.exp(-i / (ctx.sampleRate * .045));}
  return noise;
 };
 const placed = (ctx, x, y, z) => {
  const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
  p.refDistance = 4; p.maxDistance = 200; p.rolloffFactor = .9;
  if (p.positionX) {p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;} else p.setPosition?.(x, y, z);
  return p;
 };
 /** The TEMPORARY synthesised shot (仮): used only while no recording is available. */
 const synthShot = (ctx, x, y, z, when, gain) => {
  const out = bus(); if (!out) return false;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
  const g = ctx.createGain(); g.gain.value = GUNFIRE.fallbackGain * gain;
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(140, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + .12);
  const og = ctx.createGain(); og.gain.setValueAtTime(GUNFIRE.fallbackGain * gain, when); og.gain.exponentialRampToValueAtTime(.0005, when + .16);
  const pan = placed(ctx, x, y, z);
  src.connect(hp); hp.connect(g); g.connect(pan); osc.connect(og); og.connect(pan); pan.connect(out);
  src.start(when); osc.start(when); osc.stop(when + .2);
  src.onended = () => {try {src.disconnect(); hp.disconnect(); g.disconnect(); osc.disconnect(); og.disconnect(); pan.disconnect();} catch {}};
  return true;
 };

 return {
  get stats() {return {...stats};},
  /**
   * A shot at `x,y,z` from someone facing `heading`. `kind` is 'pistol' or 'revolver'; `hit` is
   * what the bullet struck ('wall', 'car', ...) and where, for a ricochet.
   */
  shot(x, y, z, heading, {kind = 'pistol', gain = 1, hit = null, roll = Math.random()} = {}) {
   const ctx = getContext?.(); const bank = getBank?.();
   if (!ctx || ctx.state !== 'running') return false;
   stats.shots++;
   const clip = kind === 'revolver' && bank?.has?.('gunshot-revolver') ? 'gunshot-revolver' : 'gunshot';
   const recorded = !!bank?.play?.(clip, {x, y, z, gain});
   if (recorded) stats.recorded++; else if (synthShot(ctx, x, y, z, ctx.currentTime, gain)) stats.synthesised++;
   for (const tap of echoTaps(solid, x, z, heading)) {
    const when = ctx.currentTime + tap.delay;
    const ok = recorded ? bank.play(clip, {x: tap.x, y: y + 2, z: tap.z, gain: gain * tap.gain, when, lowpass: tap.lowpass, rate: .97})
     : synthShot(ctx, tap.x, y + 2, tap.z, when, gain * tap.gain);
    if (ok) stats.echoes++;
   }
   if (hit && (hit.kind === 'wall' || hit.kind === 'car') && roll < GUNFIRE.ricochetChance) {
    if (bank?.play?.('ricochet', {x: hit.point.x, y: hit.point.y, z: hit.point.z, gain: .8, when: ctx.currentTime + .03})) stats.ricochets++;
   }
   return true;
  },
  /** Steel on a wall or a car: the katana's clank. Synthesised. */
  clank(x, y, z) {
   const ctx = getContext?.(), out = bus();
   if (!ctx || !out || ctx.state !== 'running') return false;
   const t = ctx.currentTime, pan = placed(ctx, x, y, z), g = ctx.createGain();
   g.gain.setValueAtTime(GUNFIRE.clankGain, t); g.gain.exponentialRampToValueAtTime(.0004, t + .35);
   const oscs = [1, 2.76, 5.4].map((k, i) => {const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1750 * k;
    const og = ctx.createGain(); og.gain.value = [.6, .3, .15][i]; o.connect(og); og.connect(g); o.start(t); o.stop(t + .36); return [o, og];});
   const tick = ctx.createBufferSource(); tick.buffer = noiseBuffer(ctx);
   const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
   const tg = ctx.createGain(); tg.gain.value = .35; tick.connect(hp); hp.connect(tg); tg.connect(g); tick.start(t); tick.stop(t + .03);
   g.connect(pan); pan.connect(out); stats.clanks++;
   oscs[0][0].onended = () => {try {for (const [o, og] of oscs) {o.disconnect(); og.disconnect();} tick.disconnect(); hp.disconnect(); tg.disconnect(); g.disconnect(); pan.disconnect();} catch {}};
   return true;
  }
 };
}
