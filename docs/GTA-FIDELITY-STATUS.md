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
- HEAD: **`cd5c1bb`** (RUN 8.4) — working tree clean, no stashes.
- The last **complete** RUN is **RUN 8**. `f6aa8e8`, well beneath it, is the RUN 7 WIP and is
  still unverified — nothing since has changed that.
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
| 7 | NPC life / behaviour states | **WIP ONLY — NOT VERIFIED, NOT COMPLETE** |
| 8 | Melee combat phases + mass crowd reaction | **COMPLETE** |
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

## 16. Metrics

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

**Reading a browser symptom as environment before testing it.** The first diagnosis of the
banner above was "the browser has been open for an hour". A clean browser reproduced it in 35
seconds. Check the fresh case before blaming the harness.

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
- **The NPC hit reaction is the existing `Hit`/knockdown chain, not a directional one.** A
  punch from the front and a punch from behind produce the same animation. `hit` remains a
  **C** for the reason recorded above.
- **The shader-compile banner appears in this headless SwiftShader browser.** See §9e; it is
  an environment result, recorded with what was and was not established about it.

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

**Start at RUN 9, not RUN 7.** RUN 8 is complete (§9e). The RUN 7 awareness WIP at `f6aa8e8`
is still unverified and is not a prerequisite for anything that followed.

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
