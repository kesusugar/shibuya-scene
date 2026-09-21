# GTA Fidelity Master Plan — status and handoff

The one document to read when resuming this work with no conversation history. Read
`AGENTS.md` and `CLAUDE.md` first for the repository rules, then this.

**Updated at the close of RUN 7B.** RUNs 0–6, 6.8, 7A and 7B are complete. RUN 7 proper —
the NPC behaviour work — is still only an unverified WIP commit; see §10.

## 1. Goal

Turn the Shibuya scramble scene into something that reads like a GTA-style street: a player
you can walk, run, fight and drive with, in a crowd that reacts, at a fidelity that holds up
when the camera is two metres from a person's face. Fourteen RUNs, sequential, each closed
with tests, in-browser verification, numbers, and a commit before the next begins.

Not a goal: a physics rewrite, an engine swap, or a photoreal character. The Superhero body
in use now is a placeholder for the pipeline, not the final visual asset.

## 2. Branch and HEAD

- Working branch: **`claude/gta-fidelity-upgrade`**, pushed to `origin`. Stay on it.
- HEAD: **`03fcd5b`** (RUN 6.8) — local and remote match, working tree clean, no stashes.
- The last **complete** RUN is RUN 6.8 at `03fcd5b`. `f6aa8e8`, beneath it, is the RUN 7 WIP
  and is still unverified — RUN 6.8 changed nothing about it.
