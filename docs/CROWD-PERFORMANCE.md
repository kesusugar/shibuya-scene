# Crowd performance: the same crowd for less work

Status: phase 1 (analysis) done; six changes made and measured. **The crowd is not smaller**:
all 1,978 pedestrians, 62 moving and 12 parked vehicles, every building and landmark, and
every behaviour stay as they were. Nothing here lowers the resolution, turns off shadows or
changes a tier.

Owner's brief (2026-10-10): learn from "musou" games that draw huge crowds smoothly, keep the
looks, the crowd size and the features, cut the waste, judge only by measurement, change one
thing at a time and revert anything that does not pay.

## How it was measured

No GPU exists where this was done (the cloud container renders with SwiftShader, on the CPU).
So nothing below is a frame rate on the owner's PC, and no GPU time is reported. What can be
measured honestly here:

| Tool | What it measures | Why it is trustworthy here |
|---|---|---|
| `qa/gta-upgrade/sim-bench.mjs` (Node) | ms per update of the crowd and traffic simulations, on the browser's own prebuilt models, HIGH, the scramble choreography, 3 x 900 frames after 300 warm-up | Pure CPU. And a **hash of every pedestrian's and vehicle's final state**: a change meant to alter only speed must leave it identical |
| `qa/gta-upgrade/scene-cost.mjs` (browser) | the whole frame's CPU time with drawing off, per section (`?perf=1`), six gameplay situations, 120 frames each | CPU only; the draw is off so the software renderer does not count |
| `qa/gta-upgrade/render-bench.mjs` (browser) | per frame: draw calls, primitives submitted (triangles x 3), bytes uploaded to the GPU, memory -- counted at the WebGL calls, in three views of the player at the start | Counts, not time: they are what a real GPU would be asked to do |

The owner's device remains the judge of frame rate: `?perf=1` shows the split on the PC, and
`?off=cull` turns the new culling off for an A/B there.

## Phase 1: what the scene does (from the code)

**Rendering.** three r185, WebGL2. At HIGH an EffectComposer pipeline (`src/fidelity/pipeline.mjs`):
the scene, GTAO at half resolution (which **renders the scene a second time** for its normals),
a quarter-resolution bloom, a grade, SMAA, output. A 4096 PCF shadow map. Pixel ratio 1.5 x the
dynamic-resolution scale (floor 60%). Night adds the road reflection (`ROAD_REFLECTION`).

**The crowd is already built the "musou" way** -- the parts of phases 2 and 3 of the brief were
done in RUN 7 (`src/life/hq-crowd.mjs`):

- 4 archetypes x 3 LODs = 12 `InstancedMesh` draw calls for the whole crowd;
- GPU skinning from a baked bone-matrix atlas (a float `DataTexture`), sampled in the vertex
  shader: no `Skeleton` and no `AnimationMixer` per citizen; a citizen's clip, phase and blend
  are instanced attributes, so animation costs the CPU nothing between state changes;
- per-citizen state in typed arrays (`Float32Array` positions, `Uint8Array` states...);
- LOD by distance: L0 within 14 m (13.4-15.7 k triangles), L1 within 38 m (4.8-6.6 k), L2 beyond
  (2.0-2.8 k), with hysteresis and at most 24 moves a frame;
- the nearest 8 people are real skinned humanoids with foot IK (`near-characters.mjs`).

**What it did not do:** every instance was drawn from every camera (`frustumCulled = false` and
nothing in its place), in both the scene pass and GTAO's; and every lane re-uploaded its whole
buffer (1,112 slots x 7 attributes, x 12 lanes) every frame. The old capsule renderer
(`src/life/render.mjs`), which draws nobody at HIGH, still worked out every body's parts and
re-uploaded all its buffers every frame.

**The simulation** (`src/life/simulation.mjs`, 30 Hz fixed step) already has AI LOD (phase 4):
near 30 Hz, mid 15 Hz, far 5 Hz, idle 2 Hz -- except the choreographed scramble cast (74-85% of
the crowd), which runs at 30 Hz. Neighbours come from a uniform grid (2 m cells; traffic 15 m),
static walls from `SpatialIndex` buckets with polygon tests, and walkability and ground height
from caches (0.1 m and 0.25 m). Collision is local (3 x 3 cells) -- no all-pairs.

