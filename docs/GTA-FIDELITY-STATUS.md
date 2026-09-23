# GTA Fidelity Master Plan — status and handoff

The one document to read when resuming this work with no conversation history. Read
`AGENTS.md` and `CLAUDE.md` first for the repository rules, then this.

**Updated at the close of RUN 7C.** RUNs 0–6, 6.8, 7A, 7B and 7C are complete. RUN 7 proper —
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
- RUN 10.1 handoff HEAD: **`76dc411`**. RUN 10.2–10.5 follow it on this branch; RUN 11 starts
  from `b037bc8` (§9h). Use `git log -1` for the current HEAD. Older HEAD lines and the old
  roadmap lower in this document are historical snapshots and are superseded by §9g.
- RUN 8 and RUN 9 are complete. The old RUN 7 WIP at `f6aa8e8` was found active in production
  and replaced by the single HQ authority in RUN 10.1.
- `master` is untouched by this work and must stay that way. It moved ahead independently
  (PRs #17 and #18 from `codex/prebaked-motion`); the local `master` here is `c538aa2`, a
  clean ancestor of the remote `39175bd`. Nothing has been merged into or pushed from it.

Checkpoint history, newest first:

```
cd5c1bb  RUN 8.4: let a punch reach the crowd it is standing in
986429c  RUN 8.3: pin crossing-safe combat and the death loop against the real controller
04ca156  RUN 8.2: stop the vehicle shadow shader redeclaring what three.js injects
01f57d1  RUN 8.1: melee lands when the fist arrives, not when the button is pressed
9a2e62a  RUN 7C complete: document the colour space fix and the knockdown chain
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
| 7C | HQ crowd colour / lighting integration | **COMPLETE** |
| 7 | Historical NPC awareness WIP | superseded in RUN 10.1; never a second production authority |
| 8 | Melee combat phases + mass crowd reaction | **COMPLETE** |
| 9 | Vehicle occupancy / enter-exit / carjacking | **COMPLETE** |
| 10 | NPC life / awareness consolidation | complete: browser acceptance closed 2026-09-23 (§9g) |
| 11 | Visual / audio / GTA feel polish | **COMPLETE** 2026-09-23 (§9h) |
| 12 | Lighting / PBR polish | not started |
| 13 | Performance / stability | not started |
| 14 | Final QA and handoff | not started |

**Current authority:** `src/life/hq-awareness.mjs` (RUN 10.1 onward). The old
`src/life/awareness.mjs` is deprecated historical code with no production import. The RUN 7
notes below describe the old state at that time, not a second running system.

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

## 9d. RUN 7C — the HQ crowd's colour space

RUN 7B put 1,978 high-fidelity bodies in the crossing and they looked washed out. RUN 7C is
why, and the answer is one line of shader.

### Root cause

`ColorManagement` is enabled, so the renderer's working space is **linear**. The RUN 6.8 near
characters pass their palette through `new THREE.Color(hex)`, which applies sRGB → linear for
them — which is exactly why they were correct in the scene all along. The HQ crowd packs its
palette as an 8-bit sRGB hex and divided it by 255, handing **sRGB values straight to
`diffuseColor` in a linear pipeline**.

The error is not uniform, and that is the entire symptom:

| colour | correct (linear) | HQ used | error |
| --- | ---: | ---: | ---: |
| `#1c2028` dark navy trousers | 0.0116 | 0.1098 | **9.5×** |
| `#2a2f38` | 0.0232 | 0.1647 | 7.1× |
| `#3a414c` | 0.0423 | 0.2275 | 5.4× |
| `#6b7280` mid grey | 0.1470 | 0.4196 | 2.9× |
| `#e7e3da` cream top | 0.7991 | 0.9059 | 1.1× |

Dark clothing was up to **9.5× too bright** while light clothing was nearly right. Dark
trousers stopped reading as dark, every tone trended pale, and the crowd lost its separation.

**Why the bench looked correct.** With dim lighting, no tone mapping and no environment, an
over-bright albedo still lands low enough in the final image to read as clothing. Under the
scene's exposure and environment it saturates toward white. The bench was not disproving the
bug; it was hiding it.

### The fix

three's own `SRGBToLinear` applied inside `unpackRGB`, verified to deviate from `THREE.Color`
by **0.000e+0 across the entire colour cube**.

Done in the shader rather than at pack time on purpose: a linear value for a dark colour is
about 0.012, and eight bits of that is three levels, which would band. Eight bits of sRGB
expanded in the shader is what an sRGB texture does, and it puts the precision where the eye
needs it.

**Cost: none.** No extra draw call, no extra uniform, no extra texture — a few ALU operations
in a shader that was already running.

### Hypotheses tested and rejected

- **Scene exposure / global tone mapping.** Rejected on principle before testing: the Shibuya
  environment already works, and darkening the whole scene to hide a crowd bug would damage
  buildings, signage and vehicles to fix pedestrians.
- **Per-garment roughness.** A real mismatch — the crowd had one flat roughness where RUN 6.8
  gives each garment its own — and worth correcting on its own, but it demonstrably did not
  fix the wash-out. I said in a commit that it had; that was wrong and was withdrawn.
- **Fog, environment intensity, bloom.** Never reached: the numeric comparison against
  `THREE.Color` identified the cause outright.

### Also found here: the knockdown chain never closed

The full-signal-cycle harness (`qa/gta-upgrade/signalcycle.mjs`, 240 simulated seconds at
30 Hz, covering all four phases of the 108-second cycle) found what a 30-second scene test
could not: **132 bodies permanently DOWNED and permanently disowned from their own routes.**
`DOWNED` was excluded from the state fall-through on the theory that it "waits to be
recovered", and nothing recovered it.

The chain now closes: **HIT → KNOCKDOWN → DOWNED → RECOVER → NORMAL.** Ownership is reconciled
from `sync` as well as from `vehicle`, because a body stands up on its own timer and the
player may have parked by then.

Telling a steady state from a leak requires removing the cause, so the harness drives for half
the run and parks for the rest. A car that never stops *should* hold a steady population on
the ground; that is not a leak. With the car parked:

```
132 disowned -> 0 in 2.9 s      crowd returns to 1,978 NORMAL
population steady at 1,978      non-finite values 0
signal phases covered           NS, ALL, EW, PEDESTRIAN (full 108 s cycle)
peak reacting 459               peak down 132
```

And a metric that lied: `inspect()` recomputed its reacting and down counts only inside
`vehicle`, so the moment the player parked it kept returning the figures from the last
drive-by. My own new test believed it and reported 67 citizens on the ground when none were.
The counts are now recomputed on every sync.

### Day and night

| | HQ drawn | byLod | crowd draws | scene draws | skel / mix | sync | errors |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| day | 1,974 | L0 23 / L2 1,951 | 8 | 359 | 0 / 0 | 1.5 ms | 0 |
| night | 1,974 | L0 23 / L2 1,951 | 8 | 367 | 0 / 0 | 2.7 ms | 0 |

**Day:** hair reads black, tops separate (white, navy, teal, red, cream), skin separates from
clothing, archetypes are readable, and the RUN 6.8 near characters now blend in instead of
being the only coloured bodies in frame.

**Night:** the crowd is not white, dark clothing reads dark without crushing, skin stays warm
rather than grey, and the bodies sit naturally in the billboard lighting. Day was not altered
to achieve it — the fix is in the crowd's own shader, and nothing scene-wide was touched.

**LOD colour consistency:** L0→L1 differs by a mean of 7.1/255 over the whole frame and L1→L2
by 12.1/255, and those deltas are dominated by silhouette edges moving under decimation rather
than tone. Structurally the colour cannot shift with detail: every lane shares one shader, and
`moveLane` copies the per-instance palette across.

### Scale preserved

1,974–1,978 HQ pedestrians, 0 skeletons, 0 mixers, 4 crowd lanes (8 draw calls with two LODs
in use), offline prebake unchanged, 295/295 tests, typecheck and build clean.

## 9e. RUN 8 — melee with a hit window

The old melee applied damage in the same tick as the input: `request()` set a flag, the next
update chose a target and subtracted health, and `attackTime` was only a countdown for the
renderer. A punch could land before the arm moved, and **could not miss** — anyone in range at
the press was hit.

### Attack state machine

`IDLE → WINDUP → ACTIVE → RECOVERY → IDLE`. A swing is an object with a clock; the hit test
runs inside the clip's own active window, at most once per swing. A press during recovery is
dropped rather than queued — there is no input buffering, so you cannot punch faster than the
arm moves.

### The timings are measured, not chosen

`qa/gta-upgrade/punch-timing.mjs` samples each clip at 120 steps, finds which hand travels
furthest from the pelvis, and reads the window where that hand is within 12% of full
extension — the part of the swing where a fist would be touching someone.

| clip | duration | hand | wind-up | **ACTIVE** | recovery | peak |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `Punch` | 0.867 s | LEFT | 0–0.188 | **0.188–0.368** | 0.368–0.867 | 0.202 |
| `PunchCross` | 1.000 s | RIGHT | 0–0.233 | **0.233–0.508** | 0.508–1.000 | 0.400 |

They turn out to be a natural one-two — a left jab and a right cross — so alternating them
reads as combination punching rather than the same arm twice. That is a property of the clips,
found by measuring. `PunchCross` was baked and unused until this run.

### Crossing the window, not landing in it

The hit test asks whether the **step crossed** the active window, not whether it landed inside
it. A frame long enough to step over a 180 ms window would otherwise skip the punch entirely.
At 60 Hz that never happens, but a stall, a background tab, or a test on coarse steps all
produce it — and a punch that silently does nothing when the frame rate dips is worse than one
that lands a frame late. **The NPC swing uses the same rule**; having one and not the other
meant a long frame quietly disarmed the crowd while the player kept punching.

### Combat on a crossing, without breaking the crossing

Pedestrians mid-crossing used to be excluded from targeting entirely, which made the middle of
a scramble crossing — most of this map — a place where combat silently did nothing.

They are now valid targets. What protects the signals is not refusing to hit them; it is
refusing to take them off their route for anything short of going down:

- a **survivable** hit damages and alarms them, and they keep crossing. `crossing`, `queueKey`
  and their signal group are untouched, and they are never stopped to fight.
- a **fatal** hit goes through `crowd.strike()`, which calls `leave()` first — so the group is
  **released**, never abandoned.

Both halves are pinned by tests, because a pedestrian stopped mid-crossing holds their signal
group, and the controller stops the clock for the whole map while any group is held.

### One authority

The **simulation** decides who was hit, how much health they lost, and whether they go down.
The HQ crowd renderer only shows it — it reads `struck` and `combatDead` off the pedestrian,
exactly as it already does for a car. Nothing in `combat.mjs` reaches into the HQ crowd.

### The crowd sees it

A punch raises a **witness event** — where it happened, how bad, and how far that carries —
which `src/life/hq-layer.mjs` turns into reactions. `combat.mjs` never scans the crowd itself;
it hands the event to whoever is listening and the listener owns the bounding.

| | value |
| --- | --- |
| radius | 11 m |
| severity, connecting punch | 0.72 |
| severity, punch that misses | 0.40 (0.72 × 0.55) |
| bands | `felt ≥ 0.52` FLEE · `≥ 0.30` AVOID · `≥ 0.12` LOOK |

`felt = severity × (1 − d/radius) / nerve`, and **nerve is per-citizen**, hashed from the same
id their appearance comes from, spread over 0.55–1.45. So one punch produces a spread of
responses rather than a chorus, and the same person is reliably the nervous one. The rule is
borrowed from `src/life/awareness.mjs`; the storage deliberately is not, because two thousand
JS state objects is the thing this architecture exists to avoid.

A punch that misses still raises an event at reduced severity. Bystanders reacting to a swing
that connected with nobody is the correct behaviour — they saw someone throw a punch.

Someone already fleeing, or already off their feet, is **not made to react again**. The second
punch in a fight therefore moves far fewer people than the first, and that is not the crowd
ignoring it.

### NPC retaliation

A struck pedestrian becomes hostile for 14 s, closes to `range × 0.72`, and swings on the same
phase model the player does: a wind-up, then damage when the arm is out. A player who has to
respect a hit window while the crowd lands instantly is not fighting, they are being audited.

| | player | NPC |
| --- | ---: | ---: |
| damage | 34 | 14 (+0–4 by id) |
| reach | 1.75 m | 1.75 m |
| arc | ±1.05 rad | — |
| cooldown | clip recovery | 1.05 s (+0–0.36 by id) |

Three punches kill a pedestrian; eight kill the player. The arc matters: a punch is not a
radius, and someone directly behind you cannot be hit.

### Player death and restart

`hurt()` takes health, holds a 0.34 s hurt lock so one frame of overlap cannot delete the
player, and at zero sets `alive=false` with `hitBy='fight'`. The scene shows
**「喧嘩で倒れました」** and a **「やり直す」** button, which calls `revive()` → `place()`:
health 100, alive, timers cleared, back at the start point. A dead player cannot swing and
cannot take further damage.

### Cost

`qa/gta-upgrade/combat-cost.mjs`, 600 frames at 1/60 s with 12 hostiles already engaged.
CPU only — no frame rate is claimed from this hardware.

| people | melee µs/frame | witness ms/punch | reacted (first punch) | seen |
| ---: | ---: | ---: | ---: | ---: |
| 64 | 14.5 | 0.074 | 60 | 60 |
| 256 | 14.0 | 0.098 | 93 | 163 |
| 1024 | 17.1 | 0.330 | 93 | 206 |
| 1978 | 11.5 | 0.558 | 93 | 206 |

**`melee.update` is flat in population** — 1,978 people cost no more than 64, because the fight
only ever walks the grid cells inside `notice` (4.5 m). At ~15 µs it is under 0.1% of a 16.7 ms
frame.

**`witness` is not flat**, and the reason is `grid.rebuild`, which is O(population) per call.
0.56 ms at full crowd, against roughly two punches a second, is ~1.1 ms/s — acceptable, and
recorded here because it is the term that would matter if punches ever became rapid.

The people reacting saturates at 93 of 206 seen, which is the bounding working: density inside
11 m stops growing once the disc is full, so a bigger city does not make a bigger reaction.

### Tests

`tests/combat.test.mjs` is new — the PRE-RUN 8 audit found **zero** combat tests. 22 cases.
Two of them contradict each other on purpose, so neither can pass vacuously:

- *DAMAGE DOES NOT HAPPEN ON THE INPUT TICK* — the bug this run exists for.
- *damage lands inside the active window* — and it does happen, later.

The rest pin the things that were previously unpinned: a punch at nobody misses; someone out
of range, or behind, misses; a target who walks away during the wind-up is missed and one who
walks **in** is hit; one swing damages at most once; a press during recovery does not start a
second swing; the two clips alternate; a fatal hit goes through `crowd.strike`, not around it;
a pedestrian on a crossing **can** be hit; a light hit does **not** take them off the crossing
and a fatal one **does** use the formal `leave` path; a witness event fires once per swing and
a miss fires a weaker one; the NPC swings on the same model the player does; a dead player
cannot swing; and nothing produces a NaN or a stuck phase.

`tests/hq-layer.test.mjs` gained three: a punch is seen by the people near it **and only by
them**; witnesses do not all react the same way and they recover; a punch in a dense crowd is
seen by a useful number of people.

The death loop (case 22) runs against the **real controller**, not the stub the rest of the
file uses — testing a copy of `hurt` would have proved nothing about the game. Both of its
guards were mutation-checked: removing `state.alive` from the swing start, and clamping health
to 1 instead of 0, each fail it.

### A bug RUN 8's QA found, which was not RUN 8's

The browser QA raised the scene's shader-error banner —
「描画シェーダーのコンパイルに失敗しました」— and the first read of it was wrong: the
browser had been open for over an hour, so a stale WebGL context looked like the obvious
answer. It was not. A **fresh** browser raised the same banner, at a reproducible moment: about
35 seconds into player mode, never in observer mode.

The captured log says exactly what happened:

```
ERROR: 0:76: 'instanceColor' : redefinition
```

`src/traffic/vehicle-shadow.mjs` declared `attribute vec3 instanceColor` inside its own vertex
shader. A `ShaderMaterial` — unlike a `RawShaderMaterial` — is given three.js's vertex prefix,
and that prefix already declares `instanceColor` under the very same `#ifdef`
(`WebGLProgram.js`). The second declaration is a redefinition, so:

- the program never compiled,
- the renderer logged `useProgram: program not valid` on every frame,
- **every vehicle in the scene lost its contact shadow**, and
- the scene told the user that roads and buildings might be missing, which was not the problem.

Why it only appeared in player mode: `USE_INSTANCING_COLOR` is defined only once an
`instanceColor` buffer exists, and that buffer is created by the first `setColorAt`. Until a
vehicle shadow is given its falloff exponent, the define is absent, the redundant declaration
is compiled out, and the shader is fine. Nothing to do with combat.

Fixed by deleting the declaration and keeping the guard. `tests/vehicle-shape.test.mjs` now
pins it: no custom shader may declare an attribute the renderer already injects. The test was
checked against the unfixed file and fails there.

**The lesson for the next RUN.** No unit test could have caught this — it needs a real GL
context, a real compile, and a coloured instance. The banner had been on screen in earlier
QA screenshots and was read as scenery. A red banner is a blocker whatever RUN raised it.

### Browser QA, in the real scene

`?qa=1&tier=high&time=day&camera=scramble&hq=1`, headless Chromium on SwiftShader. **No frame
rate is reported** — this hardware cannot produce performance evidence, only counts, CPU
timings, errors, and whether a thing renders at all.

| scenario | result | evidence |
| --- | --- | --- |
| player mode enters | **WORKS** | alive, health 100 |
| witnesses react to a punch | **WORKS** | peak **251** people reacted, `witnessMs` 2.1 |
| witnesses recover | **WORKS** | `reacting` 88, `down` 0, `disowned` 0 |
| **crossings keep running during combat** | **WORKS** | **22 completed, 0 abandoned, 0 stuck, 0 queued** |
| HQ scale preserved | **WORKS** | 1,945 HQ bodies, **0 skeletons, 0 mixers**, 12 draw calls |
| first air punch | inconclusive | sampled before the HQ crowd had spawned: `candidates=0` |
| player takes damage from the crowd | **NOT OBSERVED** | health stayed 100 — see below |

The line that matters most is the crossing one. Combat now happens in the middle of a scramble
crossing, and across the run the signals kept cycling with **nothing abandoned and nothing
stuck** — which is the failure mode this design was shaped around.

`witnessMs` in the live scene is **2.1 ms**, against 0.56 ms in the offline bench at the same
population. The bench does not carry the scene's grid occupancy; the live figure is the one to
believe, and it is the number to watch if punching ever becomes rapid.

### The bug that mattered: combat could not touch the crowd

RUN 8's first browser QA reported witnesses reacting in the hundreds and **not one knockdown**.
Six punches at a pedestrian **8 cm away**, standing still, `waiting`, not crossing — nothing.
`melee.snapshot()` was not exposed to QA at the time, so the run could see the crowd *react*
to a punch but could not tell a hit from a miss. That metric was added
(`__SHIBUYA_QA__.metrics.melee`) and the answer arrived immediately:

```
punch 5  melee={"swings":2,"hits":0,"misses":1,...}
```

Two swings, **zero hits**. Reproducing `eligible`'s clauses against the live simulation named
the failing one straight away — every pedestrian within reach carried `choreographed: true`:

| id | distance | in range | in arc | choreographed |
| --- | ---: | --- | --- | --- |
| 1115 | 0.06 m | yes | no | **yes** |
| 88 | 0.08 m | yes | no | **yes** |
| 669 | 0.24 m | yes | **yes** | **yes** |
| 149 | 0.40 m | yes | no | **yes** |
| 59 | 0.43 m | yes | no | **yes** |

`eligible` excluded `p.choreographed`. The choreographed Scramble cast is **74–85% of the
population** (`ScrambleChoreography.refill`: `target = total × 0.74…0.85`) — it *is* the crowd
in the crossing. Combat was therefore switched off exactly where the game happens, and the
one pedestrian in arc was cast like all the others.

**Why the exclusion was wrong.** `simulation.step` tests `struck` **before** it hands a
choreographed pedestrian to `choreography.move`:

```js
if(p.struck!==undefined){p.struck+=dt;p.speed=0;this.fly(p,dt); ... continue;}
...
if(p.choreographed)return this.choreography.move(p,dt);
```

A falling body is carried by the knock-down path, not by its track. **A car has always been
able to knock the cast down through `strike`.** Only a fist could not.

**The fix** is the crossing rule, generalised. `onRails(p) = p.crossing || p.choreographed`:

- they **can** be hit, damaged, alarmed and killed;
- they are **never** stopped to fight, because `choreography.move` would put them back on the
  track the next tick and the two would write over each other every frame — and because
  stopping one mid-crossing holds their signal group;
- the hostility window still opens, so a cast member who is punched and later leaves the cast
  turns and fights.

**Verified in the live scene, end to end**, over two runs at different viewport sizes:

| | before the fix | after (480×320) | after (900×620) |
| --- | ---: | ---: | ---: |
| swings | 2 | 3 | 5 |
| hits | **0** | **3** | **5** |
| misses | 1 | 0 | 0 |
| NPC deaths | 0 | **1** | **1** |
| `sim.struck` | 0 | **1** | **1** |
| GPU crowd `down` | 0 | **1** | **1** |
| GPU crowd state reached | — | `KNOCKDOWN` | `KNOCKDOWN` → **`DOWNED`** |

Five swings, five hits, no misses. The longer run also watched the body move through the
knockdown chain — `KNOCKDOWN` and then `DOWNED` — which is **RUN 7C's chain being driven by a
punch for the first time**; until now only a car had ever put a body on the ground.

**Why no unit test caught it.** Every NPC in `tests/combat.test.mjs` was built with
`choreographed` falsy — the helper never set it, so 23 passing cases all tested the 15–26% of
the population combat already worked on. Four cases now build a cast member explicitly, and
each fails against the old `eligible`.

**A frame-rate artefact, not a bug.** Sixteen key presses produced three swings. `FrameGate`
clamps `dt` to 0.1 s, so on a renderer reporting 0.2 FPS a 0.867 s clip needs nine frames and
takes about six real seconds; a press during that recovery is dropped by design. At 60 Hz the
clamp never engages. This is measurement noise from SwiftShader, and it is the reason the kill
needed a small viewport to reach in reasonable time.

### Not verified live

- **A visual frame of a body on the ground.** The knockdown is proven by numbers above
  (`KNOCKDOWN` → `DOWNED`, `down=1`, `sim.struck=1`, `npcDeaths=1`) and was captured at
  900×620 with the scene healthy — but the body is not identifiable in it. To reach a kill the
  player has to stand inside the crowd, and from there the camera looks at a wall of standing
  people that hides anyone lying at their feet. The same position hides the player's own arm,
  so the impact frames do not read as a punch either. **What is missing is a camera angle, not
  a behaviour.** A free or raised camera, or a kill at the edge of the crowd, would settle it.
- **NPC retaliation damaging the player.** Health stayed at 100 throughout. At 0.2 FPS an NPC
  needs its own wind-up plus a 1.05 s cooldown per swing, and the player was never held still
  long enough near a non-cast pedestrian. Pinned by unit tests, not observed in the browser.
- **A full 108-second signal cycle under combat load** — as before RUN 8.


## 9f. RUN 9 — vehicle occupancy, staged entry, and a real carjack

The PRE-RUN 8 audit found that driving worked, entry existed as one smoothstep, exit existed
behind a safe-doorstep rule, doors animated, and the anchors were already authored. What was
missing was underneath all of it: **traffic vehicles had no driver entity at all**. Nothing in
the project could say who was in a car, so "carjacking" was `takeOver(slot)` at the moment the
button went down — there was nobody to take it from.

### Occupancy is one authority

`src/traffic/occupancy.mjs`. Occupancy is never inferred from a mesh, from `controlled`, or
from whether a driver happens to be drawn.

```
OCCUPANT   NONE | TRAFFIC_DRIVER | PLAYER
DRIVER     SEATED -> ALERT -> BEING_EXTRACTED -> EXTRACTED
```

Data-oriented: the traffic pool is a fixed 146 slots, so occupancy is parallel typed arrays
indexed by slot id. No object per car, no allocation per spawn, **a driver costs 13 bytes
rather than a skeleton**. A driver is an *identity* — `driverId` and an appearance seed — not
an actor.

The model enforces its own invariants rather than trusting call sites:

| invariant | how it is guaranteed |
| --- | --- |
| one seat, one occupant | `seat` and `takeSeat` refuse a seat that is not `NONE` |
| the player is in at most one car | the seat they are in is a **single value**, so a second cannot exist |
| a driver cannot vanish from the seat | `advance` moves one state at a time; `extract` refuses unless `BEING_EXTRACTED` |

That last one is the instant takeover this RUN exists to remove, expressed as a state machine.

**Seats are reconciled, not assigned.** A vehicle becomes active in three places — `spawn`,
the central streams, and the rotary service — and seating at each means the next one added
forgets. `reconcileOccupancy` walks the pool once per frame instead, so no activation path can
be missed. The same reasoning produced `reconcileOwnership` in the HQ crowd layer.

Three cars stay empty on purpose: **parked** cars (an empty parked car *is* the normal-entry
case), the car the player is **controlling**, and a car whose driver has just been **dragged
out** — without that last marker a fresh driver appears in the seat while the player is still
walking round the bonnet.

### The driver you can see

`src/traffic/drivers.mjs` is deliberately the cheapest thing that stops a car reading as empty.
**No skeleton, no AnimationMixer, no clip, no per-frame AI.** Head, shoulders and a hint of
arms is the whole silhouette a cabin shows through glass.

| | |
| --- | ---: |
| draw calls, any traffic count | **3** |
| skeletons / mixers | **0 / 0** |
| CPU | ~0.1 ms/frame |
| budget | nearest 48 occupied cars within 46 m |

Bounded by **distance, not population**, so a city full of traffic costs what a street does.
Identity comes from `src/life/appearance.mjs`, the same recipe the crowd uses.

Two things had to be fixed before any of it was visible:

- the layer ranked cars by distance **from the camera body**, and the scramble preset sits
  sixty metres back and above the crossing, so every cabin fell outside the radius and it drew
  nobody. It now focuses on what is being *looked at*.
- **the cabin was a solid dark box.** `glass` had no transparency at all, so the seated driver
  was being drawn correctly and hidden completely, and no car in the scene could ever show that
  someone was in it. Now tinted (opacity .62) rather than clear.

### Anchors, finally used

`driverSeat`, `driverDoor`, `driverEntry`, `driverExit` have existed since the vehicle assets
were built and **nothing used them** — enter and exit invented their own offsets, so the
authoritative numbers and the numbers actually used were two different things.
`src/traffic/vehicle-anchors.mjs` is the one place that turns them into world poses, memoised
per body. Measured, for a sedan: seat `[-0.418, 0.591, 0.989]`, entry `[-1.630, 0, 0.897]`,
exit `[-1.690, 0, 0.598]`.

The side mirrors, because the player may approach from whichever side is clear. **The seat does
not** — walking round the far side of a car does not move the steering wheel to meet you.
`doorPose` still chooses the side, because it also tests the ground for solids.

### Entry and exit are sequences now

```
enter    ALIGN -> DOOR_OPEN -> ENTRY -> SEAT -> DOOR_CLOSE            1.62 s
exit     DOOR_OPEN -> EXIT -> STAND -> DOOR_CLOSE                     1.24 s
carjack  ALIGN -> DOOR_OPEN -> GRAB -> PULL -> THROW ->
         ENTRY -> SEAT -> DOOR_CLOSE                                  2.72 s
```

Each stage carries its own duration, waypoints and door state. That buys three things the old
`Math.sin(phase * PI)` could not express:

- the door **opens before** the body moves through it and **shuts after** it has cleared. The
  old shape opened the panel as the player set off walking and had it shut again as they sat.
- **the seat is a real destination.** Entry used to end at the *door*; sitting down was the
  renderer hiding the player while the car started drawing them.
- there is a defined moment when **control transfers**, and it is the end.

### Ownership is split in two

`takeOver` became `reserve` + `commit`.

`reserve` does what the animation needs: the car is frozen so traffic cannot pull away
mid-sequence, permits are released so a held signal group does not stall the map while the
player walks round the bonnet, and the slot becomes the one the player's renderer draws so its
door can swing. It deliberately does **not** set `active` — every driving path is gated on
that, so a reserved car sits there, input does nothing, `step` returns immediately, and nothing
is struck by it.

`commit` takes the wheel, and it **asks the occupancy model** whether the seat is free rather
than assuming. A car whose driver is still in it cannot be driven away. An entry that cannot
commit unreserves rather than stranding.

`vacateSeat` ends occupancy without giving up the car — the player still owns it and is still
offered it back as `own`, but a car nobody is sitting in must not report an occupant.

### The carjack

The carjack list is the entry list with three stages spliced in, so getting into a stolen car
is the same animation as getting into an empty one **with a fight in the middle**.

| stage | what happens |
| --- | --- |
| `GRAB` | the driver notices → `ALERT` |
| `PULL` | hauled across the sill → `BEING_EXTRACTED` |
| `THROW` | the body lands on the road, the seat is free |

Consequences hang off stage *changes* and replay any stage a long frame crossed, so none is
skipped — the same rule RUN 8's hit window needed.

Splitting it this way is what makes the seat **empty for a beat** before the player is in it.
Between `THROW` and `SEAT` the car has no occupant at all, which is the honest description of
a carjacking in progress and is what stops the player driving off with the driver still there.

**The person thrown out is the person who was sitting in it.** `appearanceId` carries the
driver's seed onto the pedestrian and the crowd renderers prefer it over the pool id.
Arriving on the pavement as somebody else would undo the whole reason a driver has an identity.

They are handed to `crowd.strike` — the simulation's own knock-down, the same path a car uses.
That buys the existing `HIT → KNOCKDOWN → DOWNED → RECOVER` chain, the blood and the scream,
rather than a second knockdown architecture to keep in step with the first.

A car doing more than **0.35 m/s refuses**: the same threshold `nearestEntry` already uses.
Pulling someone out of a car doing thirty is a different feature, and RUN 9 is not it.

Aborts are handled rather than hoped about. Leaving player mode mid-carjack settles the driver
back into the seat, shuts the door and hands the frozen slot back to traffic. `abort` is legal
only before the throw — once there is a person on the road, putting them back in the car is not
an abort, it is a resurrection.

### Browser QA, in the real scene

`?qa=1&tier=medium&time=day&camera=scramble`, headless Chromium on SwiftShader. Counts, states
and errors only — **no frame rate is reported**, and the small viewport is not cosmetic:
`FrameGate` clamps `dt` to 0.1 s, so on a renderer at 0.2 FPS a 1.62 s entry takes eighty
seconds of wall clock.

| scenario | result | evidence |
| --- | --- | --- |
| A enter an empty parked car | **WORKS** | door 0 → 1.00 → 0, seat becomes `PLAYER` at the end |
| B drive | **WORKS** | 3.7 m, 17 km/h |
| C exit | **WORKS** | `playerVehicle` → −1 |
| D safe-doorstep rule | intact | a spot existed, so the refusal path was not exercised |
| E occupied car, driver visible | **WORKS** | 14 drawn of 88 seated; HUD offers 「奪う・F」 |
| F no instant takeOver | **WORKS** | one frame after the press: `stage=ALIGN`, `playerVehicle=-1`, `active=false` |
| stages observed | **WORKS** | `ALIGN → DOOR_OPEN → GRAB → PULL → THROW → ENTRY → SEAT → DOOR_CLOSE` |
| G driver leaves the seat | **WORKS** | `driverId 6` out of vehicle 5 |
| H driver becomes a world body | **WORKS** | pedestrian 1527, thrown, same appearance seed |
| I player takes the seat | **WORKS** | `playerVehicle=5`, door shut |
| J drive the stolen car | **WORKS** | 3.9 m |
| K exit the stolen car | **WORKS** | `playerVehicle` → −1, first car left `NONE` |
| L a second carjack, another car | **WORKS** | driver 8 out of the sedan as pedestrian 1528, `playerVehicle=7`, first car still `NONE` |
| console errors | **0** | |

**Two of the three failures this QA reported were the QA's own fault**, and both were worth the
time it took to prove it rather than assume it. With each corrected, L passes:

- a second carjack "failed" because after getting out the player stands 1.4 m from the car they
  just left, and `nearestEntry` quite correctly offers the **nearer** car — their own.
- it failed again because the script stops the victim by writing `speed = 0` for one frame and
  then waited three seconds, during which the traffic simulation drove it away. A stopped car
  is only jackable *while* it is stopped.

The third was real, and is the reason G and H are green above. See below.

### Two bugs the suite could not see

**The driver vanished.** At HIGH the crowd pool is saturated — nearly two thousand people, all
active — so `crowd.spawn` fails, and the driver left the seat with no body arriving. Extracted
from the occupancy model, never delivered to the world. Every unit test passed because a test
pool always has a free slot. One distant pedestrian is now retired to make room, through
`despawn`, which calls `leave` first and releases any signal group they were holding.

**A scream took the frame down with it.** `say(kind, id, x, z, listener, urgency)` was called
as `say(pedestrian, 'scream', 1)`, so `listener` was undefined and `listener.x` threw — inside
the frame loop, at the `THROW` stage, every time a driver was pulled out. The sequence stopped
dead at `THROW`, the door stayed open at 1, and the player never reached the seat; three
"failures" after it were all this one exception. The call is deleted rather than corrected,
because `crowd.strike` already says the scream. `voices.say` now keeps the contract its own
comment makes — *"Never throws: a browser that refuses audio must not stop the game"* — which
it did not.

### Regression, at HIGH with the HQ crowd up

Everything RUN 7 and RUN 8 established, re-checked with occupancy, drivers and the carjack in
the scene. `?qa=1&tier=high&time=day&camera=scramble&hq=1`.

| gate | result | evidence |
| --- | --- | --- |
| HQ crowd alive | **WORKS** | 1,971 bodies, 12 draw calls |
| **no skeletons or mixers added** | **WORKS** | crowd 0/0, drivers 0/0 |
| seated drivers alongside the HQ crowd | **WORKS** | 5 drawn of 88 seated |
| RUN 8 melee still lands | **WORKS** | 2 swings, 1 hit, 0 misses |
| witness reaction still fires | **WORKS** | 277 people reacted |
| crossings still complete | **WORKS** | 0 → 7 |
| nothing abandoned or stuck | **WORKS** | abandoned 0, stuck 0 |
| no shader banner | **WORKS** | none |
| console errors | **0** | |

RUN 7's architecture is intact: **RUN 9 added no skeleton and no AnimationMixer anywhere**, and
the seated drivers coexist with 1,971 GPU crowd bodies for three extra draw calls.

### Not verified live

- **A frame of the driver lying in the road.** The extraction is proven by state
  (`thrown: true`, pedestrian 1527, the same appearance seed, in the knockdown chain) and the
  screenshot is of a healthy scene, but the camera sits at the driver's door during the
  sequence, and a body at the player's feet is below frame. Same shape of limitation as RUN 8's
  knockdown: a camera angle, not a behaviour.
- **Enter and exit at every body type.** Checked on a sedan, a taxi and a kei; the anchors are
  measured for all seven, but bus and scooter entry has not been watched.
- **A full 108-second signal cycle with a carjack in it** — as before.


## 9g. RUN 10 — NPC life / awareness consolidation

**RUN 10.1 (`76dc411`):** audit found that the old RUN 7 `awareness.mjs` really was
imported by `render.mjs` and scanned every ~1,978-person simulation pool on every frame.
It is now marked DEPRECATED / NOT PRODUCTION. The production import count is zero;
`hq-awareness.mjs` is the single rule authority. Its HQ states and three additional clocks
(`noticed`, `ready`, `attention`) are typed arrays. The near-character pool calls the same
`playerThreat` function for its at most eight excluded bodies; there is no second rule system.
The old module's stable ID-based nerve, 60–400 ms delay, thresholds, downward hysteresis and
cooldown were ported. Per-person JS AI, full-population perception, cell-to-cell panic, and a
second spatial alarm grid were rejected. The baked Startle clip needed no asset or mixer.

**RUN 10.2:** player perception evaluates only cells within 13 m and now rebuilds the HQ
spatial grid only on the 12 Hz perception tick rather than on every render frame. Distance,
player pace, closing time-to-contact and orientation drive LOOK → STARTLE → AVOID; the close
range bypasses FOV. The pass reports candidate count, accepted changes, query CPU and update
CPU separately, and the HQ layer reports grid-rebuild CPU. A 60-frame test bounds rebuilds
at 8–15 per second. A standing player is not a permanent attention magnet.

**RUN 10.3 / 10.4:** RUN 8 witnesses enter through `hq-layer.witness()` into the same
personality/priority rules. A fresh strong melee event interrupts RECOVER; a weak glance
does not. A vehicle still uses the existing urgent `applyVehicleThreat` path: proximity
contact forces HIT/KNOCKDOWN immediately, and a fast approach can override RECOVER. A new
simulation strike also interrupts HQ recovery and requests movement handoff through the
scene's formal `sim.leave()` callback. LOOK cannot interrupt physical states.

**State priority:** the numeric enum orders NORMAL, LOOK, STARTLE, AVOID, FLEE, HIT,
KNOCKDOWN and DOWNED. RECOVER is index 8 for its existing atlas lookup, but an explicit
`priority()` ranks it below a new AVOID/FLEE or physical threat. Physical hits take precedence
over visual attention. Each LOOK/STARTLE/AVOID drains to NORMAL; FLEE drains through RECOVER
to NORMAL. The cooldown starts at the actual timer transition. `byState` has nine entries,
including RECOVER, so QA cannot silently omit recovery.

**RUN 10.5:** visual awareness never writes crossing, queue, route or signal ownership.
Knockdowns call the scene's existing `onDisown → sim.leave()` path. Choreographed pedestrians
can show LOOK and STARTLE while retaining their crossing membership. A driver extracted in
RUN 9 retains `appearanceId` and `cameFromVehicle`; when their fall ends, they remain an
ordinary pedestrian, get a nearby unoccupied walkable node and route, and can again be noticed
or flee. The ejection landing point can be in a traffic lane, so the driver is placed at the
nearest safe node at the end of their fall; this curb transition needs visual QA. Recycling
the pedestrian slot clears both driver-only fields. The carjack/occupancy state machine is
unchanged. There are no per-citizen mass Skeletons or AnimationMixers.

**Headless HIGH QA:** `qa/gta-upgrade/awareness-cycle.mjs` runs the real traffic signals,
choreography, pedestrian simulation and 1,978-budget HQ layer for 120 simulated seconds at
30 Hz. Initial run: peak/end population 1,978; 12 HQ draws; 0 mass Skeletons and Mixers;
maximum 233 local candidates, 113 accepted changes, 189 simultaneous active reactions;
peak grid build 0.637 ms, candidate query 0.115 ms, awareness evaluation 0.891 ms on this
host. Melee reactions spread across LOOK/STARTLE/AVOID/FLEE; urgent vehicle contact threw
18 bodies. At the end FLEE/STARTLE/AVOID, physical ownership and disowned count returned to
zero. Four signal phases appeared; 904 crossings completed, 0 abandoned and 0 signal
violations, with 5 recorded stuck recoveries. These are diagnostic timings, not FPS or
portable budgets. The mass HQ sync still ranks the crowd every frame for rendering; that
existing O(N) render ranking is distinct from the local awareness query.

**Local browser acceptance — partial, NOT COMPLETE (2026-09-23):** Chrome loaded the real
HIGH/day scene. Local screenshots are under `qa/gta-upgrade/run10-browser/` (ignored local
evidence, not included in Git). Idle and normal walking showed no obvious circular gap;
direct running showed local STARTLE/AVOID, punches produced mixed local reactions, and
LOOK/STARTLE/AVOID/FLEE subsequently drained to zero. Punch and PunchCross landed. A real
carjack transferred occupancy to PLAYER for vehicle 0 and extracted driver 1 as pedestrian
1527 with appearance seed 506952114; the stolen taxi was driven. These observations do not
close all A–L scenarios.

One live walking snapshot reported total population 1,978, HQ population 1,945 (near bodies
are excluded), 12 HQ draws, 771 scene draws, zero mass Skeletons/Mixers and 0.3 ms grid
rebuild CPU. Counts and timings are snapshots, not maxima or portable performance results.
Console error checks returned zero; final fresh-page console/shader acceptance remains open.
Do not substitute the headless candidate/query/update measurements above for browser data.

**Provisional visual fix:** the working-tree change in `src/player/vehicle.mjs` increases
static-solid body padding from 0.05 m to 0.55 m. The same taxi route stopped visibly clear
of the station platform afterward (`vehicle-wall-before.png`, `vehicle-wall-after.png`).
This changes clearance around all static solids, so tight-clearance driving still needs
acceptance before this fix is finalized. Post-change `npm test` completed with 383 pass,
5 existing skips and zero failures, including its successful build; typecheck also passed.

**Still required:** close-pass judgement; frontal versus parallel/rear visual comparison;
individual flicker and state readability; combat/vehicle knockdown visual confirmation;
complete crossing/queue/signal measurements; extracted-driver curb transition judgement;
and a final browser console/shader audit. A prior trace measured a 1.83 m driver relocation
at fall completion, but its visual acceptability is unresolved. Browser automation later
stopped on URL verification; the latest resume exposes no browser-control tool. Keep RUN 10
pending until these checks can actually run. The reported mix of legacy/new character
models remains a later-plan item; no character replacement or RUN 11 work was started.

**Final gates:** `npm test`: 388 total, 383 pass, 5 existing skips, 0 fail;
`npm run typecheck`: clean; `npm run build`: successful. The RUN 8 combat/crossing and RUN 9
occupancy/carjack suites are included. The headless signal cycle is integration evidence, not
a screenshot or live console audit. **RUN 10 remains pending visual acceptance** until these
scenarios and console errors are checked in a real browser. RUN 11 was not started.

### RUN 10 — browser acceptance closed (Claude, 2026-09-23)

This follows Codex's partial QA above and does not replace it. Codex's patch `f6fe7bb` is
preserved as `6fee7d2` (identical content, different committer). All of it ran in the real
HIGH/day scene with `?qa=1&hq=1`, driven over the DevTools protocol in headless Chromium on
SwiftShader. At that frame rate the scene runs at about 0.2–1.5 fps and `FrameGate` clamps each
frame to 0.1 s, so every check waits on *simulated* progress, not wall time. No FPS here is a
performance result. Screenshots and traces are local QA evidence and are not committed.

**Legacy / old-style characters (`b87ca60`).** Measured per pedestrian from the renderer's own
ownership split (a new QA `ownership()`): the procedural legacy renderer drew **0** people. Every
old-looking body was a *baked* near-pool slot, the eleven-bone offline figure, in the ring
around the player where the HQ crowd would have drawn the same person better. While the HQ crowd
covers the scene, the near pool now keeps only its humanoid slots (`setHQCovered`). Live: 8
humanoids, 0 baked, 0 drawn twice. Without HQ, the baked fallback is unchanged.

**Player vehicle transparency (`1ee9e3f`).** Not a material problem. `loft()` in
`src/traffic/vehicle-shape.mjs` wound its side quads and caps inside-out, so every lofted body
had negative signed volume. With back-face culling the far inner walls were drawn and the car
read as hollow. The winding is fixed at the generator and the pack rebaked; all seven bodies now
have positive paint and glass volume, which two tests pin. Checked in the browser, day and night.
Traffic cars use a different builder and were never affected.

**Collision clearance (`f767029`).** Codex's .55 m on every side was measured against every
sedan lane pose on the map (`qa/gta-upgrade/clearance-cost.mjs`). It made **35 of 2,467**
undrivable, a narrow street near (−200, 55) that the AI's own sedans use. All of the cost was
lateral. The margin is now .55 m at the ends and .25 m at the sides, which loses **0** lane poses.
Browser: that street drives through at 35 km/h. Head-on into a station-area pillar the car stops
with its nose **0.61 m** clear and the bonnet visibly outside the structure. The car-to-car pad
is unchanged. `tests/vehicle-clearance.test.mjs` drives the real player vehicle onto every lane
pose; with the uniform .55 restored it fails on exactly the 35.

**E — parallel versus direct (4 people, after the cooldown fix below).** The player runs at
4.2 m/s from 12.5 m: straight at them, or past them 2.5 m to the side.

| person | direct: first / max | parallel: first / max |
| --- | --- | --- |
| 1913 | LOOK @ 9.05 m / AVOID | LOOK @ 9.09 m / STARTLE |
| 1890 | LOOK @ 7.27 m / AVOID | LOOK @ 7.30 m / STARTLE |
| 1516 | LOOK @ 8.37 m / AVOID | LOOK @ 8.75 m / STARTLE |
| 1637 | LOOK @ 9.17 m / FLEE | LOOK @ 11.02 m (near-held) / STARTLE |

Parallel is weaker every time. First notice is at about the same distance, as it should be: the
collision term only applies inside the 1.25 s time-to-contact, and the difference shows up
there. Per awareness pass there were 7–22 candidates and 3–17 evaluated inside 13 m.

**F — rear versus frontal.** Rear first notice / max: 1913 LOOK @ 6.63 m / LOOK; 1516 LOOK @
4.73 m / LOOK; 1637 LOOK @ 6.58 m / LOOK; and before the fix, 1654 LOOK @ 7.49 m / AVOID against
8.11 m / FLEE frontal. So rear is later and weaker in 4 of 5. The exception is **1890**: LOOK @
8.51 m, max AVOID, while held by the near pool. By the rule itself (`playerThreat`,
behindScale .35, nerve .73), a rear approach at 8.5 m scores 0.03, far below LOOK, and cannot
reach LOOK beyond about 4 m. So this person was almost certainly facing the player, having
turned on their route. That was not instrumented in that trial.

**A bug E found (`7fc1d69`).** Direct approach, before: NORMAL → LOOK → **NORMAL** → FLEE at
2.3 m. The LOOK hold (0.5 s) drained, the drain started the 1.15 s `REACTION_COOLDOWN`, and
`settle()` refused everything above NORMAL. The person strolled on while the runner closed about
six metres. The crowd now records the level the cooldown is for (`calmed`), and awareness blocks
only re-entry at or below it; a stronger reaction gets through. The threshold-wobble flicker
test is unchanged and passes. A LOOK → NORMAL blip of one reaction delay (60–400 ms) remains
before an escalation. It is invisible, because on the HQ crowd LOOK plays the same `Walk` clip
as NORMAL and `attention` is not rendered (see known limitations).

**I — real vehicle contact (2 runs, player's own car).** At 10.3 and 9.5 m/s: target
KNOCKDOWN + disowned + `reactionOwned` → DOWNED + disowned. 64 and 15 bystanders went
AVOID/FLEE from the car. Across 912 recorded transitions (every person within 14 m of the path,
each frame, with the hold timer), awareness downgraded a vehicle or damage state **0** times.
Closing layer snapshot: population 1,970, 12 HQ draws, 0 Skeletons, 0 Mixers, 0 console
errors. Screenshots show the thrown bodies with the blood decal in front of the car.

**A bug I found (`a6eb2c0`).** The eight near humanoids picked
`lifeReaction(p) ?? trafficReaction`, so player awareness always won. While driving, awareness
sees the rider in the car as a standing player, and people a few metres from the bonnet sat at
LOOK. Live: in **8 of 32** frames where the car's own warning asked for guard/startle, the body
showed a head turn instead, for example with a car 2.8 m away at 5.8 m/s. `nearReaction()` now
puts a live guard/startle/escape first and keeps the old order otherwise. The same
deterministic run afterwards has the same 8 input conflicts and **0** wrong reactions, read from
the body (`reactionOf`).

**L — extracted driver (`a7eb2c0`).** Carjack of taxi 5; the driver is pedestrian 1527 (seed
894229037), the same as Codex's run. Before: KNOCKDOWN → DOWNED → RECOVER → **KNOCKDOWN** → DOWNED.
The sim holds a thrown body for `struck` 4.9 s, but the HQ chain reached RECOVER at 3.9 s, was
handed back, and was knocked down again because `struck` was still set. Then the sim stood the
driver at the nearest safe node, **4.41 m** away this run, and walked them off at 1.91 m/s,
while the HQ body lay disowned at the old spot. On hand-back it jumped 2.2–6.57 m in one frame.
Fixed in the render layer only (sim, occupancy, carjack, identity and destination untouched).
While `struck` is set the layer holds DOWNED. From hand-back, a gap above 0.5 m closes at a
bounded rate, finishing within 1.2 s (`HQ_RISE`). Keying it on RECOVER was not enough: the parked
player car replaced RECOVER with AVOID on the next frame. After: KNOCKDOWN → DOWNED (until the sim
lets go) → RECOVER → AVOID → NORMAL → walking, one knockdown, largest move 0.55 m per clamped
0.1 s frame (the bounded 5.5 m/s glide, about 9 cm a frame at 60 fps), arriving at the safe node.
A side effect worth knowing: any body the sim holds down (car and punch victims, 14 s) now lies
for that long instead of standing up at 3.9 s and falling again.

**K — signal phases, live (`cd4ba03`).** SwiftShader renders this scene at 0.2–0.3 fps, so one
108 s signal cycle took about 90 minutes of wall time. K therefore ran in the live page with
the page's own traffic and pedestrian simulations stepped from inside the page, at their own
1/30 s fixed step, while the renderer kept drawing on its own frames. `hq=128` kept the HQ layer
live at a smaller draw budget; the simulated crowd is the full 1,978.

The first two attempts found the real problem. **In player mode the signals froze.** Entering
player mode parks the player's car beside the player, and from the start (12, 24) the first
legal road pose was *on* the scramble, at (9.2, 25.1). The scramble cast stops for any vehicle
on its track, so 24 of them stood on the crossing for good. The controller holds its cycle
until a crossing clears, so every signal on the map stayed at the end of the first pedestrian
phase for 850 simulated seconds. Moving the car off the crossing parked it in the lane the
central stream leaves by, and an 8-car platoon (ids 83–90) stopped behind it inside the scramble
holding the crossing's locks: signals cycled, but nobody was ever given WALK. The parking search
now skips crossings and the plaza, and prefers a pose whose whole body is at least 1.9 m from
every lane and junction centreline, falling back to the old rule only when there is none within
40 m. From the start the car now parks at (−13.5, 49.5).

After the fix, two complete live pedestrian phases (deltas from phase start to end; each end
includes the controller's hold while the crossing clears, 37.1 s at most):

| phase (signal time) | entries | completed | abandoned | violations | stuck recoveries (cumulative Δ) | currently stuck: all / on a crossing (start → peak → end) | on crossing (peak → end) | queues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 196 | 1,301 | 1,455 | 0 | 0 | 14 | 60 → 65 → 26 / 0 | 1,463 → 0 | 0 |
| 304 | 1,301 | 1,450 | 0 | 0 | 13 | 37 → 67 → 33 / 0 | 1,463 → 0 | 0 |

"Stuck recoveries" is the cumulative count of ambient walkers despawned after being blocked for
35 s. "Currently stuck" is the live number with `stuck > 1 s` at that moment: ambient walkers
held up by others, and never anyone on a crossing. The queue map was empty throughout: the
waiting crowd at the scramble is the choreographed cast, which waits at its kerb rather than in
a crossing queue. 0 console errors.

**Not fixed, recorded:** the *third* live phase (signal time 412) admitted nobody. A route-2
central-stream taxi (id 80) stood inside the scramble area holding its lock. Route 2's 18-car
ring was jammed: its 6 downstream cars waited at the path end, because recycling to the start
needs the start clear and the route's own upstream tail occupied it, and that upstream queue was
stopped mid-route. The same scene headless (traffic + choreography + pedestrian simulation, HIGH,
hero start), with or without the player car parked at the same pose, runs five consecutive
healthy phases (1,301 entries each). So this is a browser-only central-stream spillback that was
not isolated here. It is traffic-stream behaviour outside RUN 10's scope, left for a later plan
rather than widened into this RUN.

**Console.** Fresh pages, HIGH, `hq=1`, day then night, on the RUN 10 code. Day covered walking, running,
a punch and a boarding request; night covered load and idle. Result: **0 errors, 0 uncaught
exceptions, 0 shader-compile messages, no `[role="alert"]` banner** at any checkpoint.
0 Skeletons, 0 Mixers, 1,969–1,971 HQ. The only warnings were 3 per page of Chrome's "AudioContext
was not allowed to start" (autoplay policy without a user gesture), which is not an app error.
No X4122 appears (that is a Windows D3D warning; SwiftShader does not produce it). At 0.1 fps
the boarding sequence may not have finished inside that script's wait, but driving ran in the
I, near-reaction and L sessions, all with 0 console errors.

**Known limitations found here, not fixed (no RUN 11 work):**
- On the HQ crowd LOOK is invisible: it plays `Walk` like NORMAL, and `attention` is not
  rendered.
- The near pool applies the threat rule with no reaction delay or hysteresis ("no clocks"), so
  its eight bodies notice earlier than the mass crowd and can cross thresholds faster.
- A stationary player car still makes people within 8 m ahead AVOID (`THREAT.avoid` ignores
  speed).
- The HQ body falls where it is hit; the simulation carries its own pedestrian through the
  throw. The gap is now closed smoothly on hand-back but the throw itself is not drawn on the HQ
  body.
- Without `hq=1` the scene draws the legacy crowd by design (the RUN 7B rollback).
- A player can still park the car across a crossing themselves, and the signal hold then waits
  for them. Only the automatic parking was fixed.
- Third-cycle central-stream spillback in the browser (see K above).

**RUN 10 is COMPLETE.** RUN 11 was not started.

**After RUN 10 — signal-waiting Idle (`0d8c0d3`).** This is the one item authorised after the
RUN closed. On the HQ crowd, NORMAL played `Walk`, so everyone at a kerb walked on the spot.
`clipFor(behaviour, waiting)` in `hq-crowd.mjs` plays the pack's existing `Idle` clip instead,
only for NORMAL and only while the simulation says `p.state === 'waiting'` (a crossing queue, or
the scramble cast at its kerb). It never keys on speed. Priority is physical > awareness >
waiting/locomotion. This is a visual mapping only: no movement, queue or signal state is
touched. Browser, in a vehicle-green phase: 1,455/1,455 waiting HQ citizens Idle, 0 others Idle,
and the 142–155 stopped-but-not-waiting citizens keep `Walk`. The near humanoids already choose
Idle through their speed-driven locomotion blend and are unchanged.

**Final gates for this handoff (HEAD after `0d8c0d3`):** `npm run typecheck` clean; `npm test`
403 total, **398 pass, 5 existing skips, 0 fail** (up from 383/5/0: 15 new tests, no
regression); `npm run build` successful, and its static re-bake left the tree unchanged. Final
fresh-page console gate on this code, day and night: 0 errors, 0 uncaught exceptions, 0 shader
messages, no banner.


## 9h. RUN 11 — Visual / audio / GTA feel polish

Started from `b037bc8` (RUN 10 complete). Work was done on a local worktree branch and
fast-forwarded onto `claude/gta-fidelity-upgrade`; `master` was not touched. Browser QA ran in
the real HIGH/day scene with `?qa=1&hq=1`, driven over the DevTools protocol in headless
Chromium on SwiftShader at 0.1–1.5 fps. With `FrameGate` clamping dt to 0.1 s, every live check
waits on simulated progress, and no frame rate here is a performance result.

### 11.0 Regression cleanup (`401334e`)

**Old-looking bodies.** Re-diagnosed live rather than trusting RUN 10's count. For every
pedestrian within 20 m of the player the QA pass recorded owner, near body type, HQ lane LOD and
state:
- all were HQ (L0) or near humanoids;
- the legacy renderer drew **no bodies**;
- it DID still draw **971 props** on those same citizens: 657 phones, 174 bags, 63 canes,
  63 suitcases and 14 cone umbrellas.

The prop parts were never masked with the body. HQ and near citizens therefore wore the legacy
capsule's box phone, bag and suitcase and a floating cone umbrella, sized for a capsule, and
after a hit these tumbled on the legacy arc. That is what read as blocky old bodies around the
player, on crossings, in dense crowds and after contact. Props are now drawn only with a legacy
body. Live afterwards: 0 legacy props, 0 legacy bodies, 0 drawn twice, 1,969–1,970 HQ plus 7–8
near humanoids and 0 baked. `tests/crowd-legacy-props.test.mjs` builds the real crowd renderer
with the HQ pack and pins this.

**Walking on the spot at red lights.** RUN 10's Idle keyed on `p.state === 'waiting'` alone.
Measured at a red phase, the defect was a waiting citizen who glanced at the player: they went
to LOOK, and LOOK borrows the Walk clip. LOOK now keeps the stance underneath; STARTLE, AVOID,
FLEE and every physical state still win.
`src/life/stance.mjs` also counts as waiting:
- the scramble cast standing at the kerb between crossings (`exiting`/`recycle`);
- the queue behind the front row, through a `kerbQueue` flag the simulation sets when a blocked
  walker is within 8 m of a closed crossing.
Speed alone never decides. Live at a red phase: **1,455/1,455** waiting HQ citizens and
**8/8** near humanoids Idle. The 120 other stopped walkers were ordinary congestion across the
city (87 of them for under 2 s), none at the scramble, and keep Walk.

### 11.1 Vehicle impact realism (`db1d180`)

**Why hits read wrong.** Two unrelated models ran on one contact:
- *Simulation:* it threw every body along the car's course, whatever part of the car struck
  it, and put 57% of the horizontal speed upwards. A 20 m/s hit flew about 36 m.
- *HQ body:* it ran its own second impulse and usually dropped almost where it stood, so the
  body the player saw did not follow the simulation.
- *Car:* its speed bled off at a flat rate per frame of contact, which double-counted a crowd
  and ignored mass.

**One contact model** (`src/player/vehicle-impact.mjs`, pure):
- *Inputs:* the car's velocity vector, which face hit (front, side or rear), where on that
  face, the closing speed along the contact normal, and the victim's own motion.
- *Output:* an impulse, a lift, a state and the speed the car loses.
- *Kinds:* push (closing < 2.2 m/s: a light HIT that stumbles and stays standing), knock,
  heavy (≥ 7) and launch (≥ 14). The throw is 0.8 × closing, capped at 14 m/s, with a low lift
  (≤ 3.2 m/s), so a body is thrown rather than launched into the air.
- *Direction:* a corner deflects the body off that corner, weighted by how far off-centre the
  contact is. A side swipe throws sideways.

**Following the throw.** Both the simulation's throw (`strike` now takes the impulse) and the HQ
contact use the model. A disowned HQ body now follows the simulation's flight, arc included,
through `crowd.follow`, instead of its own. Thrown bodies get 3.5 m/s² of sliding friction on
the ground, so they come to rest definitively.

**Weight and crowd resistance.** Each contact costs the car speed by momentum exchange: 75 kg
against the vehicle's own mass, 20% restitution, plus a little contact drag. The flat bleed is
gone. A body already lying in the road is shoved forward at most three times (every 0.35 s),
keeps its sideways motion and is never carried along.

**Numbers** (`tests/vehicle-impact-live.test.mjs`, real player vehicle, real flight):

| Case | Result |
| --- | --- |
| Travel after the hit at 4 / 10 / 18 m/s | 1.37 / 5.73 / 10.86 m |
| 10 m/s sedan, one contact | 9.20 m/s |
| … then over that body lying in the road | 8.49 m/s |
| … ten people in a line | 1.95 m/s |
| … a dense block of 30 | 0.95 m/s |

### 11.2 Melee feel (`efb6fbf`, `6162a32`)

**Why a punch looked like a touch.** `controller.startAttack` ignored the attack's name and
length, so the figure always played `Punch` (never the cross), squeezed into the last 0.42 s
of a 0.87–1.0 s swing. That is double speed, and it came 0.2–0.35 s AFTER the measured hit
window had already run the damage. The swing now carries its name and duration, and the clip
plays at its own speed, so the frame the fist is out is the frame the hit test runs.

On top of the clip, an additive envelope (`punchEmphasis`):
- winds the torso up away from the punching side;
- drives spine_02/03 through with the shoulder, leans in and steps the body 11 cm forward;
- peaks exactly at the measured fist-out time and settles to zero.

`tests/melee-feel.test.mjs` pins the peak to the measured `peak` and inside the hit window.
`Hit_Knockback` (UAL2) was not integrated: the repository's character sources are fetched
through `assets/character/upstream.lock.json` with hashes of the official archive, and UAL2 has
no such pinned provenance here. See limitations.

**Victims** (`src/life/temperament.mjs`):
- *How a blow lands:* `blowOn()` gives each blow a strength (jab = light flinch, 0.34 s,
  0.9 m/s push; cross = strong stagger, 0.55 s, 1.7 m/s) and a direction away from the fist,
  classified by the victim's own quarter (front, back, left, right).
- *Movement:* the simulation owns a short stagger, counted down by the frame and never applied
  to anyone on a crossing or the cast.
- *HQ bodies:* a light HIT that stays owned by the simulation (no disown), then gives way to
  the chosen answer through a new `then` state.
- *Near bodies:* they play `Hit` for the blow's hold. Before, the victim was handed
  `combatAction = 1` and played its own Punch.

**Retaliate / flee / back off.** Everyone punched used to turn and fight for 14 s. The answer is
now a deterministic temperament on the same nerve awareness uses:
- fight (nerve > .68) engages as before;
- flee (< .42) runs through the simulation's scatter and HQ FLEE;
- back off (in between) takes a short scatter and AVOID.

Kids and the elderly never fight. Over the 1,978 ids each answer covers more than 15%, and fewer
than half fight. The crossing/cast rule is unchanged: they take the blow and are not stopped.

### 11.3 / 11.4 Witnesses, feedback, audio, camera (`082f702`, `4225ab8`)

**Witnesses** (`hq-awareness.witness`, `WITNESS`):
- *Close:* inside 5 m the whole reaction is immediate.
- *Middle distance:* the witness LOOKs first. The rest arrives after their own reaction delay
  (×1.6), plus 0.035 s per metre and 0.3 s if they were facing away.
- *Far edge:* the outer 20% of the radius only looks.
- *Queue:* escalations wait in a bounded queue (256) that the layer flushes every frame. A
  knocked-down witness is never lifted by one.
- *Vehicle accidents:* a car hit raises an accident witness event (severity 0.55 + closing/15,
  16 m radius), at most one pass per 0.25 s because a pass rebuilds the grid. Three or more
  reacting produce a `crowd_gasp`.

**Event hooks** (`src/app/feedback-bus.mjs`): `vehicle_impact`, `vehicle_runover`,
`pedestrian_scream`, `punch_swing`, `punch_hit`, `pain_voice`, `crowd_gasp`, `panic_voice`.
Each kind has a cooldown, coincident events of one kind merge into one (the loudest), and a frame
delivers at most 6.

**Audio.** Still entirely synthesised: no samples are shipped and there are no new assets or
licences.
- *New sounds:* a swing (a band of noise sweeping up), a punch hit (a body thump plus a short
  slap), a vehicle–person impact (heavier and lower), and a run-over thump.
- *Pooling and caps:* noise buffers are generated once per length and shared (it was a fresh
  random buffer per hit). At most 6 one-shots ring at once, and nothing starts on a suspended
  context, which never releases a source and would have pinned the cap.
- *Voices:* pain (うっ／いたっ／ぐっ) and gasp (えっ) go through the simulation's own voice queue,
  so its per-person cooldown and the 4-voice cap apply.

**Camera and visual.** Person hits added shake multiplied by the number hit in the frame, so a
crowd pinned the camera at full throw (0.42 m). There is now one bounded knock per frame of
contact (max 0.45) and a small punch knock (max 0.25). A contact raises a low road-dust puff from
the existing 72-particle effects pool, adding no draw call. The existing blood marks were not
increased.

### 11.5 Browser acceptance

Real HIGH/day scene, `?qa=1&hq=1`, headless Chromium on SwiftShader. Every scenario opened a
fresh page, and each checkpoint took the same census: population, owners, legacy props and
bodies, Skeleton and AnimationMixer counts, draw calls, non-finite transforms, behaviour
histogram, disowned and struck bodies, and feedback bus statistics.

**A. Old-looking bodies.** Checked at start, middle and end of every scenario below:
- 0 legacy props and 0 legacy bodies on HQ or near citizens;
- 0 citizens drawn twice and 0 baked;
- HQ 1,968–1,970 plus 7–8 near humanoids, population 1,976–1,978 (the gap is victims
  recycling).

**B. Signal waiting** (two full red → green cycles, simulations pumped to each phase and then
40 s of real frames to apply the clips):

| Cycle | Red: HQ waiting Idle | Red: near Idle | Green: HQ crossing Walk | Green: near Walk |
| --- | --- | --- | --- | --- |
| 1 (signal 140 s / 200 s) | 1,455 / 1,455 | 8 / 8 | 1,455 / 1,455 | 8 / 8 |
| 2 (signal 248 s / 308 s) | 1,456 / 1,456 | 7 / 7 | 1,455 / 1,455 | 8 / 8 |

No waiting citizen was on Walk and no crossing citizen on Idle.

**C. Vehicle impacts** (player car aimed at a single pedestrian, then at the densest 4 m cell):

| Case | Kind | Face | Closing | Travel | Direction vs expected |
| --- | --- | --- | --- | --- | --- |
| Low, 4 m/s | knock | front | 6.51 m/s* | 1.15 m | 6.6° |
| Mid, 9 m/s | knock | front | 5.62 m/s | 1.47 m | −2.3° |
| High, 15 m/s | heavy | front | 9.69 m/s | 3.88 m | 0° |
| Diagonal, 9 m/s, 0.8 off-centre | heavy | front | 8.77 m/s | 2.97 m | −12.3° (deflected off the corner) |

\* The low-speed pedestrian was walking into the car, which adds to the closing speed.

- *Every victim:* HQ went DOWNED on `Fall`, with the HQ body 0 m from the simulation's and a
  flight arc of at most 0.28 m.
- *Dense cell of 88 at 10 m/s:* 5.1 m/s after 7 hits, 0.68 after 18, then stopped. The car
  was not carried through.
- *After the hits:* 17 DOWNED and disowned, 56 AVOID, 83 LOOK (witness tiers). Eighteen
  seconds later there were 0 disowned and 0 struck, and the victims had recycled.
- *Feedback:* 70 events emitted, 23 merged, 6 throttled, 41 delivered, at most 3 in one frame.
- *Smoke (§F):* a dense cell of 122 took 7 hits and stopped the car.

**D. Melee** (12 swings next to walking pedestrians, 10 hits):
- *Clips:* both `Punch` and `PunchCross` played. The hit landed at clip progress 0.115 / 0.20,
  inside the measured window (one frame of ordering offset).
- *Victims:* every near-body victim played `Hit` for the blow's hold.
- *Answers:* back off 5, fight 4, flee 1.
- *Afterwards:* all NORMAL again after 16 s, and no hostile left.
- *Feedback:* 32 events, at most 2 in a frame.

**E. Witnesses.** Tiers were seen live in C (AVOID close, LOOK further out). Escalation from LOOK
to AVOID/FLEE is pinned by `tests/awareness.test.mjs`, including the 256-entry bound.

**F. Long mixed smoke** (one page, in order): walk → run → wait at red at the scramble kerb →
cross on the green → three punches on one pedestrian → carjack → drive → hit → dense crowd →
get out → walk → 20 s settle.
- *Punches:* three hits, light/back, strong/left, then light/left and fatal. The victim, a
  fleer, went DOWNED on `Fall` under HQ ownership.
- *Carjack:* succeeded, and the thrown driver was later milling with `cameFromVehicle` set.
- *Hit:* the single-pedestrian hit in this run found no clear line (a building stood between
  car and target) and was skipped. C covers it.
- *Dense crowd:* 7 hits, car stopped.
- *Settled:* population 1,978 (HQ 1,969, near 8), every HQ citizen NORMAL, 0 reacting, 0 down,
  0 disowned, 0 struck. 62 drivers seated, 0 legacy props or bodies, 0 non-finite.
- *Feedback:* 19 emitted, 5 merged, 1 throttled, 13 delivered, at most 3 in a frame.
- *Harness notes:* the harness stepped the player onto the road after getting out, and a
  passing kei car ran the player over. That is existing behaviour (the `轢かれました` retry
  banner). The run hit its 90-minute wall-clock limit before the last two steps; they were
  finished on the same open page.
- *Errors:* all 50 page log entries of the run were replayed on re-attach: 0 errors,
  0 exceptions, 0 shader failures. The only warnings were Chrome's headless AudioContext
  autoplay notices.

**G. Structure.**
- 0 `Skeleton` and 0 `AnimationMixer` on crowd citizens in every census.
- HQ draws stayed at 12; total draw calls 442–461 (RUN 10: 444–458).
- No per-pedestrian physics bodies.
- Audio: 0 one-shots ringing in any census (the headless context stays suspended). The pool
  cap and the suspended guard are pinned in `tests/player-audio.test.mjs`.
- No new startup work: the noise buffers are built lazily, once per length.

**Console gate.** Fresh pages, HIGH, `hq=1`, day then night, on the RUN 11 code. Day covered
walking, running, a punch, boarding, driving and getting out; night covered load and idle.
- **0 errors, 0 uncaught exceptions, 0 shader-compile messages, no `[role="alert"]` banner.**
- 0 Skeletons and 0 Mixers. HQ 1,969 (day) and 1,972 (night); draw calls 473 / 477.
- The only warnings were 3 per page of Chrome's AudioContext autoplay notice, as in RUN 10.

**Final gates** (HEAD `6162a32`, before this document):
- `npm run typecheck`: clean.
- `npm test`: 439 total, **434 pass, 5 existing skips, 0 fail**. That is 36 new tests over
  RUN 10's 403/398/5/0, with no regression.
- `npm run build` (run by `npm test`): successful, and the static re-bake left the tree
  unchanged.

**RUN 10 limitations closed by this RUN:**
- LOOK no longer walks a waiting citizen on the spot.
- The throw is now drawn on the HQ body (`crowd.follow`).
- A light push no longer knocks anyone down.
- The NPC hit reaction is directional in movement: the push goes away from the fist and is
  classified by quarter. It still uses the same `Hit` clip, so it is not directional in
  animation.

**Remaining known limitations:**
- **`Hit_Knockback` is not integrated.** UAL2 is CC0 by its authors' statement, but this
  repository fetches character sources only through `assets/character/upstream.lock.json`, with
  the official archive's hash, and UAL2 has no pinned lock here. Adding it is an asset-pipeline
  change, not a RUN 11 polish item. The victim's `Hit` still barely moves, and a front blow and
  a back blow play the same clip; the stagger and push carry the direction.
- **HQ and near citizens carry no props.** Masking the legacy props removed the capsule-sized
  box phones and cone umbrellas. The HQ pack has no prop meshes, so no citizen near the player
  shows a phone, bag or umbrella now. That needs new assets.
- **Crossing and cast victims are not stopped.** A victim on a crossing or in the scramble cast
  takes the blow (HQ HIT and near `Hit`) but is not staggered by the simulation, for the reason
  in §18.
- **The kerb queue flag rarely fires in practice.** The cast's own `exiting`/`recycle` states
  cover most of the scramble. It exists for non-cast queues behind a closed crossing.
- **A stationary player car still makes people within 8 m ahead AVOID** (RUN 10, unchanged).
- **The near pool has no reaction clocks** (RUN 10, unchanged). Its eight bodies react on the
  frame.
- **Audio could not be heard in this environment.** The headless AudioContext never leaves
  `suspended`. Scheduling, pooling, caps and the suspended guard are unit-tested against a fake
  context, but loudness and mix balance need a listening pass in a real browser.
- **Third-cycle central-stream spillback in the browser** (RUN 10 K) stays a known limitation.
  RUN 11 does not touch traffic or signals, and the two signal cycles above ran without it.
- The player can be run over by traffic after getting out in a road. This is existing
  gameplay and is unchanged.

**Performance observations** (structural only; SwiftShader frame rates are not a result):
- Nothing new per frame is O(population). The feedback bus is O(events), with a 6-event cap.
- The witness escalation queue is bounded at 256 and flushed in O(pending).
- A vehicle contact costs a grid lookup of the car's cells, as before.
- The accident witness pass reuses `witness`, at most 4 times a second.
- No new draw calls: dust uses the existing particle pool, and props were removed.
- Noise buffers are built lazily, once per length.

**Carried to RUN 12:**
- The HQ layer ranks all ~1,978 citizens every frame (~2.3 ms).
- `witness` rebuilds the grid on every call (0.56 ms at 1,978). The accident pass makes this
  more frequent in dense crashes, capped at 4 per second.
- The QA-only `ownership()` census is O(population); it is QA-gated.
- LOW/MEDIUM prebake coverage.

**New assets and licences:** none. Every RUN 11 sound is synthesised at runtime. No samples, no
models, no textures and no new dependencies.

**Commits** (on `claude/gta-fidelity-upgrade`, on top of `b037bc8`):

```
401334e  RUN 11.0: fix crowd render and signal-idle regressions
db1d180  RUN 11.1: directional vehicle impact, weight, and crowd resistance
efb6fbf  RUN 11.2: a punch that reads as a punch, and victims who answer it
082f702  RUN 11.3/11.4: witness panic, feedback events, audio, camera, dust
4225ab8  RUN 11.4: never start a one-shot on a suspended AudioContext; QA hooks for feedback and audio
6162a32  RUN 11.5: report the last landed blow (victim, answer, strength) in the melee snapshot for QA
```

This document is committed on top of `6162a32`; `git log -1` is the final HEAD.

**RUN 11 COMPLETE.** RUN 12 was not started.

## 10–15. Historical roadmap (superseded by §9g)

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

## 16. Metrics

### At the close of RUN 9

`qa/gta-upgrade/occupancy-cost.mjs`, real Shibuya graph, CPU and counts only.

| tier | cars | drivers | `reconcileOccupancy` | drivers drawn | driver layer | draws | skeletons | mixers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| low | 17 | 14 | 6.2 µs/f | 3 | 22.2 µs/f | 3 | **0** | **0** |
| medium | 37 | 30 | 7.2 µs/f | 4 | 36.3 µs/f | 3 | **0** | **0** |
| high | 74 | 62 | 3.3 µs/f | 11 | 15.6 µs/f | 3 | **0** | **0** |

Both terms are noise against a 16.7 ms frame. `reconcileOccupancy` is O(pool) on a fixed 146
slots over typed arrays; the driver layer is bounded by its 46 m radius rather than by the
traffic count, which is why HIGH with 62 drivers is no dearer than LOW with 14. Occupancy
storage is **1,460 bytes for the whole city**. In the live scene the layer drew 8 at the
scramble camera and 14 standing beside a taxi, at ~0.1 ms.

**RUN 7's architecture is intact.** Nothing in RUN 9 added a skeleton or an AnimationMixer.

### At the close of RUN 8

Scene, HIGH / day / scramble, HQ crowd on, headless SwiftShader. CPU and counts only.

| | value |
| --- | ---: |
| draw calls, player mode with the city settled | 763 |
| HQ crowd drawn | 1,945–1,973 |
| HQ skeletons / mixers | **0 / 0** |
| HQ draw calls | 12 |
| shader compile failures | **0** (was 1 — see §9e) |
| console errors | **0** |
| `melee.update` | 11–17 µs/frame, flat from 64 to 1,978 people |
| `witness`, offline bench at 1,978 | 0.56 ms/punch |
| `witness`, live scene | 2.1 ms/punch |
| people reacting to one punch, live | 206–278 |
| crossings completed during combat | 22, **0 abandoned, 0 stuck** |
| tests | **326 / 326** |

No frame rate is reported. This hardware cannot produce performance evidence.

### At the close of RUN 6

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

**`'instanceColor' : redefinition` — every vehicle lost its shadow.** A `ShaderMaterial` is
given three.js's vertex prefix, which already declares `instanceColor` under `#ifdef
USE_INSTANCING_COLOR`; `src/traffic/vehicle-shadow.mjs` declared it a second time. The program
never compiled, the frame log filled with `useProgram: program not valid`, and the scene told
the user roads and buildings might be missing. It only appeared once a `setColorAt` had
created the buffer that defines the macro, which is why it looked like a player-mode problem.
Found by RUN 8's browser QA; no unit test could see it, so `tests/vehicle-shape.test.mjs` now
asserts that no custom shader declares an attribute the renderer injects.
**A red banner in a QA screenshot is a blocker, not scenery** — this one had been on screen in
earlier runs and was read past.

**Combat silently did nothing to 74-85% of the crowd.** `eligible` excluded
`p.choreographed`, and the choreographed Scramble cast IS the crowd in the crossing. Punches at
a pedestrian 8 cm away all missed. A car could always knock the cast down through `strike` --
`simulation.step` tests `struck` before it hands a choreographed pedestrian to
`choreography.move` -- so only the fist was blocked. Every NPC in the combat tests was built
with `choreographed` falsy, so 23 passing cases tested only the minority the code already
worked on. **When a test helper omits a flag, it is testing the flag's absence.**

**A carjack that never took the car.** The commit branch tested `pose.kind === 'enter'`, so a
carjack ran its whole sequence -- driver alerted, hauled across the sill, thrown on the road --
and then handed the car straight back, because the line that takes the wheel did not recognise
the kind that had just earned it. **When a sequence is a variant of another, every branch that
names the original has to be checked, not just the ones that obviously matter.**

**A camera that shot the entry from inside the bodywork.** The follow camera framed the player
until `driving`, which is the END of the sequence, so through the ENTRY and SEAT stages it
tracked a point inside the vehicle and the eye sat on the roof. `seated` arrives before
`driving` does, and that is the moment the framing has to change.

**A driver drawn perfectly and hidden completely.** The seated driver was correct from the
first run; the cabin `glass` was an opaque MeshStandardMaterial, so no car in the scene could
ever show an occupant. Before concluding that something is not being drawn, check whether it
is being drawn behind something.

**Reading a browser symptom as environment before testing it.** The first diagnosis of the
banner above was "the browser has been open for an hour". A clean browser reproduced it in 35
seconds. Check the fresh case before blaming the harness.

**RUN 10 closing bugs (§9g).** Do not reintroduce any of these:
- **Baked eleven-bone figures in the near ring while the HQ crowd covers the scene.** The near
  pool keeps humanoids only (`setHQCovered`).
- **An inside-out `loft()`.** Keep the signed-volume tests; a hollow-looking car is a winding
  bug, not an opacity bug.
- **A uniform .55 m solid margin.** It closes 35 lane poses; the ends need it and the sides do
  not.
- **A reaction cooldown that blocks escalation.** It blocks repeats only, at or below `calmed`.
- **Near bodies choosing awareness over a live car warning.** Use `nearReaction()`.
- **Handing back a body the simulation still holds down** (double fall), or snapping it to the
  simulation position on hand-back.
- **Auto-parking the player car on a crossing or in a traffic lane.** One parked car can
  freeze every signal on the map through the crossing-clear hold.
- **Timing a live check on wall time under SwiftShader.** `FrameGate` clamps each frame to
  0.1 s, and at 0.2 fps a 14 s wall window is about 0.3 s of simulation.

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
| `qa/gta-upgrade/signalcycle.mjs` | full signal cycle + drain test, headless |
| `src/life/hq-threat.mjs` | **RUN 7A** — spatial grid + mass vehicle reaction |
| `scripts/bake-crowd-hq.mjs` | **RUN 7A** — offline bake: LOD geometry + bone atlas |
| `tests/hq-crowd.test.mjs` | pins no-skeleton, draw calls, identity, multi-hit, query bound |
| `qa/gta-upgrade/hqcrowd.html` | the HQ crowd bench, with a vehicle mode |
| `qa/gta-upgrade/hq-ladder.mjs` | the scale ladder |
| `qa/gta-upgrade/hq-vehicle.mjs` | the mass reaction measurement |
| `src/life/awareness.mjs` | **RUN 7 WIP** — NPC perception / life states, unverified |
| `src/life/simulation.mjs` | crowd sim: routes, crossings, `scatter`, `strike`, signals |
| `src/player/controller.mjs` | player movement and input |
| `src/player/combat.mjs` | **RUN 8** — phased melee: swing clock, hit window, witness events |
| `src/player/attack-timing.mjs` | **RUN 8** — the measured clip windows; generated, not chosen |
| `tests/combat.test.mjs` | **RUN 8** — 23 cases; the audit found zero before this |
| `qa/gta-upgrade/punch-timing.mjs` | **RUN 8** — measures each punch clip's active window |
| `qa/gta-upgrade/combat-cost.mjs` | **RUN 8** — melee and witness CPU against population |
| `src/traffic/occupancy.mjs` | **RUN 9** — the one authority on who is in which car |
| `src/traffic/drivers.mjs` | **RUN 9** — seated drivers: 3 draw calls, no skeletons |
| `src/traffic/vehicle-anchors.mjs` | **RUN 9** — seat / door / entry / exit in world space |
| `src/player/carjack.mjs` | **RUN 9** — what happens at each carjack stage |
| `src/player/vehicle-transition.mjs` | **RUN 9** — staged enter / exit / carjack |
| `tests/vehicle-occupancy.test.mjs` | **RUN 9** — 33 cases, including an invariant fuzz |
| `qa/gta-upgrade/occupancy-cost.mjs` | **RUN 9** — occupancy and driver CPU per tier |
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
- **A 120-second signal cycle was measured headlessly in RUN 10** (§9g). RUN 11 captured two
  live browser red → green cycles with the awareness pass running (§9h B); the RUN 10
  third-cycle central-stream spillback is still open.
- ~~The HQ crowd looks washed out in the scene.~~ **Fixed in RUN 7C** — it was a colour-space
  bug in the crowd shader, not the scene. See §9d.
- **The garment boundary softens at LOD2.** Decimation blurs the mask, so a sleeve fades into
  the arm over several centimetres. Acceptable at the distance L2 is used, visible if L2 is
  ever brought close.
- **Near-humanoid aim is 71–74%**, down from RUN 6's 84–85%: a citizen only takes a humanoid
  of their own archetype, so when three of the nearest share one archetype the third waits on
  a baked figure. Deliberate — see §9a.
- The body is Quaternius' Superhero base. Proportions are stylised and the face is minimal.
  It is a pipeline placeholder and is deliberately not polished — but "not the final asset"
  is not a defence of the clone problem, which is a distribution problem, not a quality one.
- **Old RUN 7 awareness is deprecated.** It was discovered running in production and
  replaced in RUN 10.1; see §9g for the sole current authority and browser QA limitation.
- `hit` is still a **C**: the current `Hit` clip barely moves. `Hit_Knockback` in Quaternius
  UAL2 (CC0, verified, identical 65-bone skeleton, 2.93 m of travel) is very likely the answer
  and needs no retargeting. Not implemented — RUN 5.5 was the Run slot only.
- LOW and MEDIUM prebake coverage is incomplete — see
  `docs/ISSUE-LOW-TIER-PREBAKE-2026-09-20.md`. RUN 13 is where this is scheduled.
- Foot IK is player-only in the solver's *design intent*; RUN 6 gives it to up to 8 near
  humanoids under an explicit budget. Beyond that is unmeasured.
- `npm run test:legacy` is an audit tool, not a merge gate.
- **A punched pedestrian on a crossing, or in the choreographed Scramble cast, keeps walking.**
  They take the damage, the alarm and the reaction, and they can be killed — but they are not
  stopped to fight. Stopping one mid-crossing holds their signal group and freezes every signal
  on the map, and a cast member would be put back on their track by `choreography.move` the
  next tick. Since the cast is 74–85% of the population, this means **most of the crowd can be
  hit and killed but will not brawl with you**; the ones that fight back are the sidewalk
  pedestrians and anyone who has left the cast inside their 14 s hostility window. A deliberate
  trade, not an oversight: see §9e.
- **`witness` rebuilds the crowd grid on every call**, which is O(population): 0.07 ms at 64
  people, 0.56 ms at 1,978. Two punches a second is ~1.1 ms/s and acceptable; anything faster
  than that would need the rebuild shared with `sync` rather than repeated.
- **There is one punch combination and no combos.** `Punch` and `PunchCross` alternate. There
  is no input buffering — a press during recovery is dropped, not queued — so the rhythm is
  the clips' own. Blocking, dodging, grappling and weapons do not exist.
- **The NPC hit animation is the existing `Hit`/knockdown chain, not a directional one.** A
  punch from the front and a punch from behind produce the same clip; since RUN 11 the push and
  stagger go away from the fist (§9h). `hit` remains a
  **C** for the reason recorded above.
- ~~The shader-compile banner appears in this headless SwiftShader browser.~~ **Fixed in RUN 8**
  — see §9e; it was a real redefinition in the vehicle shadow shader, not the environment.
- **Drivers sit on the left.** The vehicle anchors put `driverSeat` at −X, which for a Tokyo
  scene is the wrong side. Changing it would move the seat, door, entry and exit for all seven
  bodies and everything that reads them, and RUN 9's brief makes the anchors authoritative. It
  is cosmetic in play, because `doorPose` already approaches from whichever side is clear.
- **The seated driver is head, shoulders and a hint of arms.** No hands on the wheel, no head
  turn, no idle. It is what a cabin shows through tinted glass at the distance it is drawn, and
  it is deliberately not a character — see §9f.
- **The cabin glass is tinted at a fixed 0.62.** It was fully opaque before RUN 9, which is why
  no car could show an occupant. The value has not been checked against every time of day.
- **A carjack cannot be started on a moving car** (over 0.35 m/s). Pulling someone out at
  speed is a different feature.
- **Nobody steals a car back.** Traffic drivers do not react to the player beyond being thrown
  out, and no NPC ever takes a vehicle. Out of scope for RUN 9 by the brief.
- **One driver, one seat.** No passengers, and no occupancy for any seat but the driver's.

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
`nearCharacters`, which is the near pool's own `inspect()`, `hqCrowd`, and — in player mode —
`melee`, which is `createMeleeCombat().snapshot()`: swings, hits, misses, npcDeaths, witness
events and the current phase and clip. **Use it.** RUN 8 spent a whole QA round unable to tell
a hit from a miss because it did not exist, and read "the crowd reacted" as "the punch landed".
In player mode `window.__SHIBUYA_FIGURE__`, `__SHIBUYA_PLAYER__`, `__SHIBUYA_LIFE__` and
`__SHIBUYA_CTX__` are exposed.

**A caution about browser QA on this hardware.** The software renderer reports around 0.2 FPS
with the HQ crowd up, and `FrameGate` clamps `dt` to 0.1 s, so a 0.9 s animation takes about
six real seconds and inputs during its recovery are dropped by design. Anything paced against
wall-clock time will under-count. Shrink the viewport to raise the frame rate, or drive the
check off state rather than off delays. **Never report a frame rate from it.**

**Use §9g for the current RUN 10 awareness authority.** Older RUN 7 and old numbering
statements are historical; the next session should first obtain a real browser capture of
the RUN 10 awareness scenarios if a browser becomes available.

`window.__SHIBUYA_TRAFFIC__` is exposed under `?qa=1` as well, and
`__SHIBUYA_QA__.metrics` now carries `occupancy`, `seatedDrivers`, `transition` and
`lastCarjack`. **Use occupancy as the signal for whether the player got into a car** --
`car.state.active` is not one, because `ensureCar` spawns the player's own car already active,
and a probe waiting on it reports success before the sequence has even run.

Work one RUN at a time and close each one completely — implement, unit test, verify in a real
browser, capture screenshots and numbers, check for regressions, commit, push, update this
file — and stop and report before opening the next.

**Verify in the scene, not only in the suite.** RUN 8's two real defects were both invisible to
unit tests and both obvious in the browser: a shader that never compiled, and a punch that
could not touch 74–85% of the crowd. In each case the tests passed and the game was broken. If
a test helper omits a flag, the suite is testing that flag's absence — check what the live
simulation actually sets.

### The rules that are not negotiable

- Stay on `claude/gta-fidelity-upgrade`. Never merge to or push `master`.
- No `reset`, `rebase`, `force push`, or history rewriting. Do not revert `f6aa8e8`.
- Do not drop a stash you did not create.
- No engine rewrite, no React-Three-Fiber, no Rapier, no skeletons for the full ~2,000 crowd.
- No GTA V assets, source or leaks. No asset whose licence has not been verified **from the
  bundled licence file**, not from a web page.
- Do not reopen run-clip search, CMU subject search, arm retargeting, or gait research.
