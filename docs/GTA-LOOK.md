# GTA look

The owner's brief (2026-10-10): bring the scene closer to how GTA V looks, with full freedom on the
approach. This note covers what was changed, why, and what is still open. Rockstar's game and
the fan ports of it (muguet, playgta5) are copyrighted: nothing is copied from them, neither code nor
assets. Only the general techniques of real-time cities are used here.

## What makes the GTA look

A city reads as GTA V mostly because of its light and colour, not because of its polygon count:

1. A **sun low enough to model the city**. Long shadows across the street, faces lit from the side,
   and shadows that stay dark instead of filling up with sky light.
2. A **time-of-day colour grade** (Rockstar calls it a "timecycle"):
   - a warm white balance by day;
   - more saturation and contrast;
   - warm highlights and slightly cool shadows;
   - a vignette.
3. **Haze** that builds with distance and takes the colour of the horizon. It is warm and dusty
   by day, orange at dusk.
4. A **sky with clouds** in it, not a flat gradient.
5. **Material detail**: grime, stains, decals and worn edges on every surface. This is Look 3,
   still open.
6. **People with textured clothes and faces**. This is Look 2, still open.

## Look 1: the timecycle (light and colour, code only)

### Where it lives

`src/environment/look-profile.mjs` holds a profile for each solar phase. `SolarCycle`
(`src/environment/solar.mjs`) blends between the phases.

| Field | What it does |
| --- | --- |
| `angle`, `key`, `fill`, `exposure`, `sky`, `horizon`, `sun` | Override the classic `SOLAR_PHASES` values. |
| `fog` | FogExp2 density. Its colour is the horizon colour. |
| `clouds` | Cumulus cover from 0 to 1, drawn as fbm noise in the sky shader. |
| `env` | Multiplier on the sky's image-based light. Less of it keeps the shadows from going blue. |
| `grade` | Applied by the HIGH pipeline's grade pass in linear HDR, before ACES. Its parts: `wb` (white balance), `sat`, `contrast` (log-exposure slope around 0.18), `shadow`/`highlight` (split toning) and `vignette`. |

Night keeps its lighting, exposure and emission exactly as they were. Only the haze, a few clouds
and a very mild grade are added. All neon and sign lighting stays as tuned.

### A/B

- `?look=classic` loads the calibration from before this work.
- From the QA hooks: `__SHIBUYA_QA__.look('classic'|'gta')` switches the look live, and
  `__SHIBUYA_QA__.phase(p)` jumps to a phase.

`qa/gta-upgrade/look-stills.mjs` captures classic/gta pairs of the same moment. It covers the
overview, street, QFRONT and player views at day, dusk and night. Tuning runs can be narrowed
with:

- `ONLY=day-street,...`
- `MODES=gta`
- `PHASES=day`
- `PLAYER=0`

The stills are in `evidence/look/stills/`.

### Tuning notes

- **First pass.** The grade alone made the day look bluer, not warmer. With the sun lower, more
  of the street is in shadow. In shadow, the only light is the blue sky probe, and the cool
  shadow split-tone pushed the asphalt to navy.
- **Fix.** A warm white balance (`wb`), half the sky's image-based light by day (`env: .5`),
  a warmer day haze (`horizon 0xd4d3cb`), a slightly stronger fill, and a near-neutral shadow
  tone.
- **Result.** The asphalt now reads as dark neutral asphalt. The signs carry the colour, and the
  horizon is warm and hazy.

### Cost

- The grade is a few ALU operations inside the grade pass, which already ran.
- The clouds are five octaves of value noise on the sky dome, about 1 px of shading per sky
  pixel.
- No extra pass, texture or draw call.

## Next

- **Look 2: people.** The mass crowd has no UVs and no spare vertex attribute (WebGL's 16 are
  used). The plan is detail projected in bind-pose space: front and side orthographic bakes of a
  textured CC0 body (folds, seams, pockets, face), sampled by the bind-pose position the crowd
  shader already has. It is luminance only, so every citizen keeps their own palette. CC0 body
  and skin sources: the MakeHuman system assets and skins (CC0, through MPFB2 in Blender 4.2).
- **Look 3: grime, decals and material detail.** It also includes a Blender pilot building.
  Brand signs stay as they are.