### Measured baseline (master `ed415b7`)

| | |
|---|---|
| Browser frame CPU, drawing off, on foot idle | **23.2 ms** mean, p95 39.7 ms (crowd simulation 16.8 ms of it) |
| ...firing the SMG into the crowd | **29.7 ms** mean, p95 50.1 ms |
| Node: crowd + traffic update | **12.7 ms** mean, p95 22.1 ms, p99 29.3 ms |
| Primitives submitted per frame, player view (HIGH day) | **65-67 M** (crowd: 10.5 M triangles, drawn twice) |
| Uploads per frame | **~1,000 KB** |
| HQ crowd at the start | L0 380, L1 482, L2 1,107 people |

### Top five bottlenecks (measured)

1. **The crowd's triangles, drawn twice and drawn off screen.** 10.5 M of the frame's ~22 M
   triangles are the crowd at the start; GTAO's normal pass repeats them; the people behind the
   camera were drawn too.
2. **String keys in the hot lookups.** Every neighbour query built nine `"i,j"` strings; every
   height and walkability lookup built one; `SpatialIndex.query` built strings, sets and arrays.
   `blocked`, `height`, `safe`, `vehicleOverlap` and the garbage collector were ~40% of the
   simulation's profile.
3. **The road test for vehicle poses** (`onRoad`): one road polygon of 1,369 edges and 29 holes,
   tested edge by edge for every corner of every pose (6.8% of the browser frame).
4. **Uploads of unused buffer space** (~1 MB a frame) -- a bus cost that lands on integrated
   graphics, which share memory with the CPU.
5. **The choreographed cast at 30 Hz everywhere** -- still the largest single part of the
   simulation after the above (`choreography.move`, ~12%), not changed here (below).

## What was changed, and what it gave

Each change was measured on its own; nothing here failed to pay, so nothing was reverted.

| # | Change | Files | Measured effect | Behaviour |
|---|---|---|---|---|
| 1 | Height and walkability caches keyed by a number | `src/life/network.mjs` | crowd 9.41 -> 8.40 ms | identical (hash) |
| 2 | `SpatialIndex`: numeric cells, a query that builds no arrays or sets (same results, same order; safe if a callback queries again) | `src/geo/core.mjs` | crowd 8.40 -> 6.83 ms | identical (hash; 2,000 random queries equal to the old algorithm) |
| 3 | The road test only tests the road edges in the point's 2 m band | `src/traffic/graph.mjs` | traffic 3.23 -> 2.51 ms | identical (hash; 21 M points equal) |
| 4 | Crowd and traffic neighbour grids keyed by a number; readers ask `gridKey(grid, i, j)` | `src/life/grid-key.mjs`, both simulations, 8 readers in `src/player` | crowd 6.66 -> 5.49, traffic 2.51 -> 1.78 ms | identical (hash) |
| 5 | Per-citizen culling of the HQ crowd against the main camera (both passes); other cameras draw everyone; only used slots uploaded | `src/life/hq-crowd.mjs`, `hq-layer.mjs`, `render.mjs`, `app/ShibuyaScene.tsx` | primitives, player turned: 66.6 M -> 25.2 M | nobody removed (tests) |
| 6 | The capsule renderer skips whoever another renderer draws and uploads only what it draws | `src/life/render.mjs` | uploads ~1,000 -> ~450 KB/frame | identical images |

### Before / after (master `ed415b7` vs this branch)

Browser, whole-frame CPU with drawing off (`scene-cost.mjs`), two independent pairs of runs
(each pair back to back on an otherwise idle machine; a third run was discarded because stray
headless browsers from a killed capture were loading the CPU):

