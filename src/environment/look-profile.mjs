// GTA-style look (the owner's brief, 2026-10-10): what makes Los Santos read as Los Santos is
// mostly light and colour, not polygons -- a sun low enough to model the city with long shadows,
// shadows that stay dark, a time-of-day colour grade (warm highlights, cool shadows, more
// saturation and contrast), haze that builds with distance, and a sky with clouds in it. This is
// that "timecycle", per solar phase, blended with the phases like everything else in SolarCycle.
//
// `classic` is the calibration before it (the SOLAR_PHASES values and no grade), kept for A/B:
// ?look=classic, or LOOK.mode='classic' then SolarCycle.select(phase,false).
//
// Grade fields (the pipeline's grade pass applies them in linear HDR, before tone mapping):
//   wb        RGB white balance, applied first (the warm cast of a GTA day), [1,1,1] = unchanged
//   sat       saturation, 1 = unchanged
//   contrast  slope in log2 exposure around mid-grey (0.18), 1 = unchanged
//   shadow    RGB multiplier for the darks;  highlight: for the lights (split toning)
//   vignette  darkening at the corners, 0..1
// Other fields: fog (FogExp2 density), clouds (0..1 cover in the sky shader), env (multiplier on
// the sky's image-based light: less of it keeps shadows from going blue, 1 = unchanged).

export const LOOK = {mode: 'gta'};

const NEUTRAL = Object.freeze({wb: [1, 1, 1], sat: 1, contrast: 1, shadow: [1, 1, 1], highlight: [1, 1, 1], vignette: 0});
export const NEUTRAL_GRADE = NEUTRAL;

/** Overrides of SOLAR_PHASES for the GTA look, and the grade, fog and clouds of each phase. */
export const GTA_PHASES = Object.freeze({
 dawn: {angle: .32, key: 1.35, fill: .20, exposure: .80, horizon: 0xffbe8c, sun: 0xffc58e,
  fog: .0016, clouds: .45, env: .6,
  grade: {wb: [1.08, 1.0, .88], sat: 1.10, contrast: 1.10, shadow: [.97, .97, 1.03], highlight: [1.06, 1.0, .92], vignette: .20}},
 day: {angle: .82, key: 2.05, fill: .24, exposure: .76, sky: 0x5c90cc, horizon: 0xd4d3cb, sun: 0xfff0d8,
  fog: .00115, clouds: .38, env: .5,
  grade: {wb: [1.07, 1.0, .87], sat: 1.14, contrast: 1.12, shadow: [.99, .99, 1.01], highlight: [1.05, 1.01, .94], vignette: .18}},
 dusk: {angle: 2.92, key: 1.05, fill: .18, exposure: .82, horizon: 0xff9a5c, sun: 0xff8f4f,
  fog: .0015, clouds: .5, env: .6,
  grade: {wb: [1.10, .99, .86], sat: 1.18, contrast: 1.15, shadow: [.95, .95, 1.05], highlight: [1.08, .98, .88], vignette: .22}},
 night: {fog: .0012, clouds: .2,
  grade: {sat: 1.0, contrast: 1.04, shadow: [.96, .98, 1.04], highlight: [1.02, 1.0, .97], vignette: .10}}
});

/** The phase table SolarCycle uses: `base` (SOLAR_PHASES) with the GTA overrides, or as it was. */
export function phasesFor(base, mode = LOOK.mode) {
 const out = {};
 for (const [k, v] of Object.entries(base)) {
  const extra = mode === 'classic' ? null : GTA_PHASES[k];
  out[k] = {fog: k === 'night' ? .0012 : .0007, clouds: 0, ...v, ...(extra ?? {}), grade: {...NEUTRAL, ...(extra?.grade ?? {})}};
 }
 return out;
}