- `master` is untouched by this work and must stay that way. It moved ahead independently
  (PRs #17 and #18 from `codex/prebaked-motion`); the local `master` here is `c538aa2`, a
  clean ancestor of the remote `39175bd`. Nothing has been merged into or pushed from it.

Checkpoint history, newest first:

```
03fcd5b  RUN 6.8: Break near-humanoid clone appearance
3e9213b  Prepare ChatGPT Work handoff
f6aa8e8  RUN 7 WIP: NPC awareness state machine - NOT verified, NOT complete
b32e5a7  RUN 6 complete: handoff status document
cdb6271  RUN 6.7: near-pool budgets on every tier
09f8841  RUN 6.2: hold the near-humanoid budget at its limit under a real crowd
93085fb  RUN 6.1: stop the shader warm-up polling materials that are already gone
6b1f967  RUN 6: give the nearest citizens the player's body
```

## 3. RUN summary

| RUN | Subject | State |
| --- | --- | --- |
| 0 | Baseline capture | complete |
| 1 | OSS mapping | complete |
| 2 | Humanoid pipeline (Quaternius, CC0) | complete |
| 3 | Vehicle visual fidelity | complete |
| 4 | Locomotion (gait ladder, blends) | complete |
| 5 | Foot IK (player only) | complete |
| 5.5 | Animation audit — the whole candidate pool | complete |
| 5.6 | CMU run retarget POC | complete, not integrated as-is |
| 5.7 | Hybrid run (CMU lower + Quaternius upper) | complete, **adopted** |
| 6 | Near-NPC visual upgrade | **COMPLETE** |
| 6.8 | Near-humanoid clone break | **COMPLETE** |
| 7A | Massive HQ reactive crowd POC | **COMPLETE (POC)** |
| 7B | HQ crowd integrated into Shibuya | **COMPLETE** |
| 7 | NPC life / behaviour states | **WIP ONLY — NOT VERIFIED, NOT COMPLETE** |
| 8 | Melee combat phases | not started |
| 9 | Knockdown / death / recovery | not started |
| 10 | Vehicle enter / exit state machine | not started |
| 11 | Carjacking | not started |
| 12 | Lighting / PBR polish | not started |
| 13 | Performance / stability | not started |
| 14 | Final QA and handoff | not started |

**RUN 7 is not done.** Commit `f6aa8e8` contains a working, unit-tested NPC awareness state
machine that has **never been run in a browser**. It is not reverted and must not be deleted,
but nothing about it has been verified against the live scene — in particular the signal,
crossing and traffic regression check, which is the risk that change actually carries. Treat
it as a starting point to verify, not as finished work. Do not build RUN 8 on top of it.

Each RUN has its own note under `docs/` (`RUN2-…`, `RUN3-…`, `RUN4-…`, `RUN5-…`,
`RUN5-5-…`, `RUN5-6-…`, `RUN5-7-…`). They carry the measurements; this file carries the state.

## 4. Architecture, in one screen

`app/ShibuyaScene.tsx` orchestrates a **module system**: each stage (`ground`, `buildings`,
`heroes`, `station`, `signs`, `streetscape`, `traffic`, `life`, `trains`, `construction`,
`nightglow`) is built asynchronously through a build queue and reports into a startup trace.

Two rules the rest of the code depends on:

- **Physics is the source of truth; visuals follow named anchors.** A `CharacterAsset` or
  `VehicleAsset` exposes anchors, and the figure code positions meshes to them. Keep this
  abstraction — it is what lets a baked figure and a 65-bone humanoid be interchangeable.
- **Prebaking is not optional.** Startup time is a hard constraint. Derived data is baked
  offline (`npm run bake:static`) and loaded, never regenerated at startup.

## 5. Character system

Upstream: **Quaternius Universal Base Characters + Universal Animation Library \[Standard\]**,
CC0-1.0, verified from the bundled `License.txt` and by SHA-256 against independent mirrors
(the official hosts are egress-blocked here; only `github.com` and `raw.githubusercontent.com`
are reachable). Provenance is recorded in `docs/CHARACTER-ASSET-PROVENANCE.md`. Upstream
archives are never committed — `/assets/character/upstream/` is gitignored.

Skeleton: 65 bones, UE naming (`root, pelvis, spine_01..03, neck_01, Head, clavicle/upperarm/
lowerarm/hand_l|r`, fingers, `thigh/calf/foot/ball_l|r`).

**Two facts about this rig that have caused bugs three times each. Read them before touching
bone space:**

- **The skeleton is Z-up in bone space.** `pelvis` rest position is `(0.005, 0.086, 0.877)` —
  the height is the `0.877` on **Z**. Writing a world-space Y into `pelvis.position.y`
  displaces the character *backwards*, and the stats will happily report the displacement you
  asked for. Convert world-down into the parent frame and divide by parent scale.
- **The rig's forward is +Z.** The controller advances by `(sin h, cos h)`.

Variation is a **uniform write, not a second asset**: the garment mask carries skin, top,
bottom, hair and shoes in vertex-colour channels, so recolouring costs no recompile and no
per-body material. Thirty-two unique assets is explicitly not the approach.

## 6. Locomotion

`src/player/locomotion.mjs`. Gameplay speeds are fixed (`PLAYER.walk` 1.5 m/s, `PLAYER.run`
4.2 m/s) and are never moved to suit an animation. A clip is driven at
`period = blended stride / ground speed`.

Constants that encode decisions: `LOCOMOTION.gameplayTop` 4.2, `LOCOMOTION.maxAsymmetry` 0.08
(keeps `Sprint_Loop`, whose contacts are 0.538 not 0.500, out of the gameplay blend),
`LOCOMOTION.minPeriod` 0.62 (0.72 made the feet imply 3.73 m/s at a 4.2 m/s ground speed,
which is foot sliding).

**At a fixed speed, step length and cadence are the same fact** — `step = speed / (spm/60)`.
They are not two things a clip can independently get wrong. At 4.2 m/s, 160–170 spm fixes the
step at 1.48–1.58 m.

## 7. Foot IK

`src/player/foot-ik.mjs`. **Player only.** 13 µs/frame, allocation-free, ~3.9 ground queries
a frame.

Its role is bounded and the boundary is deliberate, stated in the file header and repeated
here because it is the thing most likely to be eroded: **foot IK adapts a correct animation to
the terrain. It does not correct the animation.** If you are adding an absolute-height term to
close a contact number, you are crossing that line. A bad clip pose is an asset problem.

## 8. Hybrid run

`assets/character/hybrid-run.json` (17.8 KiB) — the only CMU-derived artefact in the repo,
carrying provenance for both halves. `scripts/convert-character.mjs` folds it into the `Run`
clip at conversion time, so the runtime sees an ordinary clip: **no second mixer, no second
skeleton, no second SkinnedMesh.**

CMU Graphics Lab Motion Capture Database via the cgspeed BVH conversion: *"CMU places no
restrictions… free for use in research and commercial projects worldwide."* Acknowledgment
requested (mocap.cs.cmu.edu, NSF EIA-0196217), not required.

Lower body is CMU 16_45, within 0.022° of the source across 9 bones × 24 phases (asserted by
`tests/hybrid-clip.test.mjs`); upper body is Quaternius; the hips→spine boundary is corrected.
Gait: stride 2.687 m, speed 3.793 m/s.

**Closed.** Do not reopen run-candidate search, CMU subject search, arm retarget or gait
研究 — RUN 5.7 settled it.

## 9. Near NPCs (RUN 6)

`src/life/near-characters.mjs`. The pool beside the player is **two pools**: the nearest few
wear the same 65-bone humanoid the player wears, the rest keep the offline-baked figure.

```
NEAR_LIMITS     high 32   medium 12   low 4     (total slots)
HUMANOID_LIMITS high  8   medium  4   low 0     (of those, humanoid)
NEAR_IK_LIMITS  high  8   medium  4   low 0     (of those, foot IK)
```

Measured (`qa/gta-upgrade/tierprobe.mjs`, 300 people, 600 frames of churn):

| tier | slots | humanoid | baked | triangles | draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| HIGH | 32 | 8 | 24 | 215k | 168 |
| MEDIUM | 12 | 4 | 8 | 93k | 60 |
| LOW | 4 | 0 | 4 | 15k | 24 |

Per rig, a humanoid is **4.1× the triangles of a baked figure and half the draw calls** —
three meshes against six. What scales here is skinning and bone matrices, not batches.

Three design points that are load-bearing:

1. **A slot's kind comes from the pool's quota, never from a candidate's per-frame rank.**
   Rank churns; keying kind to it makes the pool build a new humanoid every time a holder
   drifts down the list. That shipped once and reached 28 humanoids against a budget of 8.
   Filling the quota first makes the bound structural.
2. **Budget alone is not the goal.** Eight humanoids on the eight furthest people satisfies
   every bound and misses the point. One swap per frame between the furthest-fallen humanoid
   holder and the highest-ranked citizen on a baked figure, with a four-rank hysteresis band,
   moves the aim from 18–35% to 84–85% of the nearest eight.
3. **The humanoid arrives late, exactly as the player's does.** A session that never finishes
   loading it runs on baked figures throughout and nothing waits.

Priority order is unchanged from before RUN 6: combat target, then reacting pedestrian, then
nearest. Body quality follows rank; it does not set it.

### RUN 6.1 — the `isReady` error, root-caused

`TypeError: Cannot read properties of undefined (reading 'isReady')` at city build. It was
**not** caused by RUN 6 (it reproduces with those changes stashed) and it is not three.js
misbehaving.

`WebGLRenderer.compileAsync` polls materials every 10 ms until they report ready, and the poll
has no stop. Each tick reads `properties.get(material).currentProgram`, and `WebGLProperties.
get` returns a fresh empty object for a material it no longer holds — which is what
`deallocateMaterial` leaves behind. Disposing a material mid-wait therefore throws, from
inside a `setTimeout`, where neither the `try/catch` around the call nor the promise's
`.catch` can see it. Every build stage warms up the subtree it just added, and any teardown
disposes those materials.

Reproduced deterministically: tear the page down 4 s into the build and it throws; at 6 s and
8 s, with compilation finished, it does not.

Fixed by owning the warm-up — `src/quality/warmup.mjs`. It drops a material when that material
dispatches its own `dispose` event, treats a vanished property record the same way, cancels
every poll when the owner is disposed, and gives up at a deadline. **Nothing is caught and
nothing is silenced.** `tests/shader-warmup.test.mjs` reproduces the original TypeError
against the unfixed module.

## 9a. RUN 6.8 — near-humanoid clone break

RUN 6 met every criterion it set: humanoid budget held at 8, far crowd 1,978, console errors
0, foot IK bounded, all three tiers within budget. **The visual result was still wrong.**
Eight people who differ only in colour read as one person recoloured eight times, and no
amount of extra palette entries fixes that, because the thing the eye reads is *shape*.

RUN 6.8 gives them different shapes. Evidence, from the same camera:
`node qa/gta-upgrade/lineup.html` — **before: 1 silhouette across eight citizens. After: 4.**
`?before=1` reproduces the RUN 6 appearance model exactly, so the comparison is a comparison.

### Four archetypes, from assets already verified

| archetype | rig | hairstyle | height × | build × |
| --- | --- | --- | ---: | ---: |
| casual | Superhero_Male | `Hair_SimpleParted` | 1.000 | 1.00 |
| long hair | Superhero_Female | `Hair_Long` | 0.955 | 0.95 |
| cropped | Superhero_Male | `Hair_Buzzed` | 1.035 | 1.05 |
| short bob | Superhero_Female | `Hair_SimpleParted` | 0.975 | 0.97 |

Both bodies and all three hairstyles come from the Quaternius pack downloaded and licence-
checked for RUN 2. **No new asset, no new rig, no retargeting.**

### The two rigs do not share a rest pose — this is the load-bearing fact

Bone *names* match, which is all the old single-hairstyle merge ever checked. The rest poses
do not: **64 of 65 bones differ, the upperarms by 7.1 cm and the clavicles by 4.6 cm.**
Binding the female mesh to the male skeleton would have flattened her shoulders by that much.
`qa/gta-upgrade/bindcheck.mjs` prints it.

So each body keeps its own armature, and what is shared is the thing that actually costs:
**one set of AnimationClips**. Clip tracks address bones by name, so one clip array drives
either rig and a mixer binds it to whichever root its instance has. Four archetypes cost four
bodies' worth of geometry and **one** animation library.

### Two things glTF does that will break this if undone

1. **It strips punctuation from node names and suffixes duplicates.** `rig:m` came back as
   `rigm`, and the second rig's hair as `hairHair_Long_1`. Matching is therefore done on
   `userData`, which survives as glTF `extras`.
2. **It renames the second armature's bones** — `pelvis_1`, `thigh_l_1`, … Since a mixer
   resolves tracks by name and foot IK looks its joint chain up by name, the female rig would
   have silently animated nothing. The names are restored **by index** at load (bone order is
   identical and checked at bake time; a pattern would be guesswork, as `spine_01` and
   `index_01_l` already end in digits). Safe because a name only has to be unique within the
   tree it is resolved against, and an instance clones exactly one rig.

Hair is a separate mesh now rather than merged into the body: merging stores a whole body per
hairstyle, separate meshes let the exporter keep each body once and each hairstyle once.

### Appearance is a pure function of the pedestrian id

`src/life/appearance.mjs`. Archetype, skin, hair colour, top, bottom, shoes, height and build
all come from one well-mixed hash read at disjoint bit ranges, so the choices do not
correlate — reading several with `id % n` gives visible repeating runs down a pavement.

**Nothing comes from the pool, the frame, the tier, or the neighbours.** The pool recycles
slots constantly and reorders every frame; anything reading from it would make people change
clothes as the camera moves, which is worse than the clone problem. Walk away from someone
and walk back and they are the same person.

The one exception is `deduplicate`, and it is bounded: among the handful on screen it may move
a **shirt colour** and nothing else, walking them in ascending id so the same set of people
always gives the same answer whatever order the pool holds them in. Silhouette is never
negotiated at runtime.

### Slot allocation — a fixed spread, not demand chasing

Humanoid slots hold a round-robin spread: two of each archetype at HIGH, one at MEDIUM. Every
archetype is therefore on screen whenever the slots are full.

The first version chased demand — rebuild whichever spare slot the crowd currently wanted. At
300 people the near radius churns faster than that can settle: it converged on **two**
archetypes visible out of four, after fifty rebuilds. The fixed spread needs none.

A citizen takes a humanoid of their **own** archetype or a baked figure, never someone else's
silhouette. That costs aim — the RUN 6 swap that pulled good bodies toward the camera had to
become a swap *between people of the same archetype*, and nearest-eight coverage settles at
**71–74%** against RUN 6's 84–85%. A baked figure at four metres is a smaller lie than the
same face on a different body.

### Skeletons per body: 3 → 1

`SkeletonUtils.clone` gives every SkinnedMesh its own `Skeleton`, each owning a bone matrix
texture, although they share one set of bones. A citizen was paying for three and would have
paid for four once hair was split out. They are collapsed onto one.

### Measured

| | RUN 6 | RUN 6.8 |
| --- | ---: | ---: |
| archetypes on screen | 1 | **4** |
| humanoid budget (HIGH / MED / LOW) | 8 / 4 / 0 | 8 / 4 / 0 |
| near baked (HIGH) | 24 | 24 |
| far crowd | 1,978 | 1,978 |
| skeletons per humanoid | 3 | **1** |
| mixers per humanoid | 1 | 1 |
| meshes per humanoid | 3 | 4 |
| pool draw calls (HIGH) | 168 | 176 |
| pool triangles (HIGH) | 215k | 215k |
| slot rebuilds over 900 frames | — | 0 |
| foot IK | 8 | 8 |
| console errors | 0 | **0** |

Feet, with no IK, against a flat floor — the pre-existing Run float is neither introduced nor
worsened:

| clip | RUN 6 | RUN 6.8 (same body) | RUN 6.8 (all four archetypes) |
| --- | ---: | ---: | ---: |
| Idle | −8.3 mm | −8.2 mm | −8.6 … −4.7 mm |
| Walk | −7.5 mm | −7.4 mm | −7.8 … −2.3 mm |
| Run | 61.3 mm | 60.3 mm | 58.3 … 71.2 mm |

Payload:

```
RUN 6    citizen.glb  1,414,612 B   1 body,  1 hairstyle, 15 clips
RUN 6.8  citizen.glb  2,260,380 B   2 bodies, 3 hairstyles, 15 clips SHARED   (1.60x)
naive 4 separate character files   ~5,658,448 B                               (2.50x)
saved by sharing the clip library  ~3,398,068 B
```

### What RUN 6.8 deliberately did not do

No clothing geometry — no skirts, jackets, hoodies or bags. The garment mask paints clothes
onto the body; a skirt is a mesh, and meshes are new assets. No accessories, no faces beyond
the two the base bodies have, no clothing physics. The reference image this run was measured
against shows all of those; they are a future asset question, not a distribution one.

## 9b. RUN 7A — massive high-fidelity reactive crowd (POC)

The question RUN 7A had to answer: can a scramble crossing hold ~2,000 people who all look
like RUN 6.8 citizens **and** can all react to a car, without a skeleton each?

**Yes.** 1,978 of them, in a browser, cost **4 draw calls, 0 skeletons, 0 mixers and 0.3 ms
of CPU per frame.**

### Architecture: a shared GPU bone animation atlas

Chosen by measuring the alternatives, not by preference:

| candidate | payload | verdict |
| --- | --- | --- |
| Vertex animation texture | 5.5 MiB per archetype (22 MiB for four) | rejected — 60× the size |
| **Bone matrix atlas** | **618 KiB total, shared by every archetype** | **chosen** |
| Baked vertex frames | same order as VAT | rejected |
| Extend the old primitive crowd | cheap, but the bodies stay capsules | rejected |

A VAT stores every vertex at every frame. A bone atlas stores every *bone* at every frame —
65 bones × 203 rows × a 4×3 matrix — and works precisely because RUN 6.8 already gave every
archetype **one shared clip set**; they differ only in which vertices hang off those bones.

What that buys:

- **No `Skeleton` and no `AnimationMixer` per citizen, at any population.** A test asserts it.
- Clip and phase live in instanced attributes; the vertex shader turns them into an atlas row
  and skins from it. **Time advances on the GPU**, so a walking crowd costs the CPU nothing
  between state changes.
- **Draw calls follow the archetype count, not the population** — four meshes, two thousand
  people.
- State is typed arrays. A citizen is an index, not an object graph.

### The ladder (STEP 7 / 20)

CPU per frame, Node, `qa/gta-upgrade/hq-ladder.mjs`:

| citizens | update ms | µs/citizen | draws | tris (L1) | tris (L2) | heap |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 32 | 0.077 | 2.41 | 4 | 176k | 73k | 0.5 MB |
| 128 | 0.056 | 0.44 | 4 | 701k | 290k | 0.6 MB |
| 256 | 0.081 | 0.32 | 4 | 1.39M | 574k | 2.0 MB |
| 512 | 0.134 | 0.27 | 4 | 2.73M | 1.13M | 1.9 MB |
| 1024 | 0.298 | 0.29 | 4 | 5.51M | 2.27M | 1.8 MB |
| **1978** | **0.519** | **0.26** | **4** | 10.7M | **4.41M** | 1.8 MB |

Per-citizen cost is **flat in the population** (0.26–0.44 µs), which is the property that
matters: nothing here is O(N²) or allocating per person.

**PLATINUM and the ~1978 target are both reached** on the CPU side. The remaining limit is
GPU vertex throughput, not this code — which is why the LODs exist (L2 is 14% of L0's
triangles). SwiftShader frame rates are recorded in the bench and are explicitly **not** used
as acceptance, per the project rule.

### Mass reaction (STEP 9–13)

A car at 14 m/s through 1,978 in a dense block, **simultaneously**:

```
200 looking   286 fleeing   37 down        <- at the same instant, not cumulative
172 knocked down in ONE frame, in 0.45 ms
```

The requirement was twenty. In the browser, 1,200 with a car running through them holds 188
looking and 104 fleeing at 6 draw calls and 0.3 ms.

The spatial grid is why that is affordable, and the claim is checked: the same population
queried at four densities gives 1369 → 625 → 289 → 121 candidates. **Cost follows the radius
and the density, never the population.**

Knockdown is an impulse, a drag and a ground clamp — no rigid body, no ragdoll. Which side of
the car's centreline a body is caught on decides where it goes, so a row of people is not a
row of dominoes, and a test pins that.

**Identity survives everything.** Appearance, archetype, phase and height are the same
function of the pedestrian id used by RUN 6.8, so being hit by a car cannot change who
someone is — asserted directly.

### Three things found by looking rather than reasoning

- **The first bake gave everyone claws.** Forty of the sixty-five bones are finger joints;
  their vertices are dense and adjacent, and vertex clustering merged them into one
  representative carrying a single finger's weights. Finger weights are now folded into the
  hand before decimating.
- **The crowd looked bare-legged.** The garment mask was correct; the palette was not. Beige
  trousers read as skin when a hem is four vertices wide at LOD2. Every trouser colour is now
  darker than every skin tone, pinned by a luminance test.
- **three's `SimplifyModifier` is unusable here** — it keeps position, normal and uv and
  discards exactly the skin indices and garment mask this crowd is built on. Hence the
  attribute-preserving clustering decimator in the baker.

### Payload and startup

```
public/data/crowd/hq-crowd.bin   2,761 KiB
  bone atlas                       618 KiB   shared by all four archetypes
  geometry, 4 archetypes x 3 LODs  2,143 KiB
build 1,978 citizens at runtime        ~9 ms
```

Everything is baked offline by **`npm run bake:crowd-hq`**. Nothing is generated at startup,
which is the constraint the old crowd's fast start depends on.

### What RUN 7A is not

A POC. It is **not wired into the live Shibuya scene** — it runs in `qa/gta-upgrade/
hqcrowd.html` against its own crowd. Integration with the real pedestrian simulation, the
crossing queues and the signal groups is RUN 7 proper. The RUN 7 awareness WIP was not
touched.

## 9c. RUN 7B — the HQ crowd in the real Shibuya scene

RUN 7A proved the architecture in its own bench. RUN 7B connects it to the game, and **all
1,978 pedestrians in the crossing now carry a high-fidelity body.**

### The rule the integration is built on

**The simulation is the source of truth.** `src/life/hq-layer.mjs` READS `sim.pool`. Position,
heading, speed, route, crossing membership, queue membership and signal group all stay in
`src/life/simulation.mjs`. The layer changes what a pedestrian *looks like* and nothing else —
a test asserts that a sync pass leaves `crossing`, `queueKey`, `edge`, `route`, `x` and `z`
untouched.

One bounded exception: a body thrown by a car is moved by the reaction system for the length
of its knockdown, because it is not walking anywhere. `onDisown` / `onReclaim` hand that
authority over and back, and the scene uses the simulation's own `leave()` so a crossing is
**released**, never abandoned.

`?hq=` switches the renderer (`hq=1` tier default, `hq=512` a budget, absent for legacy), so
the legacy instanced bodies remain a one-parameter rollback. Both renderers share one mask:
the ids the HQ layer draws are unioned with the near-character pool's and skipped in the
legacy meshes, so nobody is drawn twice.

### The integration ladder, measured in the scene

HIGH / day / scramble, each rung a separate build:

| budget | drawn / held | dup | crowd draws | scene draws | HQ tris | skel / mix | sync | errors |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 128 | 128 / 128 | OK | 4 | 367 | 492k | 0 / 0 | 0.9 ms | 0 |
| 256 | 256 / 256 | OK | 4 | 367 | 566k | 0 / 0 | 1.1 ms | 0 |
| 512 | 512 / 512 | OK | 4 | 365 | 1.14M | 0 / 0 | 2.4 ms | 0 |
| 1024 | 1024 / 1024 | OK | 4 | 367 | 2.28M | 0 / 0 | 1.9 ms | 0 |
| **1978** | **1978 / 1978** | **OK** | **4** | **341** | **4.41M** | **0 / 0** | **2.3 ms** | **0** |

**The scene's draw call count goes DOWN** — 341 against legacy's 367 — because four instanced
lanes replace thirteen legacy instanced meshes. There is still no `Skeleton` and no
`AnimationMixer` at any rung.

`sync` is the layer's own cost: it ranks all ~1,978 pedestrians by distance to spend the
budget nearest the camera. That ranking, not the drawing, is where its 2.3 ms goes, and it is
the clearest remaining CPU target.

In player mode at full budget: 1,975 drawn, 23 at L0 and 1,952 at L2, 8 draw calls (four
archetypes across the two levels in use).

### LOD, and not popping

Three bands with hysteresis — L0 ≤14 m (released at 17), L1 ≤38 m (released at 44), L2 beyond
— reviewed four times a second, at most 24 moves a frame.

A camera swept across every band for 400 frames (`qa/gta-upgrade/lodpop.mjs`) produced
**8,611 level-of-detail changes** with all three levels in use and **zero** changes to body,
hairstyle, height, build, walk phase or archetype. A lane change carries the citizen's
palette, phase and clip with them, so detail is the only thing distance can alter. A test
pins it.

### The real vehicle, in the real crossing

The player's own car — the same one that already calls `alertPedestrians` — hands its state to
the layer, which runs RUN 7A's bounded query over the pedestrians it is drawing.

```
peak        265 reacting + 49 down SIMULTANEOUSLY
sustained   218 reacting + 95 down
query       413 candidates of 1,945 (21%), 0.4 ms
disowned    25 bodies under the reaction system at once
```

The requirement was twenty.

### Crossings and signals survive it

Thirty seconds of simulation after driving through the crowd — the check that matters more
than the spectacle:

```
crossings completed   29 -> 40      queue size    0
abandoned crossings    0            stuck         0
population         1,977 (steady)   console errors 0
```

The signals keep running and nothing locks. **Not claimed:** a full signal cycle was not
observed. The cycle is 108 s with a 20 s pedestrian phase, and the sim clock runs about 0.75×
wall under SwiftShader, so a 30 s sample covers roughly 22 s of simulation and sat inside one
pedestrian window.

### Two defects found by looking, not by measuring

- **The crowd held 224 citizens while drawing 128.** A citizen that fell out of the budget was
  never released: still rendered, no longer positioned — a frozen body standing beside the
  legacy pedestrian it was meant to replace, which is exactly the duplicate-crowd failure this
  integration must not have. It only appears when the nearest set keeps changing, which a
  static bench never does. `release()` now swap-removes from both the lane and the state
  arrays, and a test drives a moving camera over 900 people asserting population never exceeds
  what is drawn.
- **The HQ bodies read washed out in the scene, and this is NOT fixed.** The crowd material
  did have one flat roughness where RUN 6.8 gives each garment its own, so skin, cotton,
  denim, hair and a shoe were all the same plastic; that is corrected and is an improvement on
  its own. **It did not fix the wash-out.** The cause is now isolated rather than guessed: the
  identical palette and shader render correctly in `qa/gta-upgrade/hqcrowd.html` — dark
  trousers, distinct tops, varied skin — and only go pale in the scene, so it is the scene's
  environment, tone mapping, exposure or fog acting on the crowd material, not the crowd
  material itself. Carried into RUN 7C. See the limitations in §18.

### Quality tiers

`HQ_TIER_BUDGET` is HIGH 1978, MEDIUM 512, LOW 0. LOW keeps the legacy crowd entirely, which
is why the legacy renderer is worth keeping beyond this run.

## 10–15. Not yet implemented

NPC behaviour (RUN 7 — **WIP only, see below**), melee combat (8), knockdown (9), vehicle
enter/exit (10), carjacking (11), lighting polish (12), performance pass (13), final QA (14).

### RUN 7, precisely

Commit `f6aa8e8` adds `src/life/awareness.mjs`: a seven-state perception machine
(calm / look / startle / avoid / flee / recover) driven by player proximity and speed, combat,
downed bodies, and the existing oncoming-car reaction, which it **consumes as an input rather
than duplicating**. It has minimum state durations, downward-only hysteresis, a per-citizen
reaction delay, and a post-recovery cooldown. Traits come from the citizen id rather than
storage, because the pool is recycled. Alarm spreads across a 3×3 cell ring and decays, capped
below the evasion threshold so second-hand alarm can turn a head but cannot start a stampede —
there is no global trigger. It moves nobody: the only motion primitive is the simulation's own
`scatter`, and nothing in it touches `crossing`, `edge`, `route` or queue state.

`tests/npc-awareness.test.mjs` has 10 passing tests, including one asserting that a reaction
never mutates crossing or signal state.

**What has not been done, and why it is not complete:**

- it has never been loaded in a browser
- no signal / crossing / traffic regression check — the exact risk this change carries
- no screenshots, no in-scene metrics
- no acceptance judgement against RUN 7's own criteria

Do not treat the passing tests as verification. Do not build RUN 8 on it. Do not revert it.

## 16. Metrics at the close of RUN 6

Scene, HIGH / day / scramble, headless SwiftShader:

| | build only | player mode, near pool full |
| --- | ---: | ---: |
| draw calls | 357 | 721 |
| triangles | 4,167,735 | 4,572,118 |
| far crowd | 1,978 | 1,978 |
| near humanoids | — | 8 |
| near baked | — | 23 |
| foot IK solvers | — | 8 (+ player) |
| console errors | **0** | **0** |

### Test / build status at the handoff (HEAD `f6aa8e8`)

```
npm run typecheck   clean
npm run test:ci     273 / 273 pass
npm run build       succeeds
```

**273 passing tests does not mean RUN 7 is complete.** Ten of those tests are the RUN 7 WIP's
own unit tests. They exercise the state machine in isolation against a stub crowd; they say
nothing about whether the live scene still runs its signals and crossings correctly with
awareness wired in, which is the check that has not been done. RUN 6's own figure was 254/254.

**SwiftShader FPS is not a performance acceptance signal** and is not used as one. Geometry,
proportions, pose, material and visual bugs are reviewed from screenshots.

## 16a. Bugs already solved — do not reintroduce

Each of these cost real time to find. They are recorded so the next session recognises the
symptom instead of rediscovering the cause.

**`isReady` TypeError at city build.** `compileAsync` polls materials every 10 ms with no
stop; `WebGLProperties.get` returns a fresh empty object for a material that has been
disposed, so the next tick reads `undefined.isReady()` — thrown inside a `setTimeout` where
neither the surrounding `try/catch` nor the promise's `.catch` can see it. Every build stage
warms up the subtree it just added, and any teardown disposes those materials. Root-caused by
reproducing it deterministically (teardown at 4 s throws, at 6 s and 8 s does not) and fixed
by owning the warm-up in `src/quality/warmup.mjs`.
**Do not reintroduce a suppression workaround** — no try/catch swallow, no console filter, no
deleting `compileAsync`, no reducing humanoid count to dodge it.

**Humanoid budget exceeded: 28 generated against a budget of 8.** The slot's *kind* was chosen
from the rank of whichever candidate was asking, and rank churns every frame — a citizen who
was third-nearest kept its humanoid while drifting to twentieth, so the new third-nearest
built another. Only visible at crowd density (40 people never reproduced it; 300 did). Fixed
by taking kind from the pool's own quota, which makes the bound structural.

**Hybrid Run reintroduced foot sliding.** `LOCOMOTION.minPeriod` at 0.72 clamped the gait so
the feet implied 3.73 m/s against a 4.2 m/s ground speed. Fixed by lowering it to 0.62.

**Sprint re-entered the gameplay blend.** RUN 4's exclusion of `Sprint_Loop` held only
arithmetically, and the new Run native speed let it back in. The intent is that an
*asymmetric* clip (contacts at 0.538, not 0.500) is never blended into normal locomotion;
`LOCOMOTION.maxAsymmetry` now expresses that directly rather than relying on a speed
threshold. Two speed-only filters were tried first and each broke a different configuration.

**Pelvis displaced backwards instead of down, three separate times.** The skeleton is Z-up in
bone space. See §5 — this is the single most repeated mistake in this project.

## 17. Files that matter

| Path | What it is |
| --- | --- |
| `app/ShibuyaScene.tsx` | orchestration, module system, QA metrics |
| `src/life/near-characters.mjs` | the near pool — humanoid/baked split, budgets |
| `src/life/render.mjs` | instanced far crowd, near-pool wiring |
| `src/player/figure.mjs` | `createPlayerFigure`, `bakedAsset` |
| `src/player/character-asset.mjs` | `humanoidCitizen`, `WARDROBE` |
| `src/player/locomotion.mjs` | gait ladder and blending |
| `src/player/foot-ik.mjs` | the solver, and its bounded role |
| `src/quality/warmup.mjs` | cancellable shader warm-up (RUN 6.1) |
| `scripts/convert-character.mjs` | offline character bake, folds in the hybrid run |
| `assets/character/hybrid-run.json` | the adopted run clip + provenance |
| `src/life/appearance.mjs` | **RUN 6.8** — the deterministic appearance recipe |
| `src/life/hq-crowd.mjs` | **RUN 7A** — the GPU crowd: no skeleton, no mixer, typed arrays |
| `src/life/hq-layer.mjs` | **RUN 7B** — the bridge: reads the simulation, draws the crowd |
| `tests/hq-layer.test.mjs` | pins source-of-truth, no duplicates, identity, LOD, mass hits |
| `qa/gta-upgrade/lodpop.mjs` | LOD popping QA |
| `src/life/hq-threat.mjs` | **RUN 7A** — spatial grid + mass vehicle reaction |
| `scripts/bake-crowd-hq.mjs` | **RUN 7A** — offline bake: LOD geometry + bone atlas |
| `tests/hq-crowd.test.mjs` | pins no-skeleton, draw calls, identity, multi-hit, query bound |
| `qa/gta-upgrade/hqcrowd.html` | the HQ crowd bench, with a vehicle mode |
| `qa/gta-upgrade/hq-ladder.mjs` | the scale ladder |
| `qa/gta-upgrade/hq-vehicle.mjs` | the mass reaction measurement |
| `src/life/awareness.mjs` | **RUN 7 WIP** — NPC perception / life states, unverified |
| `src/life/simulation.mjs` | crowd sim: routes, crossings, `scatter`, `strike`, signals |
| `src/player/controller.mjs` | player movement and input |
| `src/player/combat.mjs` | melee, health, damage |
| `src/player/vehicle-transition.mjs` | enter / exit sequencing (RUN 10 target) |
| `src/player/vehicle-dynamics.mjs` | driving model |
| `src/player/pedestrian-threat.mjs` | oncoming-car prediction; feeds awareness |
| `tests/npc-awareness.test.mjs` | **RUN 7 WIP** — 10 tests, passing, browser-unverified |
| `tests/shader-warmup.test.mjs` | pins the `isReady` regression |
| `tests/near-humanoid.test.mjs` | pins the near-pool budgets at 300-person density |
| `qa/gta-upgrade/asset-audit.mjs` | what the citizen asset contains |
| `qa/gta-upgrade/bindcheck.mjs` | rest-pose comparison across rigs — why two armatures |
| `qa/gta-upgrade/lineup.html` | the RUN 6.8 acceptance shot; `?before=1` for RUN 6 |
| `qa/gta-upgrade/archetype-feet.mjs` | sole height per archetype per clip |
| `tests/appearance.test.mjs` | pins the recipe: pure, spread, bounded, non-correlated |
| `qa/gta-upgrade/poolprobe.mjs` | near-pool budget and aim under churn |
| `qa/gta-upgrade/tierprobe.mjs` | budgets across HIGH / MEDIUM / LOW, and tier demotion |
| `qa/gta-upgrade/` | the other benches; the numbers above come from here |
| `scripts/test-current.mjs` | the test list that gates this work |

## 18. Known limitations

- **No clothing geometry.** RUN 6.8 gave the near citizens four silhouettes, but clothes are
  still painted onto the body by the garment mask. No skirts, jackets, hoodies, bags, caps or
  glasses — each of those is a mesh, and meshes are new assets. This is the largest remaining
  gap against the reference image.
- **Two faces.** The archetypes share the two base bodies' heads. At close range the faces
  repeat.
- **The mass crowd has no foot IK.** It plays baked clips on a flat assumption; terrain
  adaptation at that count is unmeasured. The RUN 6.8 near pool still has it.
- **The layer ranks all ~1,978 pedestrians by distance every frame** to spend its budget
  nearest the camera — about 2.3 ms, and the clearest remaining CPU target. Re-ranking on a
  slower cadence would cut most of it.
- **A full 108-second signal cycle has not been observed under load**, only that crossings keep
  completing with nothing abandoned or stuck across 30 seconds.
- **RUN 7 behaviour proper is still not done.** The awareness WIP at `f6aa8e8` remains
  unverified; RUN 7B connected the crowd, not the NPC minds.
- **The HQ crowd looks washed out in the scene.** Functionally complete and visually wrong:
  the bodies are pale against the RUN 6.8 near characters beside them. The same palette and
  shader are correct in the bench, so the cause is the scene's environment / tone mapping /
  exposure / fog, not the material. **This is the first thing RUN 7C should fix** — it is the
  gap between "1,978 high-fidelity bodies" and "1,978 bodies that look right".
- **The garment boundary softens at LOD2.** Decimation blurs the mask, so a sleeve fades into
  the arm over several centimetres. Acceptable at the distance L2 is used, visible if L2 is
  ever brought close.
- **Near-humanoid aim is 71–74%**, down from RUN 6's 84–85%: a citizen only takes a humanoid
  of their own archetype, so when three of the nearest share one archetype the third waits on
  a baked figure. Deliberate — see §9a.
- The body is Quaternius' Superhero base. Proportions are stylised and the face is minimal.
  It is a pipeline placeholder and is deliberately not polished — but "not the final asset"
  is not a defence of the clone problem, which is a distribution problem, not a quality one.
- **RUN 7 is unverified.** `src/life/awareness.mjs` is wired into the live crowd at HEAD and
  has never been run in a browser. If the next session is not doing RUN 7, it should still be
  aware that HEAD contains untested code on the crowd path. RUN 6.8 did not touch it.
- `hit` is still a **C**: the current `Hit` clip barely moves. `Hit_Knockback` in Quaternius
  UAL2 (CC0, verified, identical 65-bone skeleton, 2.93 m of travel) is very likely the answer
  and needs no retargeting. Not implemented — RUN 5.5 was the Run slot only.
- LOW and MEDIUM prebake coverage is incomplete — see
  `docs/ISSUE-LOW-TIER-PREBAKE-2026-09-20.md`. RUN 13 is where this is scheduled.
- Foot IK is player-only in the solver's *design intent*; RUN 6 gives it to up to 8 near
  humanoids under an explicit budget. Beyond that is unmeasured.
- `npm run test:legacy` is an audit tool, not a merge gate.

## 19. Optional future polish

Hit reaction from UAL2. Facial detail if the base body is ever replaced. Crowd wardrobe
beyond eight entries. None of these are blockers.

## 20. How to resume

```powershell
git switch claude/gta-fidelity-upgrade
git pull --ff-only origin claude/gta-fidelity-upgrade
npm ci
npm run typecheck
node scripts/test-current.mjs
npm run dev:local
```

Then open `http://127.0.0.1:5174/?qa=1&tier=high&time=day&camera=scramble`.

`window.__SHIBUYA_QA__.metrics` carries the numbers in the table above, including
`nearCharacters`, which is the near pool's own `inspect()`. In player mode
`window.__SHIBUYA_FIGURE__`, `__SHIBUYA_PLAYER__` and `__SHIBUYA_CTX__` are exposed.

**Start at RUN 6.8, not RUN 7.** See §9a for why, what the asset audit found, and what the
acceptance criteria are. `docs/CHATGPT-WORK-RESUME.md` is the short version to work from.

Work one RUN at a time and close each one completely — implement, unit test, verify in a real
browser, capture screenshots and numbers, check for regressions, commit, push, update this
file — and stop and report before opening the next. Do not start RUN 7 (or verify the RUN 7
WIP) until RUN 6.8 is accepted.

### The rules that are not negotiable

- Stay on `claude/gta-fidelity-upgrade`. Never merge to or push `master`.
- No `reset`, `rebase`, `force push`, or history rewriting. Do not revert `f6aa8e8`.
- Do not drop a stash you did not create.
- No engine rewrite, no React-Three-Fiber, no Rapier, no skeletons for the full ~2,000 crowd.
- No GTA V assets, source or leaks. No asset whose licence has not been verified **from the
  bundled licence file**, not from a web page.
- Do not reopen run-clip search, CMU subject search, arm retargeting, or gait research.
