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

### Look 2b: own proportions and a natural stance

The owner's next feedback, the day after: "Gundam bodies", and everyone leaning forward while
waiting at the lights. Both were measured before anything was changed.

**Gundam bodies.** Every citizen had been stretched onto the crowd's Quaternius superhero
skeleton.

| Measure | Superhero skeleton | MakeHuman man | MakeHuman woman |
| --- | --- | --- | --- |
| Shoulders (upper-arm joints apart) | 42.4 cm | 36.8 cm | 30.5 cm |
| Arm (upper arm to hand) | 49.4 cm | 47.8 cm | 42.8 cm |

So men's shoulders were widened by about 15% and women's by about 39%.

**Leaning forward.** The Quaternius clips are a fighter's set.

| Clip | Forward lean | Knees | Pelvis | Arms out from the body |
| --- | --- | --- | --- | --- |
| Idle | 7–9° | 153–159° | 7 cm down | 20–23° |
| Walk | 11–12° | | | |
| Guard | 49° (a crouch) | | | |

Guard is played by anyone wary but standing. A person standing upright leans 0–3°, with knees
at about 175° and arms 5–8° out.

**What a big open-world game does instead** (general technique; no game code was used):

- Every pedestrian model shares one skeleton *topology* but has its own bone lengths.
- Animation is applied as rotations, so a body keeps its proportions.
- Movement and idle sets are chosen per kind of person (men, women, business, elderly).
- People waiting play varied idles.

**Changes:**

- **Own skeleton.** `build-citizens.py` (natural fit, now the default) poses MPFB's rig into the
  crowd skeleton's T-pose by rotation only. Every bone points the way the matching Quaternius bone
  points, at its own length. It then builds the citizen's own armature: the crowd skeleton's bones,
  names and rest orientations at this person's joints, and binds the mesh to it.
- **Clips as rotations.** `src/life/citizen-pose.mjs` hands the crowd's clips over as rotations
  only. The pelvis translation is the one kept, scaled by leg length. Because the rest orientations
  match, a rotation means the same thing on both skeletons.
- **Natural stance (`STANCE`).** These clips are resampled at 30 fps and corrected:

  | Clip | Lean target | Knee bend taken out | Arms in | Feet |
  | --- | --- | --- | --- | --- |
  | Idle | 1.5° | 80% | 13° | grounded every frame |
  | Walk | 4° | | 8° | grounded every frame |
  | Run | 14° | | 10° | one shift for the whole clip |
  | Startle | 6° | | 6° | grounded every frame |
  | Guard | 3° | 60% | 8° | grounded every frame (now a wary upright Idle, not a crouch) |

  - Only lean *beyond* the target is removed.
  - Arms come in within the frontal plane only, so the walk's swing is kept; women's arms come
    in a further 4°.
- **Bake.** `bake-crowd-citizens.mjs` bakes a bone atlas per citizen: the same rows and clips as
  hq-crowd, from these clips. It also stores each citizen's rest joints for the near pool, which
  builds the same skeleton and the same clips.

**Result** (enforced by `tests/citizens.test.mjs`):

- Idle lean is 1–2°, arms 4–5° out, knees about 170°, with the feet on the ground.
- Walk lean is about 4°.
- Every citizen's shoulders are narrower than 40 cm, and a woman's are narrower than a man's.

The pack is now 15 MiB, because each citizen carries its own bone atlas. Half-float atlases would
halve that.

### Look 2c: what people do while they wait, how they walk, and the player

The owner asked for idle variety while waiting, for walks by gender and age, and for the player
on the new pipeline. The leaked GTA V source was not used, and never will be: it is stolen
proprietary code. The motion comes from public, licensed motion capture.

**Source.** 100STYLE (Mason, Starke and Komura, 2022), released under CC BY 4.0 (see
`LICENSES/100style.txt` and `THIRD_PARTY_NOTICES.md`). It is one performer recording a hundred
styles of locomotion at 60 fps, each style with an idle and walks.

**What was taken:**

- **Idles:** Neutral, phone call (right and left), arms folded, hands in pockets, hands behind
  the back, akimbo, old, and restless.
- **Walks:** Neutral, Old, Rushed, Heavyset, OnPhone, HandsInPockets and WiggleHips.

**Retarget: `scripts/mocap/style-clips.mjs`.**

- **Rest correction.** It is the same rest-correction method as `scripts/cmu/retarget.mjs`.
  100STYLE's zero pose is a T-pose facing +Z, as the crowd skeleton's rest is, so each joint's
  world turn from rest is applied to the target's rest.
