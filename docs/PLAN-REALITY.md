# Reality alignment (owner's QA pack, 2026-10-11)

The owner's "Shibuya Reality Alignment QA Pack" asked for the scene to be checked against the real crossing:
- camera first,
- then geography and massing,
- then facades, light and density.

Gate 1 was audit only. The owner then allowed any change to building sizes and the map ("ルール変更を認めます"). This file records what was found and what changed. The Gate 1 deliverables were handed to the owner outside the repository:
- report,
- registers,
- alignment figures.

## Sources
- **MLIT Project PLATEAU, Shibuya-ku 2025 CityGML.**
  - Building tiles 53393596, 53393595, 53393586 and 53393585. Each building carries its `measuredHeight` (aerial survey) and LOD2 roof surfaces.
  - Road tile 53393596 (LOD3 carriageway and sidewalk polygons).
  - Fetched through `https://api.plateauview.mlit.go.jp/datacatalog/citygml/m:<mesh>`.
  - Not committed: about 360 MB.
- **OpenStreetMap**, as already baked into `public/data/shibuya-scene-data.json` (footprints, network).
  - Its height tags are PLATEAU's, so the two agree where OSM has a height.
- **Wikimedia Commons photographs.** Used to solve cameras and to read facade features. No texture is taken from them.
  - `File:In_Front_of_Shibuya_Station.jpg` (Dick Johnson, 2010, CC BY 2.0)
  - `File:Shibuya_scramble_av_night_from_Stream.jpg` (Syced, 2024, CC0)
  - `File:Q-Front_2018.jpg` and `File:2025_Shibuya_Crossing.jpg` (Kakidai, CC BY-SA 4.0)
- **The owner's target image is not used for geometry.** It is likely generated: its crosswalks and MAGNET do not match any survey or photograph. It is a mood target only.

## Gate 1 findings (summary)
1. **CAM-09 is not a real vantage point.**
   - It is higher (86 m) and farther back than the target frame implies (about 45 m up, about 130 m from QFRONT).
   - From there, roofs and asphalt dominate.
2. **Footprints and the road network are right.**
   - Hero footprints match PLATEAU LOD0.
   - Ground anchors in a real photograph fit the scene to 2–22 px.
   - The open centre of the crossing is real: its area matches PLATEAU. It is not a road-width error.
3. **The Taiseido (大盛堂) building was raised from 24.1 m to 38 m** (`HEIGHT_OVERRIDES`) to give the Hisamitsu / サロンパス boards a wall.
   - In reality those boards stand on a steel frame on its roof.
   - This was a view-driven distortion of the world.
4. **QFRONT stopped at 45.9 m, with a crown set back to 76%.**
   - PLATEAU LOD2 shows the outer wall rising sheer to the 52.1 m parapet of the crown screen.
   - The roof deck is recessed at 48.4 m and the top storey ends at 44.0 m.
5. **105 of 378 generic buildings had random heights.**
   - Against PLATEAU: mean error 9.6 m; 24 are more than 10 m off.
6. **Roads (later stage).**
   - Carriageway IoU against PLATEAU is 0.73 within 40 m.
   - North and east legs are 2–4 m narrow per side, and corner fillets eat the corner waiting areas.
7. **Also found:**
   - The night crossing reads as a flat bright plane.
   - Traffic: 62 vehicles for the whole map.
   - The far city is random boxes.

## Changes
### Comparison cameras
New presets in `src/app/foundation.mjs`, marked `reference`. They are kept out of the main camera bar, and CAM-01..09 are unchanged.

| id | label | solved from | notes |
|---|---|---|---|
| `ref-a` | REF-A Station Walkway | `In_Front_of_Shibuya_Station.jpg`, 7 ground and corner anchors | position [-12.6, 10.2, 68.2], vfov 52.2, 4:3 |
| `ref-b` | REF-B Stream Night | `Shibuya_scramble_av_night_from_Stream.jpg`, 7 crosswalk and corner anchors | position [161.9, 159.6, 201.8], vfov 15.8, residual 7–28 px; the target lies on the ground along the ray (the orbit holds targets below 60 m) |
| `ref-c` | REF-C Target Frame | the owner's target, estimated | mood only, never measured against |

