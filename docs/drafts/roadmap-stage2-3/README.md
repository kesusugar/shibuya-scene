# Roadmap stages 2 and 3 — unfinished drafts (not wired, not run by any test suite)

Written while the stage 1 capture ran, then stopped when the work was handed over. Nothing here
is imported by the game. Move each file to its target path, then wire it as described.

| File | Target | Status |
|---|---|---|
| `street-reactions.mjs` | `src/life/street-reactions.mjs` | Hands up at gunpoint, leg wounds (`legWound`, `woundedPace`), armed civilians who draw and shoot back (events shaped like `police/guns.mjs`). Pure. Tests in `stage2.test.mjs` passed against it before the move. |
| `body-states.mjs` | `src/player/body-states.mjs` | Figure layers: `createHandsUp` (two-bone IK both arms), `createLimp` (stiff right knee, pelvis drop), `createUpperPose` (SwordIdle upper body while walking). Not yet run on the body. |
| `stage2_patch.py` | run from the repo root after moving the files | Edits figure.mjs (Crawl overlay, hands up, limp, sword walk), near-characters.mjs (state fields, priority, civilian guns), simulation.mjs (surrender/shooter hold, wounded pace, reset fields), combat.mjs (leg wound on a non-fatal leg round), ragdoll.mjs (walls and cars via `setRagdollWorld`). Paths inside assume `/home/user/shibuya-scene/`; change `root` if needed. Not yet applied or tested. |
| `stage2.test.mjs` | `tests/stage2.test.mjs` | The pure tests pass; the figure tests (hands up, limp/crawl, sword walk) need the patch **and** a rebake of `citizen.glb` with a `Crawl` clip. |
| `helicopter.mjs` | `src/police/helicopter.mjs` | ☆4+ helicopter: arrival, orbit, searchlight sweep spiral, `sees` for the wanted level; procedural mesh with a fake light (cone + ground spot, no real light). Pure. |
| `stage3.test.mjs` | `tests/stage3.test.mjs` | 4 tests, passed against `helicopter.mjs` before the move. |

Still to do for stage 2 besides the patch:
- Crawl clip: add `Crawl:'Swim_Fwd_Loop'` to `CLIPS` in `scripts/convert-character.mjs`, run
  `npm run fetch:character` (if the upstream is absent) and `npm run convert:character`, check the
  pose on a bench (the swim is prone, head along +Z, hands below the root; `CRAWL.lift` = .36 is a
  guess).
- Scene wiring (app/ShibuyaScene.tsx): create `createStreetReactions()`; each frame call
  `update(dt, {crowd, me, aimedId, shotAt, solid})` (arsenal needs an `aimedAt` id getter: the lock
  target or the ray target while aiming); draw its shot events with the police revolver code path
  and call `player.hurt(e.damage)` on a hit; `provoke(who)` on `bullet_hit` / `blade_hit` /
  `punch_hit`; `setRagdollWorld({solid, cars})` each frame with boxes for nearby cars.

Still to do for stage 3: wire the helicopter into `police/director.mjs` (`seen ||= heli.sees`),
draw the mesh in the scene, add a rotor sound, draw the search circle on the minimap (play-ui
`draw()`: circle at `lastSeen`, radius `searchRadius`, while `flashing`), and put roadblocks and new
patrol cars ahead of the player's travel direction (pincer) in `police/units.mjs` (a roadblock at
☆4 already exists; it picks a random direction).
