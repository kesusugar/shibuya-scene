# GTA Fidelity Master Plan — status and handoff

The one document to read when resuming this work with no conversation history. Read
`AGENTS.md` and `CLAUDE.md` first for the repository rules, then this.

**Updated for the ChatGPT Work handoff.** RUN 6 is complete. RUN 7 exists only as an
unverified WIP commit. **The next task is RUN 6.8, not RUN 7** — see §9a and §21.

## 1. Goal

Turn the Shibuya scramble scene into something that reads like a GTA-style street: a player
you can walk, run, fight and drive with, in a crowd that reacts, at a fidelity that holds up
when the camera is two metres from a person's face. Fourteen RUNs, sequential, each closed
with tests, in-browser verification, numbers, and a commit before the next begins.

Not a goal: a physics rewrite, an engine swap, or a photoreal character. The Superhero body
in use now is a placeholder for the pipeline, not the final visual asset.

## 2. Branch and HEAD

- Working branch: **`claude/gta-fidelity-upgrade`**, pushed to `origin`. Stay on it.
- HEAD at handoff: **`f6aa8e8`** — local and remote match, working tree clean, no stashes.
- The last **complete** RUN is `b32e5a7` (RUN 6). `f6aa8e8` on top of it is the RUN 7 WIP.
- `master` is untouched by this work and must stay that way. It moved ahead independently
  (PRs #17 and #18 from `codex/prebaked-motion`); the local `master` here is `c538aa2`, a
  clean ancestor of the remote `39175bd`. Nothing has been merged into or pushed from it.

Checkpoint history, newest first:

```
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
| 6.8 | Near-humanoid clone break | **NEXT TASK — not started** |
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

## 9a. RUN 6 succeeded technically, and still looks like clones — RUN 6.8

RUN 6 met every criterion it set: humanoid budget held at 8, far crowd 1,978, console errors
0, foot IK bounded, all three tiers within budget. **The visual result is still wrong**, and
saying otherwise would be marking our own homework.

Looking at the near crowd, most people share:

- the same hair silhouette
- the same head
- the same body proportions
- the same clothing geometry

Eight people who differ only in colour read as **one person recoloured eight times**, not as
eight people. Skin and clothing colour variation is not enough, and no amount of additional
palette entries will fix it, because the thing the eye is reading is *shape*.

So the next task is **RUN 6.8 — Near Humanoid Clone Break Pass**, before RUN 7.

### What the current asset actually contains

Audited, not assumed — `node qa/gta-upgrade/asset-audit.mjs`:

```
public/data/character/citizen.glb   1,414,612 B
meshes   3     Eyebrows (984 tris) | Eyes (768) | SuperHero_Male (13,867)
bones    65
morph targets    NONE
hidden / optional meshes    NONE
separate hair / hat / accessory meshes    NONE
```

**The hair is merged into the body mesh.** `convert-character.mjs` takes one hairstyle
(`Hair_SimpleParted`, 757 vertices) and merges it into the body geometry at bake time so a
citizen stays one draw call. That is a good decision for cost and it means the shipped asset
has **no runtime lever for silhouette at all** — no alternate hair to swap, no optional parts
to hide, no morph targets to push.

So with the asset as it ships today, only these are possible:

| lever | available now? | how |
| --- | --- | --- |
| skin / top / bottom / hair / shoe colour | **yes** | vertex-colour garment mask, uniform write |
| overall height | **yes** | already used (`setHeight`) |
| shoulder / torso width, limb length | **yes, unused** | per-bone scale on the shared skeleton |
| hair silhouette | **no** | merged into the body mesh at bake time |
| head shape | **no** | one head, no morph targets |
| clothing geometry | **no** | painted on, not modelled |

### The good news: the archetypes already exist, CC0 and verified

The upstream Quaternius pack already downloaded for RUN 2 (`assets/character/upstream/`,
gitignored, CC0-1.0 verified from the bundled `License_Standard.txt`) contains **more than
the one body and one hairstyle currently baked**:

```
BaseCharacters/  Superhero_Male_FullBody     13,867 tris
                 Superhero_Female_FullBody   15,060 tris
Hairstyles/      Hair_Buzzed                    830 tris
                 Hair_SimpleParted            1,301 tris
                 Hair_Long                    2,906 tris
```

**All four alternates share the identical 65-bone skeleton** — verified by comparing bone
name lists, not by trusting the folder layout. That means:

- no retargeting, no new rig, no skeleton budget change
- every existing clip, the Hybrid Run included, plays on all of them unchanged
- **2 bodies × 3 hairstyles = 6 combinations from assets already licence-checked**

So RUN 6.8 does not need a new download, and the "record a future asset spec instead of
faking it" fallback is **not** required. Do not go asset hunting.

### RUN 6.8 — scope

Keep the current architecture exactly: one humanoid system, one skeleton, one animation set,
near/far split unchanged, far crowd instanced and unchanged at ~1,978.

Add **3–4 appearance archetypes**, in this priority order:

1. **hair / head silhouette** — the strongest signal, and the one that needs the bake change
2. **height** — already implemented, widen the spread
3. **shoulder / torso width** — per-bone scale, free, currently unused
4. **clothing silhouette impression** — what the mask can suggest without geometry
5. **colour** — already done; last, not first

Deterministic distribution: an archetype is chosen from the citizen id, exactly as the
wardrobe already is, so a body keeps its identity across pool reuse.

**Forbidden, as before:** 8 unique GLBs, 32 unique character assets, a new rig, a larger
skeleton budget, humanoid far crowd, any animation system rewrite.

### The decision RUN 6.8 has to make first

The bake currently produces **one** `citizen.glb` at 1.41 MB containing geometry *and* all
fifteen clips. Four archetypes must not become four copies of the animation data — the clips
dominate that file, and payload is a hard constraint (see §4: prebaking and startup time).

Two candidate shapes, both of which keep one skeleton:

- **One file, several body meshes.** Bake male+buzzed, male+parted, female+long, … as
  separate skinned meshes sharing one skeleton and one clip set; the pool shows one and hides
  the rest per slot. Costs geometry once, animations once. Most likely the right answer.
- **A small variant file per archetype, plus one shared animation file.** More requests, more
  lifecycle, and the late-load path already exists — but it splits payload per tier.

Measure before choosing. `qa/gta-upgrade/asset-audit.mjs` prints the triangle counts;
`qa/gta-upgrade/poolprobe.mjs` and `tierprobe.mjs` already measure the pool's cost and will
show what an archetype mix does to the budgets in §9.

### RUN 6.8 acceptance

- near humanoid budget still 8 / 4 / 0 (HIGH / MEDIUM / LOW), verified by `tierprobe.mjs`
- far crowd still ~1,978
- console errors 0
- draw calls and triangles within the same order as §16; any increase stated and justified
- **a screenshot of eight near citizens in which they are visibly different people** — this
  is the criterion the run exists for, and numbers cannot stand in for it
- typecheck, `test:ci`, `build` all clean

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
npm run test:ci     264 / 264 pass
npm run build       succeeds
```

**264 passing tests does not mean RUN 7 is complete.** Ten of those tests are the RUN 7 WIP's
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
| `qa/gta-upgrade/asset-audit.mjs` | what the citizen asset contains; RUN 6.8 feasibility |
| `qa/gta-upgrade/poolprobe.mjs` | near-pool budget and aim under churn |
| `qa/gta-upgrade/tierprobe.mjs` | budgets across HIGH / MEDIUM / LOW, and tier demotion |
| `qa/gta-upgrade/` | the other benches; the numbers above come from here |
| `scripts/test-current.mjs` | the test list that gates this work |

## 18. Known limitations

- **The near humanoids read as clones.** This is the largest open visual problem and the
  reason RUN 6.8 exists. Same hair silhouette, same head, same proportions, same clothing
  geometry; only colour varies. See §9a.
- The body is Quaternius' Superhero base. Proportions are stylised and the face is minimal.
  It is a pipeline placeholder and is deliberately not polished — but "not the final asset"
  is not a defence of the clone problem, which is a distribution problem, not a quality one.
- **RUN 7 is unverified.** `src/life/awareness.mjs` is wired into the live crowd at HEAD and
  has never been run in a browser. If the next session is not doing RUN 7, it should still be
  aware that HEAD contains untested code on the crowd path.
- `hit` is still a **C**: the current `Hit` clip barely moves. `Hit_Knockback` in Quaternius
  UAL2 (CC0, verified, identical 65-bone skeleton, 2.93 m of travel) is very likely the answer
  and needs no retargeting. Not implemented — RUN 5.5 was the Run slot only.
- Near-pool aim is 84–85%, not 100%. The remainder is the swap hysteresis and one swap per
  frame, both deliberate; closing it would cost visible clothing pops.
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