Capture with `look-stills.mjs`, passing the camera in the start query (`... look-stills.mjs <out> "qa=1&tier=high&time=night&camera=ref-b"` with `CAMS=-:ref-b` and `W`/`H` set to the photograph's frame).

### Measured heights (G2-1)
- `scripts/data/merge-plateau.py` attaches to each OSM building the PLATEAU building it overlaps most (share ≥ 0.5):
  - `plateau: {id, h, top, share, storeys, roofSteps}`;
  - 592 of 666 buildings are matched.
- Near the crossing (220 m), each matched building also gets its LOD2 roof steps that stand more than 1 m above the main roof, merged per 0.5 m level.
- `resolveHeight` prefers PLATEAU's height to OSM tags and to guesses. `HEIGHT_OVERRIDES` is empty.
- Generic buildings with roof steps get them extruded on the roof (`buildings/render.mjs`) in place of random rooftop plant.
- The commercial heroes get theirs as `plateau-roof` masses (`heroes/model.mjs plateauRoofMasses`):
  - MAGNET to 42.5 m;
  - Seibu A and B to 44–46 m;
  - 109 to 50 m.

### Sign structures
- `src/signs/sign-structures.mjs` adds a steel lattice frame on the Taiseido roof (24.1 m).
- It carries サロンパス (28.8–34.2 m) and Hisamitsu (34.4–40 m) on the face towards the crossing, 8.8 m wide. Positions are solved from the REF-A photograph.
- Reference ads 15 and 16 are excluded from the frame-percentage placement (`carried-by-sign-structure`).

### QFRONT (G2-2)
- **Masses**:
  - podium 0–7.5 m;
  - glass 7.5–39.9 m;
  - top storey to 44.0 m;
  - the crown as a perimeter screen on the full footprint to 52.1 m (a ring, not a box);
  - the deck recessed inside it at 48.4 m.
- **Facade**: white aluminium fins about 1 m apart, proud of the glass, with transoms on the 5.4 m storey lines.
- **Screen**: 14–38 m on the curved front. This is estimated from 2018 and 2025 photographs; the operator publishes no dimensions.
- **Blender asset** (`scripts/blender/build-qfront.py`): the crown is a full-height lattice of louvres with four rails, and the QFRONT lettering is on the crown.

### Night light on the crossing (G2-3)
- The broad warm pool over the scramble is 0.06, a third of what it was. At 0.16 the asphalt read as one lit plane, where photographs show dark road, bright zebra paint and colour from the screens.
- Lamp pools are 0.20 within 20 m (they were 0.26 within 24 m).
- Exposure: `SolarCycle.update` writes `toneMappingExposure` every frame, so it is the effective owner. The day-night and fidelity writes are transient.

## Next
- Road edges from PLATEAU tran for the 80 m core. Re-run the crowd and traffic audits.
- Traffic queues on the approaches.
- Far city from PLATEAU LOD1 footprints.
- Per-building facade sheets for the frontage.
- Night lighting: reduce the broad crossing pool; exposure is effectively owned by `SolarCycle.update` (it writes every frame).

## Recovery R0/R1 (owner's recovery pack, 2026-10-11)

### R0: the regression reproduces and is not a capture artefact [confirmed]
- At `71c62b9`, the hero module fails, in Node and in a fresh browser with one dev server.
- The console shows: `[S4 Hero Landmarks] Error: Unable to complete output ring starting at [-30.11, -153.16]`.
- Draw calls are 285 at REF-A, as the owner read from the board.
- Every landmark (QFRONT, MAGNET, Seibu, 109, Scramble Square, Mark City, Stream) was missing, because one exception aborted `buildHeroScene`.
- The signs are a separate module and stayed up, so they appeared to float.
- My earlier "after" board mixed two working trees. One capture was taken before the hero roof steps were added (QFRONT visible) and one after. A `git stash` taken during an earlier capture also put HMR into play. That comparison is void.

### Why Seibu B's roof steps broke the union [confirmed]
- Seibu B has four roof steps (PLATEAU LOD2), at 38, 43, 44 and 46 m. Each is valid on its own (shapely `is_valid`), and every pair unions except 44 m with 46 m.
- Both of those were clipped to the OSM footprint. Both therefore start at the same footprint corner, [-24.5472, -160.3669], and run east along almost the same line:
  - to [-0.4426, -156.062];
  - to [-0.1044, -156.0016].
- The result is a sliver a few millimetres wide. polygon-clipping's sweep line cannot close a ring through it.
- Snapping both to a 1 mm, 1 cm or 5 cm grid makes the union succeed.

### R1 fix
- `plateauRoofMasses` (`src/heroes/model.mjs`) now repairs each roof step before keeping it:
  1. snaps it to a 1 cm grid and drops repeated vertices;
  2. re-validates it;
  3. proves it with the same union the renderer will run against the steps already accepted.
- A step that still fails is skipped and recorded in `h.roofStepReport` (`{accepted, snapped, skipped: [{y, reason, area, error}]}`).
- With the 2025 data, all steps repair and none are skipped: 109 has 5, MAGNET 7, Seibu A 4, Seibu B 4.
- `tests/hero-build.test.mjs` (in `test:ci`) builds the module from the real merged data and checks:
  - all 9 heroes build, with no failures or missing sources;
  - every hero has valid geometry and finite bounds, and every mesh is visible;
  - no roof step is skipped;
  - QFRONT and MAGNET reach the screen from REF-A, REF-B and CAM-09: the first ray hit, with the generic city as occluders, lands on the landmark for at least 30% of the sample points.
- The test fails at `71c62b9` and passes after the fix.

### Isolation (separate step after R1)
`buildHeroScene` builds each landmark into local lists. The lists join the shared batches only when that landmark has fully built. An exception is recorded in `failures` with the hero's key and logged, and the other landmarks still render. A test breaks Seibu B's footprint on purpose and checks that the other eight remain.

### R1 image comparison
Evidence is in `evidence/recovery-r1/`. Before is `71c62b9`; after is `1aee636`.

**Capture conditions (identical on both sides)**
- `git checkout <sha>` with a clean tree.
- One dev server, restarted for each SHA.
- A fresh headless Chrome for each camera, rendering with SwiftShader (no GPU).
- Tier HIGH, GTA look, captured in the scramble's WALK phase.
- Start URL `?qa=1&tier=high&time=day&camera=<ref>`, with QA phase day then night.
- Frames: REF-A 1280×960, REF-B 1280×964, REF-C 1160×1000.
- No source edits or stashes during capture.
- `meta.json` records each SHA and static key. `console-*.txt` holds the browser console.

**Results**
- QFRONT and MAGNET are missing in all six before stills and restored in all six after stills.
- Draw calls:

  | | before | after |
  |---|---|---|
  | REF-A day | 285 | 338 |
  | REF-A night | 294 | 345 |
  | REF-B day | 291 | 342 |
  | REF-B night | 298 | 349 |
  | REF-C day | 275 | 328 |
  | REF-C night | 286 | 335 |

- The console shows the S4 error before and no error after.

**Open item [unknown]: black signs in one REF-A night frame**
- In the first after capture of REF-A night (`after-night-ref-a-ANOMALY-black-signs.jpg`), every sign rendered black and a red notice showed in the UI.
- Two recaptures at the same SHA with the same procedure were normal. The board uses the first recapture.
- Cause not established. Hypothesis: the first page load after a fresh dev-server start was reloaded mid-session (dependency optimisation).
- R2 should add an automatic sign-visibility check to the stills.