- **In place.** The heading (the hips' yaw, unwrapped and smoothed over one second) is turned
  back, and the horizontal travel is dropped.
- **Loops.** Each loop is the best-matching start and end inside the dataset's own cut, with the
  seam cross-faded. A walk is also held to the clip's cruising speed, so a loop cannot land on a
  turn, a start or a stop.
- **Feet.** The clip is grounded once, and every walk loop starts as the left foot is lowest
  (left contact at phase 0).
- **Blended walks.** Two walks are blends, phase-aligned:
  - `Walk.elder` is Neutral with 30% of Old (Old alone is a 0.24 m/s shuffle);
  - `Walk.female` is Neutral with 25% of WiggleHips.
- **Output.** `public/data/character/citizen-moves.json`: idles at 15 fps and walks at 30 fps,
  about 0.5 MB.

**On the citizens.** In `src/life/citizen-pose.mjs`:

- **Grounding.** The captured clips are grounded on each body's own legs. (Look 2d adds a spine
  correction under every clip; see below.)
- **Head level.** Walks whose performer looked at the floor have the head raised, judged by where
  the face points, to at most 6° down.
- **`Idle.text`.** This is the standing idle with both hands brought to a phone at the lower chest
  by two-bone IK every frame, so the sway stays, and the head down. 100STYLE's "on phone" is a call
  held to the ear; what a Shibuya crossing is full of is people looking down at a screen.
- **`Idle.folded`.** The elbows come forward a little, so folded forearms clear a broader chest.

**Per person (`src/life/appearance.mjs`).**

- **`MOVES`.** Each citizen kind has its idles, walks and hurried walk. A person keeps theirs for
  good, because they are a pure function of the id.
- **`CITIZENS_FOR_STYLE`.** The body matches the simulation's own kind of pedestrian:
  - an office worker is in a suit;
  - an elderly walker is an older person.
- **Per-citizen clip tables.** `bake-crowd-citizens.mjs` bakes each citizen's moves after the
  shared rows, into its own half-float bone atlas. The crowd (`hq-crowd`) then plays:
  - the person's idle where it would play Idle;
  - their walk where it would play Walk, at a cadence from the clip's own stride;
  - their hurried walk above 1.55 m/s, with hysteresis.
- **Timing.** Each person has their own phase and rate, so a queue at the lights is not a chorus
  line.

**Near pool and player.**

- **Near pool.** It walks each kind's usual walk, with a gait ladder built from that walk's stride
  and contact. Its idle is set per person (`figure.setMoves`). Look 2d sets the walk per person
  too.
- **Player.** Once the citizens pack is in, the player is rebuilt as the young man in a T-shirt
  and jeans, at 1.76 m, keeping the red top.
  - The T-shirt's printed MakeHuman logo is painted out at build time (spec `plain`).
  - The holster and scabbard spots move with the body's own hip and spine
    (`weapon-mesh.mjs`, `carryRef`).
  - `?people=classic` keeps the RUN 6.8 player.

### Look 2d: posture, hands, and the phone

The owner's feedback on the 2c lineups: 「姿勢がのけぞりすぎる、そんなに曲線だっけ？あと手も隠れすぎ」
(leaning back too much, is the spine that curved? and the hands are hidden too much).

**The cause of the lean, measured.** The crowd skeleton's rest spine is sway-backed: the lumbar
segment (pelvis to spine_02) is tipped 16° forward and the chest (spine_03 to the neck) 13° back.
Every clip, captured or not, is a turn from that rest, so every citizen inherited it: belly out,
chest back, the shoulders 7 cm behind the hips.

**The fix: `SPINE_REST` (`src/life/citizen-pose.mjs`).**

- Each spine bone's rest is turned, in the side plane only, so its segment leans as a person's
  does. In degrees forward of vertical:

  | Bone     | Target |
  |----------|-------:|
  | pelvis   | 2      |
  | spine_01 | 2      |
  | spine_02 | 3      |
  | spine_03 | 3      |
  | neck_01  | 6      |

- A clip's local rotation q becomes C_parent⁻¹ · q · C_bone, so each spine bone's world turn is
  the clip's own on the corrected rest.
- Bones hanging off the spine keep the world turn the clip gives them: the legs, the clavicles
  and the head. The first version let the arms turn with the chest, and a hanging arm swings
  back as the chest tips forward, so the hands went 13 cm behind the hips and the head dropped.
- Measured standing (Idle.stand) on all ten citizens:
  - shoulders 1–4 cm behind the hips, which was 7 cm;
  - the neck 2–4 cm ahead of the hips;
  - the hands 3 cm in front of the hips, which was 13 cm behind on the first try.

**Hands that show.**

