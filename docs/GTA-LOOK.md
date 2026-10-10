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

## Look 2: people (MakeHuman CC0 citizens)

The owner's feedback was that everyone in the crowd had the same uniformly muscular build. The
cause was that the whole crowd was two Quaternius "superhero" bodies recoloured.

### What changed

The crowd and the near pool are now drawn with **ten citizens**:

- men and women;
- from about 20 to about 70 years old;
- thin, average and heavy;
- in suits, shirts and jeans, T-shirts, jackets and blouses with skirts.

Each has its own textured skin, face, clothes, shoes and hair, all from the MakeHuman CC0
assets. `?people=classic` brings back the RUN 6.8 bodies.

| id | build | outfit |
| --- | --- | --- |
| salaryman | 35, average | dark suit |
| salaryman-50 | 50s, heavy | dark suit |
| student-m | about 20, thin | T-shirt, jeans |
| jacket-m | 30, broad | jacket, jeans |
| elder-m | about 70 | check shirt |
| office-f | 30, slim | blouse, skirt |
| student-f | about 20, thin | shirt, jeans, long hair |
| casual-f | 40s, heavy | jacket, jeans |
| sport-f | 25, athletic | T-shirt, jeans, ponytail |
| elder-f | about 70 | blouse, skirt |

### Pipeline

1. **Build in Blender.** `scripts/blender/build-citizens.py`, with `scripts/blender/citizens.json`,
   runs in Blender 4.2 with the MPFB 2 extension (GPL; it is used as a tool only) and the
   MakeHuman system assets pack (CC0).
   - **Make each citizen.** For each citizen it creates the human from macros (gender, age,
     weight, muscle, height, proportions, race), with skin, clothes, shoes, hair, brows, lashes and
     eyes. MPFB's `game_engine` rig is added. Its bone names are the crowd's UE-style names.
   - **Fit to the crowd's skeleton.** The rig's chain is connected joint to joint in its rest pose,
     which moves no vertex. Each bone is then posed with COPY_LOCATION plus STRETCH_TO onto the
     matching joint of the crowd's Quaternius skeleton (`citizen.glb`, male rig). It aims at the
     Quaternius joint of its chain child, because glTF bones have no tails. The pose is baked into
     the meshes, which are then skinned to the Quaternius armature with MPFB's own weights.
   - **Result.** Every existing clip, the crowd's bone atlas, foot IK and the hit reactions drive
     the citizens unchanged. Build stays in the mesh; height is the crowd's per-person scale.
   - **Texture atlas.** Diffuse textures are packed into one 1024² atlas per citizen, with clothes
     multiplied by their AO maps so the folds survive.
   - **Regions.** Every vertex gets a region: skin, top, bottom, hair, shoe, or keep (eyes, brows,
     lashes). Trousers and skirts are decided per piece of cloth, by which bones carry it.
   - **Tint mask.** In the atlas alpha, the texels near each region's dominant colour are marked
     for recolouring. A suit changes colour; its collar and tie do not.
2. **Bake for the crowd.** `node scripts/bake-crowd-citizens.mjs <buildDir>` writes
   `public/data/crowd/citizens.json` and `.bin` and `citizens/<id>.webp`.
   - The layout is the same as `hq-crowd`, with the same bone atlas and clips.
   - Each citizen has one vertex buffer and four meshoptimizer index lists:
     - L0: 16k triangles;
     - L1: 5.2k;
     - L2: 1.9k;
     - L3: about 650.
   - The UV seams and region borders are protected.
   - Atlas u, v and region ride in `crowdUV`, a 16-bit vec4 in the slot of the old colour mask.
     The crowd shader is at WebGL's 16 attributes, so nothing is added.

### Shading (`CITIZEN_FRAGMENT`, `src/life/hq-crowd.mjs`)

- **Recolour per region.** Each region is texel × palette ÷ the region's dominant colour, so
  folds, seams and faces survive. Only masked texels are recoloured.
- **Cut-outs.** Hair, brows and lashes are alpha cut-outs.
- **Patterns.** The procedural garment patterns of the untextured crowd are not drawn over the
  textures.
- **Palette per citizen.** Each citizen can narrow the palette:
  - salarymen wear dark suits;
  - East Asian faces take the lighter skin tones;
  - older people have grey hair.
- **Near pool.** The near pool (`src/player/character-asset.mjs`) builds the same citizen from the
  pack's L0 mesh. It is a SkinnedMesh on a clone of the male rig, with the same fragment code,
  so a person handed between the crowd and the near pool looks the same.

### A bug the first stills showed

The crowd's head turn (RUN 12.4) weights vertices by bind-pose height. The citizens are bound in
a T-pose whose sleeves reach neck height, so a citizen looking at the player turned its arms about
the neck. Live, that showed as long spikes over the crowd. For the citizens, the head weight is
now the skinning's own: all of the head bone and half of the neck.

### Cost

- **Triangles.** L0 is 16k triangles against the old body's 13.9k, and only the nearest 48 are
  drawn at L0. L1 to L3 match the old budgets.
- **Draw calls.** Ten archetypes × four levels is 40 lanes against 16, so up to 24 more draw calls.
  Each draws only its visible slots.
- **Download.** The pack is 9 MiB plus ten atlases of 170–320 KB each.

## Next

- **Look 2, next.**
  - More citizens: kids, tourists, uniforms and hats.
  - The player as a citizen.
  - A normal-map atlas for the near pool.
- **Look 3: grime, decals and material detail.** It also includes a Blender pilot building.
  Brand signs stay as they are.
