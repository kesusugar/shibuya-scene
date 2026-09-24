// The patrol car's siren and lamps (PLAN-POLICE-AND-OWN-CAR W3). Synthesised, never recorded.
//
// The Japanese police electronic siren is a slow wail: about 1.6 s up and 1.6 s down between
// roughly 650 and 1,450 Hz, which is what separates it from a US wail (faster, wider) and from an
// ambulance's two-tone ピーポー (not used here). A faster yelp is used at junctions.
//
// Only the two nearest sirens sound; each is two oscillators (saw plus square) through a band-pass
// into an HRTF panner at the car, on the sound bank's own effects bus, so the bank's safety
// compressor and master level hold. The sweep rate follows a rough Doppler from the closing speed.

export const SIREN = Object.freeze({
 low: 650, high: 1450,      // Hz
 up: 1.6, down: 1.6,        // seconds, the wail
 yelpPeriod: .34,           // seconds, one full up-and-down of the yelp
 maxVoices: 2,
 range: 260,                // m; beyond this a siren is not started
 gain: .09,
 sound: 343,                // m/s
 flashHz: 2.4,              // the roof bar's two halves alternate this many times a second
 speechEvery: 8             // s between loudspeaker lines
});

/** Frequency at time `t` (s) in `mode` ('wail' | 'yelp'). A triangle sweep, eased at the ends. */
export function sirenHz(t, mode = 'wail') {
 const period = mode === 'yelp' ? SIREN.yelpPeriod : SIREN.up + SIREN.down;
 const upShare = mode === 'yelp' ? .5 : SIREN.up / period;
 const phase = ((t % period) + period) % period / period;
 const x = phase < upShare ? phase / upShare : 1 - (phase - upShare) / (1 - upShare);
 const eased = x * x * (3 - 2 * x);
 return SIREN.low + (SIREN.high - SIREN.low) * eased;
}

/** Pitch factor for a source closing on the listener at `closing` m/s (positive = approaching). */
export function doppler(closing) {
 const c = Math.max(-60, Math.min(60, closing || 0));
 return SIREN.sound / (SIREN.sound - c);
}

/** The sources that get a voice: the nearest `max` within range. */
export function nearestSirens(sources, listener, max = SIREN.maxVoices) {
 return sources
  .map(s => ({s, d: Math.hypot(s.x - listener.x, s.z - listener.z)}))
  .filter(e => e.d <= SIREN.range)
  .sort((a, b) => a.d - b.d)
  .slice(0, max)
  .map(e => e.s);
}

/** Which half of the roof bar is lit at time `t`: 0 or 1. */
export const flashPhase = t => Math.floor(t * SIREN.flashHz * 2) % 2;

/**
 * The voices. `getContext` returns the shared AudioContext (or null); `getBus` the node to feed
 * (the bank's effects bus). Nothing is built until a siren first sounds, and a missing context is
 * silence, never an error.
 */
export function createSirens(getContext, getBus) {
 let ctx = null, time = 0, disposed = false;
 const voices = [];
 const stats = {sounding: 0, started: 0};
 const build = () => {
  const bus = getBus?.();
  if (!ctx || !bus) return null;
  const a = ctx.createOscillator(), b = ctx.createOscillator();
  a.type = 'sawtooth'; b.type = 'square';
  const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 1.4; band.frequency.value = 1000;
  const mix = ctx.createGain(); mix.gain.value = .5;
  const gain = ctx.createGain(); gain.gain.value = 0;
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
  panner.refDistance = 8; panner.maxDistance = SIREN.range; panner.rolloffFactor = 1.1;
  a.connect(band); b.connect(mix); mix.connect(band); band.connect(gain); gain.connect(panner); panner.connect(bus);
  a.start(); b.start();
  stats.started++;
  return {a, b, band, gain, panner, source: null};
 };
 const place = (p, x, y, z) => {
  if (p.positionX) {p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;}
  else p.setPosition?.(x, y, z);
 };
 return {
  stats,
  /**
   * `sources`: [{id, x, z, vx, vz, mode}] of cars with the siren on; `listener`: {x, z, vx, vz}.
   */
  update(dt, sources, listener) {
   if (disposed) return;
   time += dt;
   const chosen = nearestSirens(sources, listener);
   if (chosen.length && !ctx) ctx = getContext?.() ?? null;
   if (!ctx || ctx.state === 'closed') {stats.sounding = 0; return;}
   while (voices.length < chosen.length) {const v = build(); if (!v) break; voices.push(v);}
   const now = ctx.currentTime;
   stats.sounding = 0;
   voices.forEach((v, i) => {
    const s = chosen[i];
    if (!s) {v.gain.gain.setTargetAtTime(0, now, .08); v.source = null; return;}
    const dx = listener.x - s.x, dz = listener.z - s.z, d = Math.hypot(dx, dz) || 1;
    const closing = ((s.vx ?? 0) - (listener.vx ?? 0)) * dx / d + ((s.vz ?? 0) - (listener.vz ?? 0)) * dz / d;
    const hz = sirenHz(time + i * .41, s.mode) * doppler(closing);
    v.a.frequency.setTargetAtTime(hz, now, .02); v.b.frequency.setTargetAtTime(hz * 1.004, now, .02);
    v.band.frequency.setTargetAtTime(hz, now, .02);
    v.gain.gain.setTargetAtTime(SIREN.gain, now, .08);
    place(v.panner, s.x, 1.6, s.z);
    v.source = s.id; stats.sounding++;
   });
  },
  dispose() {
   if (disposed) return; disposed = true;
   for (const v of voices) {try {v.a.stop(); v.b.stop(); v.panner.disconnect();} catch {}}
   voices.length = 0;
  }
 };
}

/**
 * The loudspeaker, through the browser's own speech in Japanese. At most one line every
 * `SIREN.speechEvery` seconds, and silent -- not an error -- when there is no speech engine or no
 * Japanese voice.
 */
export function createLoudspeaker(speech = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance) {
 let last = -Infinity;
 const voice = () => {
  try {return speech?.getVoices?.().find(v => /^ja(-|_|$)/i.test(v.lang)) ?? null;} catch {return null;}
 };
 return {
  /** Say `text` at time `t` if allowed; returns whether it spoke. */
  say(text, t) {
   if (t - last < SIREN.speechEvery) return false;
   const v = voice();
   if (!speech || !Utterance || !v) return false;
   try {
    const u = new Utterance(text); u.lang = 'ja-JP'; u.voice = v; u.rate = 1.05; u.volume = .8;
    speech.speak(u); last = t; return true;
   } catch {return false;}
  }
 };
}