- **`clearArms`.** Hanging or swinging arms are kept clear of the hip, sideways. The performer is
  slimmer than most citizens, so a hand that swung past his hip went into theirs, and a heavy
  man's or a woman's hips swallowed both hands.
  - `clearFor({female, weight})`: 11 cm out from the hip joint, plus 14 cm per unit of
    `macro.weight` above 0.4, plus 2.5 cm for a woman.
  - Only the side-to-side angle changes; the forward and back swing of a walk is untouched.
  - Not applied to poses that put the hands somewhere on purpose: pockets, behind the back,
    folded, akimbo, a phone.
- **Fewer hidden hands.** `MOVES` was rebalanced. Pockets, hands behind the back and arms folded
  are now about one person in eight (12.4% of 2,000 people; the test bound is 20%).
  More people stand plainly, text, or call.
- **No `Idle.old`.** The performer's "old" idle is bent nearly double at the waist, arms reaching
  forward. Capping its lean still left a caricature, so the older citizens now stand, shift their
  weight, call, or (one in four) hold their hands behind the back.

**The phone (`Idle.text`, `Walk.text`).**

- **Crowd.** The crowd's skinning folds the finger bones into the hand, so a fingertip bone
  (`index_04_leaf_r`, `PHONE_BONE`) is free.
  - Each texting citizen gets a 24-vertex phone (7 × 14.5 × 0.9 cm), skinned to that bone, at L0
    and L1. That is 12 more triangles.
  - The bake gives the bone the right hand's matrix in the clips that hold a phone, and a zero
    matrix in every other clip. The phone collapses to a point there and draws nothing, so the
    shader needs no visibility logic.
  - The phone sits between the hands, a little past the wrists, with the screen tipped up towards
    the face. It is placed from the texting pose and carried by the hand.
  - Regions 6 (case) and 7 (screen, slightly emissive) are shaded in `CITIZEN_FRAGMENT`.
- **Near pool.** That bone slot is a bone of its own on the right hand. Its scale is 1 while a
  phone clip leads the mix and 0 otherwise, and it hides during a reaction, hands-up or the
  onlookers' filming phone.
- **`Walk.text`.** This is the neutral walk with the texting idle's arms, neck and head layered on
  (their local rotations, sampled at the same time), so the phone rides with the chest. It is in
  `MOVES` for students, office workers and most others.
- **IK target.** The texting target moved closer, from 26 cm to 22 cm forward and from 20 cm to
  17 cm down from the chest point, so the elbows bend rather than reaching.

**Near pool: each person's own walk.** `figure.setMoves({idle, walk})` swaps the Walk action to
the person's walk and rebuilds the gait ladder on its stride. The left contact is at phase 0,
because every 100STYLE walk starts there. `near-characters` passes `look.walk`.

**Evidence.** The lineups are in `evidence/look/people/posture/`:

- `idle-front`, `idle-side`: Idle.stand on a salaryman, the heavy man, an office worker and an
  older citizen.
- `text-front`, `text-side`: Idle.text with the phone.
- `walk-side`: the usual walks; `walk-text`: Walk.text on three citizens, beside the older walk.
- `crossing-day`, `street-day`: in game, the GTA look by day; the crowd stays at 1,978.

**Known.** Short MakeHuman hair is thin at the crown. With more people looking down at a phone, a
camera above and behind them now shows the scalp through it.

**Tests (`tests/citizens.test.mjs`).**

- **Posture.** For every citizen, in Idle.stand and their usual walk:
  - the shoulders over the hips;
  - the neck a little ahead;
  - the hands at least 9 cm out from the hip;
  - standing, the hands not behind the hip.
- **Few hidden hands.**
- **The phone baked only where it is held.** The phone bone's matrix equals the hand's in
  Idle.text and Walk.text and is zero in Idle.stand and Walk.
- **Near pool.** Per-person walks rebuild the stride, and the phone shows only for a texter.

### Cost

- **Triangles.** L0 is 16k triangles against the old body's 13.9k, and only the nearest 48 are
  drawn at L0. L1 to L3 match the old budgets.
- **Draw calls.** Ten archetypes × four levels is 40 lanes against 16, so up to 24 more draw calls.
  Each draws only its visible slots.
- **Download.** The pack is 16.7 MiB with each citizen's own half-float bone atlas (Look 2c), plus
  ten texture atlases of 170–320 KB each.

## Next

- **Look 2, next.**
  - More citizens: kids, tourists, uniforms and hats.
  - Women's walks for texting (`Walk.text` is layered on the neutral walk for everyone).
  - A denser crown for short hair, or a hair-coloured scalp under it, for heads seen from above.
  - A normal-map atlas for the near pool.
- **Look 3: grime, decals and material detail.** It also includes a Blender pilot building.
  Brand signs stay as they are.