| Situation | Pair 1: mean (p95) ms | Pair 2: mean (p95) ms | Change |
|---|---|---|---|
| On foot, idle | 23.2 (39.7) -> 15.1 (23.4) | 27.6 (47.0) -> 17.5 (26.7) | **-35% / -37%** |
| SMG fired into the crowd | 29.7 (50.1) -> 22.1 (38.0) | 38.8 (69.9) -> 22.8 (37.4) | **-26% / -41%** |
| ☆5 (helicopter, roadblocks) | 21.9 (33.0) -> 16.5 (24.9) | 24.4 (36.1) -> 16.4 (25.3) | -25% / -33% |
| Aftermath (ambulance, onlookers) | 18.1 (26.4) -> 15.0 (21.7) | 19.8 (30.8) -> 15.5 (23.2) | -17% / -22% |
| Motorbike, radio | 16.4 (24.1) -> 13.9 (21.1) | 17.0 (28.3) -> 13.8 (20.7) | -15% / -19% |
| Chase mission | 19.8 (30.3) -> 14.1 (23.0) | 19.6 (30.9) -> 15.7 (23.9) | -29% / -20% |

As a frame-rate ceiling from the CPU alone (1000 / mean, on this machine): idle 36-43 -> 57-66
fps; firefight 26-34 -> 44-45 fps. On the owner's PC the GPU may be the tighter limit; that
is what change 5 is for.

Node, simulation only (`sim-bench.mjs`, 3 x 900 frames, identical end state -- hash `745aeb48`
before and after). Two pairs; the machine's speed drifted between them, the ratio did not:

| | Pair 1 mean (p95 / p99) | Pair 2 mean (p95 / p99), back to back | Change |
|---|---|---|---|
| crowd | 9.41 -> 5.49 ms (18.1 -> 11.1 / 26.0 -> 15.1) | 11.61 -> 6.72 ms (22.1 -> 13.5 / 30.5 -> 18.0) | **-42%** |
| traffic | 3.31 -> 1.78 ms (5.0 -> 2.8 / 5.8 -> 3.3) | 3.71 -> 2.02 ms (5.8 -> 3.1 / 7.8 -> 4.1) | **-46%** |
| total | 12.71 -> 7.27 ms (22.1 -> 13.1 / 29.3 -> 16.8) | 15.32 -> 8.74 ms (26.6 -> 16.0 / 34.3 -> 20.4) | **-43%** |

GPU work submitted per frame (`render-bench.mjs`, HIGH, day; counts, not time). The crowd near
the start changes from second to second, so the fair comparison is culling on and off in the
same build and the same run conditions:

| View | Culling off | Culling on | Change |
|---|---|---|---|
| Player facing the crossing | 64.9 M primitives | 51.1 M | -21% |
| Player turned a quarter | 66.7 M | 31.3 M | -53% |
| Player turned half round | 66.6 M | 25.2 M | -62% |
| Buffer uploads (any view) | master ~2,240 KB/frame | ~450 KB/frame | -80% |

Draw calls are unchanged (~430: the crowd was already 12 draw calls). Memory: JS heap ~280 MB
and ~1.4-2.0 GB for the whole headless browser, before and after (no new allocations kept).


## Risks, and how they were checked

- **The prebuilt pack.** `public/data/shibuya-static-models.json` is keyed by a hash of the
  sources that build it, and `src/geo/core.mjs`, `src/life/network.mjs` and
  `src/traffic/graph.mjs` are among them, so it was re-baked (`npm run bake:static`). Its
  contents are unchanged: every field but the key and the build timings is identical.
- **`SpatialIndex` items keep their shape** (`{bounds, value, keys}`): the per-query
  de-duplication mark lives in a map of its own, so a restored pack's index still deep-equals a
  freshly built one (`tests/static-context.test.mjs`).

- **Behaviour.** Changes 1-4 are speed only; `sim-bench.mjs` proves the final state of every
  pedestrian and vehicle after 40 s is bit-for-bit the same. The two grids changed key type, so
  every reader was found and changed; one missed (`combat.mjs`) was caught by the combat tests.
- **Culling.** `tests/crowd-cull.test.mjs`: the partition is exact against the frustum; everyone
  keeps their palette, pose, clip and blend through any reordering; a second camera draws all;
  `cull(null)` restores all; an unchanged view reorders nobody; only used slots upload. Stills of
  the crossing with culling on and off show the same crowd.
