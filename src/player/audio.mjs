// The car you can hear.
//
// Every sound here is synthesised. Nothing is downloaded and no sample is shipped: the
// engine is two detuned oscillators through a lowpass, and an impact is a short burst of
// filtered noise. That keeps the repository free of third-party audio whose licensing would
// have to be cleared, and it costs a few hundred bytes instead of a few hundred kilobytes,
// which matters because startup time is the thing this project guards most closely.
//
// Browsers refuse to start an AudioContext that no gesture asked for. Entering player mode
// is a click, so `resume` is called from there; if it is refused the whole module goes quiet
// and the game is otherwise unaffected. Audio is never allowed to break driving.

export const AUDIO = Object.freeze({
 idleHz: 46,            // engine note at rest
 revHz: 132,            // ...and at full speed, roughly a third above two octaves up
 detune: 7,             // cents between the two oscillators, which is what stops it whining
 engineGain: .05,       // quiet: this plays under a city, not over it
 cutoffLow: 320, cutoffHigh: 2400,
 impactGain: .28, impactMs: 220,
 strikeGain: .16, strikeMs: 140,
 rampMs: 60             // parameter smoothing, so speed changes glide instead of stepping
});

export function createPlayerAudio() {
 let ctx = null, engine = null, failed = false;

 /** Build the graph on first use, inside a gesture. Any refusal disables audio for good. */
 const ensure = () => {
  if (ctx || failed) return ctx;
  try {
   const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
   if (!Ctor) {failed = true; return null;}
   ctx = new Ctor();
   const gain = ctx.createGain(); gain.gain.value = 0;
   const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
   filter.frequency.value = AUDIO.cutoffLow;
   const a = ctx.createOscillator(), b = ctx.createOscillator();
   a.type = 'sawtooth'; b.type = 'sawtooth'; b.detune.value = AUDIO.detune;
   a.frequency.value = AUDIO.idleHz; b.frequency.value = AUDIO.idleHz;
   a.connect(filter); b.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
   a.start(); b.start();
   engine = {gain, filter, a, b};
  } catch {failed = true; ctx = null;}
  return ctx;
 };

 /** One burst of filtered noise, used for both a collision and a body going over a wing. */
 const burst = (level, ms, cutoff) => {
  if (!ctx || !engine) return;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * ms / 1000));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // White noise under a decaying envelope: a thud is an attack and a tail, nothing more.
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  const src = ctx.createBufferSource(); src.buffer = buffer;
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff;
  const gain = ctx.createGain(); gain.gain.value = level;
  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start();
  src.onended = () => {try {src.disconnect(); filter.disconnect(); gain.disconnect();} catch {}};
 };

 return {
  get available() {return !!ctx && !failed;},
  /** The shared context, so the crowd's voices play through the graph this one unlocked. */
  get context() {return ctx;},
  /** Called from the click that enters player mode, which is the gesture browsers want. */
  resume() {ensure(); ctx?.resume?.().catch(() => {}); return !!ctx;},
  /**
   * Track the car. `load` is throttle, so a car labouring up to speed sounds different from
   * one coasting at the same speed, which is most of what makes an engine readable.
   */
  engine(speed, topSpeed, load = 0) {
   if (!ctx || !engine) return;
   const t = Math.min(1, Math.abs(speed) / Math.max(1, topSpeed));
   const hz = AUDIO.idleHz + (AUDIO.revHz - AUDIO.idleHz) * t;
   const when = ctx.currentTime, ramp = AUDIO.rampMs / 1000;
   engine.a.frequency.setTargetAtTime(hz, when, ramp);
   engine.b.frequency.setTargetAtTime(hz, when, ramp);
   engine.filter.frequency.setTargetAtTime(
    AUDIO.cutoffLow + (AUDIO.cutoffHigh - AUDIO.cutoffLow) * Math.min(1, t + load * .35), when, ramp);
   engine.gain.gain.setTargetAtTime(AUDIO.engineGain * (.45 + .55 * t), when, ramp);
  },
  /** Cut the engine without tearing down the graph, so getting back in is instant. */
  silence() {if (ctx && engine) engine.gain.gain.setTargetAtTime(0, ctx.currentTime, .05);},
  /** A collision. Loudness follows the speed that was lost. */
  impact(speed, topSpeed) {
   const t = Math.min(1, Math.abs(speed) / Math.max(1, topSpeed));
   if (t > .05) burst(AUDIO.impactGain * t, AUDIO.impactMs, 900);
  },
  /** Somebody going over the wing. Softer and shorter than hitting a wall. */
  strike() {burst(AUDIO.strikeGain, AUDIO.strikeMs, 1500);},
  dispose() {
   try {engine?.a.stop(); engine?.b.stop(); ctx?.close?.();} catch {}
   ctx = null; engine = null;
  }
 };
}
