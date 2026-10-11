# Plan: the cityscape (Gate A audit and design)

Status: **Gate A only (audit and plan). No code changed.** Written 2026-10-11 from the owner's
package `Shibuya_Blender_Claude_Package.zip`, which contains `SHIBUYA_BLENDER_MASTER_SPEC.md`,
two reference images and three diagrams.

The owner added: "this is not necessarily right". So this plan says where the package is followed,
and where and why it is not.

Every item below is marked as one of:

- **[fact]**: checked in the code or in a render;
- **[hyp]**: a hypothesis, not yet verified;
- **[open]**: unknown, needing a measurement or a decision.

## 1. Verdict on the package

| Package says | Verdict |
|---|---|
| Audit first, change nothing (Gate A) | **Follow.** |
| Fit a comparison camera to the target photograph | **Follow, but not to the photo's geometry.** The photo is almost certainly generated or heavily edited (see 3.1). Fit the camera to real geometry (OSM, which the scene is built on) and use the photo only for mood: density, contrast, light. |
| QFRONT first, as a Blender GLB | **Follow, but second.** QFRONT is not the largest gap (see 4). Two cheaper changes close more of it first: a lit far city behind the scene, and denser, varied windows. Both need the same window atlas that the QFRONT pilot needs. |
| Emissive plus limited bloom, not one light per sign | **Follow.** The scene already works this way [fact]. |
| No wet road everywhere | **Follow, and fix what is there.** The night planar road mirror makes the large blotchy "puddle" across the crossing (`nightglow/road-reflection.mjs`) [fact, see stills]. In the photo, the crossing reads as dark asphalt with crisp white zebra stripes. |
| Do not increase the crowd of 1,978 | **Follow.** Also never reduce it (owner's standing rule). |
| Feature flag, fallback, old model kept until Gate D | **Follow:** `?qfront=blender` on, `?qfront=classic` off, and fallback on any load error. |
| KTX2/Basis, Draco/Meshopt | **Defer.** None of these decoders is set up today [fact]. Meshopt is the smaller step (a JS decoder in three). KTX2 needs transcoder files served from `public/`. The first pass uses WebP and plain GLB, and compression is measured after. |
| Measure on the owner's PC: p50/p95, GPU timer | **Follow, on the owner's PC only.** This environment renders with SwiftShader (software). Its fps is meaningless, about 0.2–0.8, and it has no GPU timer [fact]. All performance numbers in Gate D must come from the owner's machine. |
| Use the photo's left and right brands (UC, Hisamitsu, DHC, Acom, Aiful, MAGNET) | **Ask.** AGENTS.md forbids third-party brand assets without clear authorization, and the standing rule is "brand signs stay as they are". No new real brands are added unless the owner says so (see 8). |

## 2. Facts (the repo today)

### Stack and data

- Three.js 0.185, WebGL2, Vinext app; the entry point is `app/ShibuyaScene.tsx`.
- Coordinates: metres, +X east, +Y up, +Z south. The origin is lat 35.6595, lon 139.7005 (`src/geo/core.mjs`). The scene spans ±250 m.
- Ground heights: asphalt 0, sidewalk 0.15. Buildings and heroes stand at 0.15.

### Generic buildings

- 378 OSM buildings (`src/buildings/*`).
- Walls and roofs are merged; windows are `InstancedMesh` planes with no window texture.
- Night windows come from a per-instance seeded lit fraction (`environment/day-night.mjs`).
- HIGH: about 291k triangles, 13 materials, 18 draw calls.

### Heroes (procedural, `src/heroes/*`)

- **QFRONT** (`way/136691386`):
  - footprint X −30.2..5.1, Z −56.5..−29.0, height 45.9 m;
  - masses: base 0.15–7.65, media 7.65–38.65, upper 38.65–42.65, crown 42.65–46.05;
  - glass is transparent at opacity 0.38, with mullions;
  - six floors of box "rooms" behind the glass (`qfront-interior.mjs`). These are what read as brown cardboard at night;
  - a 3-segment screen, and a canvas cafe front.
- **MAGNET** (`way/116806281`, 34.2 m), 109, Seibu, Scramble Square and Mark City.
- All heroes together: about 57k triangles, 21 materials, about 23 draw calls.
- No GLB building exists. The only runtime GLB is the character.

### Signs

- An invented-name atlas, plus 30 reference ads transcribed from one CAM-02 photograph (`signs/reference-ads.mjs`). Artwork is drawn on canvas.

### Far city

- **None.** There is no skyline, no far blocks, and nothing past ±250 m. The night sky behind the crossing is black (user screenshot and our stills).

### Post and lighting (HIGH)

- Shadows: PCF 4096.
- Pipeline: GTAO (half resolution), SoftBloom (threshold 4.2, ¼ resolution), grade, SMAA.
- Exposure: 0.74 by day, 0.86 at night.
- Night lights: 6 point lights and 8 spot lights.
- A planar road mirror at night (½ resolution, every second frame).
- No rain system.

### Performance tooling (exists, never run on the owner's PC)

- `?perf=1`: per-module ms and GPU timer queries.
- `?perf=sweep`: a baseline, then each of shadow, gtao, bloom, smaa, post, mirror, crowd, hqcrowd, nearchars, traffic, trains, signs, streetscape, nightglow, buildings and render switched off in turn, then the baseline again.
- `?off=a,b`: keeps features off for a manual A/B.
- `src/qa/frame-samples.mjs`.

### Performance numbers known

| Measure | Value | Source |
|---|---|---|
| Owner's PC, HIGH | about 6–7 fps; 7.1 in the screenshot (one moment) | screenshot |
| Draw calls in the screenshot | 362 | screenshot |
| Browser CPU frame | 23.2 ms, of which crowd simulation 16.8 ms | `CROWD-PERFORMANCE.md` |
| Triangles drawn here (SwiftShader), CAM-02 | about 5.4 M (night 355 draw calls, day 344) | `evidence/city/gate-a/look.json` |

**[hyp]** The owner's 7 fps is CPU-bound (crowd simulation and draw submission), not limited by
building fill rate. If so, building triangles cost little, but draw calls and transparent overdraw
cost a lot. This is unverified until the sweep runs on that PC.

## 3. The reference images

### 3.1 The target photograph (`02_target_photograph.jpg`)

**[fact]** The lettering is garbled: "MAGHET", "STARBACKS COFFER", unreadable marquees, and
QFRONT carries a "渋谷 People!" logo that is not the real one. This is the signature of an
AI-generated or heavily edited image.

**[fact]** Its viewpoint is high and to the south of the crossing, looking north: QFRONT in the
centre, the ad cluster to its left, MAGNET to the right.

Use it for:

- the night contrast: dark masses and saturated, local light;
- a dense lit far skyline;
- many small windows with varied lighting;
- crisp zebra stripes on dark asphalt;
- warm street-level frontage;
- large lit street trees.

Do not use it for building positions, sizes or sign contents.

### 3.2 The gap, current vs target, ranked by what the eye notices first

1. **No far city.** The sky behind QFRONT and MAGNET is black; the target is full of lit towers. *Biggest single gap; the cheapest fix.*
2. **Windows.** Ours are few, large and evenly bright pale squares on dark walls; the target has dense small windows, varied per floor, mostly dim.
3. **QFRONT's glass.** Brown "room" boxes show through 38% glass. The target is near-black glass with a fine bright mullion grid and the big screen dominating.
4. **The crossing surface.** The planar mirror smears sign colours into a blotchy puddle.
5. **Signs.** White-backed panels lit evenly, so they read as paper. Real signs have dark surrounds, lit edges and vertical stacks of signboards.
6. **Street level.** Warm frontage exists but is thin; trees are few and small.
7. **People.** Done in Look 2; nothing here.

## 4. Proposed order (gates)

Each gate ends with same-view stills (day and night, CAM-02, CAM-04 and the new comparison
camera) and the owner's sign-off.

### Gate B: the comparison camera and the measurement kit (small)

- Add a new preset, `CAM-REF`, about the photo's viewpoint: south of the crossing, high, looking north at QFRONT.
  - Fit it to OSM anchors (QFRONT's top and corners, the crossing centre, MAGNET's corner), not to the photo's pixels.
  - Existing presets are unchanged.
- Add a measurement script for the owner's PC: one URL runs the matrix and saves JSON.
  - The matrix: as-is; crowd hidden; crowd hidden and frozen; buildings off; shadows off; post off; DPR halved.
  - It records frame p50/p95, draw calls, triangles, JS heap, and the GPU timer if available.
  - It extends the existing `?perf=sweep`; no new probe is written.
- Output: the owner runs it once and sends the JSON. Without that, Gate D cannot be judged.

### Gate C1: the window and far-city atlas (recommended first visual step)

- **One generated emissive window atlas** (Blender or a script, CC0): floors of small windows, varied lit fraction, warm, cool and dark per floor. It is used by:
  - **the far city:** a ring of low-poly tower blocks past 250 m, generated from simple rules (the real Shibuya skyline is dense mid-rise with a few towers), sharing one material at about 1–3 draw calls. Beyond about 600 m it becomes impostor cards. Fog and grade are shared with the scene;
  - **generic buildings' night windows:** instead of large flat squares, a facade texture sampled by world position, so walls show many small windows without more instances. *[hyp]* This is draw-call-neutral, or saves calls if the window instances can go at a distance.
- Cost target: at most +3 draw calls and at most +60k triangles; check with the owner's sweep.

### Gate C2: QFRONT pilot (the package's core, as Blender GLB)

See section 5. Behind `?qfront=blender`, with the procedural QFRONT kept as fallback and A/B.

### Gate C3: crossing surface and signs (small, code)

- **The road mirror.** Clamp its strength on the crossing, or drop it there for wet-patch decals only. Make the zebra and stop lines crisp and bright.
- **Signs.** Darken sign surrounds, add a lit edge, and give signs non-uniform brightness. The canvas artwork stays; no brands change.

### Gate D: performance decision

- Compare old and new with the same URL on the owner's PC.
- If anything is meaningfully worse, cut detail, bake, add LODs or use the atlas, then measure again. "It looks nicer" is not a reason to accept a slowdown.

### Gate E: roll out

- Apply the QFRONT recipe to MAGNET and the left ad block.
- Add streetscape trees and frontage.
- Run the regression tests at every step.

## 5. QFRONT pilot: concrete design

### 5.1 Built by script, not by hand

- `scripts/blender/build-qfront.py` runs headless with Blender 4.2.3, the same toolchain as the citizens [fact].
- It reads QFRONT's OSM footprint and mass heights from `src/heroes/config.mjs` and `builders.mjs`, so the GLB matches the current building's position and size by construction.
- It is rerunnable and reviewable in git. No hand-modelled file is the only source.

### 5.2 Hierarchy and naming

All nodes are under `QFRONT_ROOT`. The pivot is the footprint origin at the scene's origin, and the
base is at Y = 0.15.

| Node | Contents | Material |
|---|---|---|
| `QFRONT_SHELL` | Masses as today: base, media, upper and crown, with slab edges every floor (5.4 m) as real geometry, 10–20 cm proud | `qf_concrete` |
| `QFRONT_FACADE_FRAMES` | Vertical mullions and the floor bands that shape the silhouette, merged into one mesh | `qf_metal` |
| `QFRONT_GLASS` | One opaque "deep glass" shader (below), not transparent | `qf_glass` |
| `QFRONT_SIGN_EMISSIVE_SCREEN` | The big screen's surface, still driven by the existing screen canvas (`signs/render.mjs`) | `qf_screen` |
| `QFRONT_STOREFRONT` | Ground floor: canopy, entrance and lit interior card | `qf_store` |
| `QFRONT_LOD1` | Shell and glass only, frames baked into the glass texture | |
| `QFRONT_LOD2` | Shell and glass only, frames baked into the glass texture | |

There is no collision proxy: collision uses the OSM footprint today, and that stays.

### 5.3 Materials and textures

- **Total:** 5 materials, 1–2 texture sets, at most 2048² each.
- **`qf_glass`:** opaque glass made of a dark base colour, a fake sky and city reflection, and an interior parallax. The interior parallax is one atlas of a few room types, sampled per floor and bay.
  - It replaces both the 38% transparent glass and the box "rooms". That means no transparency sorting and no overdraw.
- **Floor lighting:** varies per floor and bay through a small per-floor emissive mask, so the whole face never goes uniformly white.
- **Texture sets:** base colour, ORM (glTF channels: R occlusion, G roughness, B metalness), normal for rails and joints only, and emissive. AO is baked in Blender with Cycles CPU.
- **No lightmap in the first pass.** UV2 handling through glTF into three is not yet verified [open].
- **Day and night:** the same textures, with emissive scaled by phase. Nothing dark is baked into the base colour.

### 5.4 GLB

- glTF 2.0, Y-up: Blender's exporter converts from Z-up once. The converter applies no second conversion. A test checks the bounding box against the OSM footprint to within 5 cm.
- Contents: positions, normals, tangents (needed for normals), UV0, and UV1 only if a lightmap is later adopted. No animation.
- Format: plain GLB with WebP textures first. Meshopt geometry compression and KTX2 only after a measured comparison, with their decoders registered in the loader.
- Budget, provisional until the owner's measurement:
  - draw calls at most today's QFRONT, which is about 8–10 including glass, frames, interior and cafe [open: count exactly in Gate B];
  - LOD0 at most 60k triangles;
  - GLB at most 3 MB.

### 5.5 Comparison procedure

1. Same build, same URL, `?qfront=classic` against `?qfront=blender`.
2. Same-view stills from CAM-REF, CAM-02 and CAM-04, by day, dusk and night, generated by `qa/gta-upgrade/look-stills.mjs` and added to it.
3. On the owner's PC: `?perf=sweep` for both, plus load time, peak memory and first-frame delay.
4. Report a table of old against new, separating "visually compared" from "measured".

### 5.6 Compatibility issues expected

| Area | Issue |
|---|---|
| Screen | The existing screen and sign canvases (`signs/render.mjs` overrides QFRONT's screen at 10.5 m × y 22.5) must be re-anchored to the GLB's screen node, not to a mass. |
| Cafe | The cafe front (`cafe.mjs`, `cafe-frames.mjs`, `polish.mjs` marquee) overlaps the storefront node. Choose one and remove the other under the flag. |
| Shadows | `fidelity/look.mjs` selects shadow casters by mesh name. GLB nodes need the same flags. |
| Night emission | Night emission (`day-night.mjs`) is injected by mesh-name mode, so the GLB materials need their own emissive control. |
| Generic buildings | Generic buildings that overlap hero footprints are skipped by footprint. That is unchanged, because the footprint is the same. |
| Tiers | HIGH, MEDIUM and LOW must all work. LOW gets LOD2 only. |
| Dispose | The module must dispose on disable and not come back (AGENTS.md). |

## 6. Re-measuring the "7.1 fps"

The 7.1 fps in the screenshot is one moment, not an average. Plan:

1. In Gate B, one URL on the owner's PC, for example `?tier=high&time=night&camera=scramble&perf=sweep`, writes the JSON described in Gate B.
2. Run it three times, with nothing else open and the window size fixed. Record the browser, GPU and DPR.
3. Here (SwiftShader), only draw calls and triangles are meaningful. Frame times from this environment are never reported as performance.

## 7. Risks

- **Transparent glass and planar reflections** are the expensive kinds of "realism" on a CPU-bound PC. The plan replaces them rather than adding to them.
- **A far city that is too bright or too uniform** would look like wallpaper. The atlas needs per-floor variation and must sit under the grade and fog.
- **The owner's real bottleneck may be the crowd simulation** (16.8 ms CPU). Then no building change moves the fps much either way, and the gate for buildings is "no worse", not "faster".

## 8. Decisions for the owner

1. **Order.** Recommended: B → C1 (far city and windows) → C2 (QFRONT GLB) → C3 (crossing and signs). The package's order is B → QFRONT first.
2. **Brands.** Should the left cluster and MAGNET side get the real brands from the target (UC, Hisamitsu, DHC, Acom, Aiful, MAGNET), or keep today's signs? Default: keep, as the standing rule says.
3. **Measurement.** Can you run one URL on your PC after Gate B and send back the JSON it saves?