- **The reflection.** It draws the whole crowd (no culling from its camera), as before.

## Round 2: the owner's go-ahead

7 and 8 were shown as comparison stills of the same moment (the switch made live and every
citizen's LOD reviewed at once, 0.3 s of game time before the still) and approved by the owner
before becoming the default. 9 was the third step of the same plan ("continue"); it changes no
image, so it was judged by audits instead.

| # | Change | Files | Measured effect | Seen |
|---|---|---|---|---|
| 7 | **At most 48 citizens at full detail (L0)**, the nearest; the rest of the L0 band at L1. `?l0cap=0` lifts it, `?l0cap=N` sets another | `src/life/hq-layer.mjs` (`L0_CAP_DEFAULT`), `app/ShibuyaScene.tsx` | densest spot by the crossing: crowd triangles in view 3.61 M -> 1.80 M (-50%), frame 8.6 M -> 5.2 M | `evidence/crowd-perf/l0cap/` -- "fully acceptable" |
| 8 | **A far level of detail L3** beyond 70 m (80 m to let go): each archetype's L2 simplified to about a quarter (2,014-2,827 -> 470-687 triangles, error 1.2-1.5%, garment colour edges kept) by `scripts/bake-crowd-l3.mjs` (meshoptimizer, shipped with three). Only a new index list over L2's own vertices: the same skinning, colours, palette and animation. `?l3=0` leaves it out | `public/data/crowd/hq-crowd-l3.json`, `src/life/hq-crowd.mjs` (`withL3`), `src/life/hq-layer.mjs` | the overview of the crossing: crowd triangles 3.95 M -> 2.02 M (-49%), frame 9.4 M -> 5.6 M | `evidence/crowd-perf/l3/` -- "no problem" |
| 9 | **The scramble cast moved less often away from the camera**: 30 Hz within 65 m, 15 Hz to 140 m, 10 Hz beyond, staggered by id, the skipped time carried (same ground covered). Never before a camera is known, never within 65 m of it; other pedestrians on a crossing stay at 30 Hz | `src/life/simulation.mjs` (`CAST_INTERVAL`) | Node, camera out in the city: crowd 2.76 -> 2.27 ms (-18%), p95 unchanged; at the crossing nothing changes (the state hash is identical) | 3-minute audits at three cameras: 0 signal and red-light violations, crossings completed 2,490 -> 2,479 (starts up to 0.1 s later) |

The crowd audit's "major" count (278 at every camera, before and after) is not from this work:
it is the same on master with the in-game configuration (choreography and the hero start on),
which the S10 audit test does not use.

## Not done, and what would come next

1. **Leave far citizens out of GTAO's normal pass** (they are drawn in it only to occlude the
   ambient-occlusion estimate around them). Halves their cost again; slightly changes the AO.
2. **Impostors (flat sprites) beyond L3** for the very far crowd: a sprite cannot easily keep
   each citizen's own palette, which is why L3 was chosen first.
3. **Shadow-map size / cascade review and a lighter AO for integrated graphics** -- only with the
   owner's `?perf=sweep` numbers from the device.
4. **WebGPU** is not needed for any of the above.

## Reproduce

```
npm run dev:local                                   # another shell
node qa/gta-upgrade/sim-bench.mjs 900 3             # Node, simulation CPU + state hash
node qa/gta-upgrade/scene-cost.mjs out.json         # browser, CPU per situation (drawing off)
node qa/gta-upgrade/render-bench.mjs out.json       # browser, draws / primitives / uploads
node qa/gta-upgrade/render-bench.mjs out.json "qa=1&perf=1&tier=high&time=day&camera=scramble&off=cull"
CAMERA=-200,150 node qa/gta-upgrade/sim-bench.mjs 900 3   # the cast away from the camera
node scripts/bake-crowd-l3.mjs                      # re-make the far level from L2
node qa/gta-upgrade/l0cap-stills.mjs out            # stills: no cap / 48 / 24 / no cap
node qa/gta-upgrade/l3-stills.mjs out               # stills: L3 off / on, overview and kerb
```
