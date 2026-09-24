# Plan: the player bumps into people instead of passing through them

Status: **PLAN, not implemented.** Written 2026-09-24, after PR #22 (master `3e15698`). The
work itself happens in a local Claude CLI session on the user's PC, so that it can be checked
on the real device (Chrome + phone). Read `AGENTS.md`, `CLAUDE.md` and
`docs/GTA-FIDELITY-STATUS.md` (§9j, §9k, §16a) first.

## 1. What is wrong today

- **The player collides with static solids only.** `advance()` in `src/player/controller.mjs`
  checks `ctx.solid(x, z, PLAYER.radius)` and nothing else, so the player walks through every
  pedestrian.
- **Pedestrians are not bodies to the player.** Ordinary walkers avoid each other through
  `CrowdSimulation.blocked()` (`src/life/simulation.mjs`), but the choreographed Scramble cast
  (74–85% of the crowd) skips `blocked()` by design, so their crossing timing never stalls.
- **Pieces that already exist and are reused here:**
  - `CrowdSimulation.flee(p, ax, az, {dodge: true, ...})`. The slow player car uses it
    (`vehicleThreat`, below `DODGE_SPEED`) to move anyone standing inside its footprint out
    sideways. It works on the choreographed cast too, through `fleeOffX/fleeOffZ`, and the
    tiered return (RUN 12.4) brings them back onto their track. It never calls `leave()`, so
    no signal group is held.
  - `reactToRunner()` (`src/player/crowd-interaction.mjs`). At ≥ 2.5 m/s, people in a
    2.8 m cone ahead of the player scatter sideways.
  - The victim side of a blow:
    - `p.hurtUntil / hurtDuration / hurtX / hurtZ / hurtStrong` drive the near figure's `Hit`
      overlay and recoil (`src/player/figure.mjs`, `hitRecoil`);
    - `hqLayer.blow({victim, blow, response})` drives the HQ crowd's light flinch
      (`src/life/hq-layer.mjs`).
  - `crowd.say(p, kind, urgency)`, the feedback bus (`src/app/feedback-bus.mjs`) and the
    soundscape (`src/audio/soundscape.mjs`), for voice, camera knock and sound.

## 2. Decisions (closed)

- **No physics engine.** Rapier is out by the project's architecture rules
  (`docs/GTA-FIDELITY-STATUS.md`: "no Rapier"). A rigid body for each of ~2,000 people would
  not run on a phone, and physics pushing the choreographed cast would break the signal cycle.
  GTA V also resolves walking contact as capsule-vs-capsule with steering, and uses physics only
  for falls (ragdoll).
- **Pedestrian-vs-pedestrian collision is NOT part of this work.** The user decided so on
  2026-09-24. If it is ever done, it must be made extremely light first.
- **Knock-down on a sprint bump is OFF.** It stays behind a flag (`CONTACT.knockDown = false`).
  The user was asked and did not choose, so the safe default holds. Turning it on later reuses
  `crowd.strike()`, the simulation's existing knock-down.
- **Not while driving.** The car already has `vehicleThreat`. Everything here is on foot only.
- **Bounded work.** Every query reads the simulation's own 2 m grid around the player (3×3
  cells). There is never a scan over the population.

## 3. Steps

### Step A: contact core (the main work)

New module `src/player/crowd-contact.mjs`. It is pure and has no DOM or three.js, so it can be
tested headless.

- **`CONTACT` constants** (frozen):

  | Name | Value | Meaning |
  | --- | --- | --- |
  | `playerRadius` | `PLAYER.radius` (0.35) | the player's body |
  | `bodyRadius` | `RADIUS` (0.25) | a pedestrian's body |
  | `gap` | 0.6 | their sum |
  | `level` | 1.2 m | people more than this far above or below the player do not collide (station decks and bridges) |
  | `shove` | 0.45 m/s | the least the player can still move when fully boxed in |
  | `depenetrate` | 0.8 m/s | how fast an overlap that already exists is pushed apart |
  | `cooldown` | 0.6 s | per person, so the same body is not bumped every frame |
  | `knockDown` | `false` | see §2 |

- **`bodiesNear(crowd, x, z, y, r)`**. Collects the pedestrians from the 3×3 grid cells into a
  reused array, with no allocation per frame. It excludes anyone who is:
  - inactive, or `controlled` (the player's own crowd slot);
  - down (`struck !== undefined`) or `combatDead`, because the player steps over a body;
  - more than `level` above or below the player.
- **`resolveStep(state, dx, dz, bodies)`**. Returns the adjusted `{dx, dz}` and the contacts.
  - It removes the part of the step that would push the player's circle into a body's circle,
    so the player slides past someone the way `advance()` slides along a wall.
  - It never returns zero while there is input. When every direction is blocked it allows
    `shove * dt` along the input, and the people in front give way (below). A full
    scramble must never trap the player.
  - When the player already overlaps someone (the person walked into the player, or the
    player teleported), it separates them at up to `depenetrate`. The person gives way first;
    the player takes at most a third of the push.
- **Where it runs.** In `controller.step()`, after the movement vector is computed and before
  `advance()`. Walls stay in `advance()`, so the two are resolved separately and in the same
  order every frame. The controller gets an optional `ctx.bodies` hook, and `ShibuyaScene.tsx`
  wires it to `lifeEntry.hooks.current?.sim`. With no crowd, the behaviour is exactly today's.
  - `state.speed = min(speed, moved / dt)` already exists, so a blocked player's legs slow
    down by themselves.
- **The person's side.** For each contact the player is moving into, when `p.bumpUntil` has
  passed:
  - call `crowd.flee(p, away, {urgency: 0, dodge: true, from: state, speed: 1.2 + 0.3 * playerSpeed, distance: gap - d + 0.35})`,
    which is the same call as the slow-car nudge;
  - skip anyone already fleeing (`p.flee`);
  - add `crowd.stats.bumped`.
- **QA hook.** `window.__SHIBUYA_CONTACT__` (only under `?qa=1`) exposes
  `{checks, contacts, bumps, dodges, minGap, trappedSeconds, lastMs}`.

### Step B: people give way before contact

Extend `reactToRunner()` into `yieldToPlayer(crowd, state)`, keeping the existing runner
behaviour. It stays bounded to the same 3×3 cells, with `runnerUntil` as the rate limit.

| Player's pace | Who gives way | What they do |
| --- | --- | --- |
| Walking (0.5–2.5 m/s) | people in a 1.6 m cone ahead, within 0.7 m of the player's line | step 0.35–0.5 m aside with a `dodge` flee |
| Walking, oncoming | people facing the player within 2 m, even outside the cone | the same, with a deterministic side by `p.id` so pairs do not mirror each other |
| Running (≥ 2.5 m/s) | today's behaviour | today's behaviour |

A person on a crossing may shift only within the crossing; `flee` already enforces that
through `fleeAllowed`.

### Step C: what a bump looks and sounds like

- **Walking bump.** The person:
  - flinches lightly: `hurtDuration` 0.25, `hurtX/hurtZ` pointing away from the player,
    `hurtStrong` false;
  - is marked HQ-crowd `blow` with `response: 'backoff'`;
  - turns their head to the player, through the existing notice/head-turn path (12.4);
  - speaks for about 30% of ids, chosen deterministically: `crowd.say(p, 'alert', 0.4)`,
    capped by the voices' own limits.
- **Sprint bump (≥ 3.7 m/s).** A strong stagger:
  - `staggerX/Z` of about 0.6 m for people off rails; on-rails people get the dodge offset
    instead;
  - `hurtStrong` true, a low pain voice, and a body thud from the soundscape (`body` clips at
    low gain);
  - no knock-down while `CONTACT.knockDown` is false.
- **The player's side.**
  - Speed ×0.6 on the frame of contact.
  - A tiny camera knock through the feedback bus (a new `player_bump` event), which respects
    `SHAKE_SCALE` and reduced motion.
- **A bump is never a fight.** It must not:
  - change `combatHealth`;
  - open hostility (`combatTarget`);
  - count as a punch for `witness`;
  - raise the player's wanted or combat stats.

### Step D: tests, bench, device check

New `tests/crowd-contact.test.mjs`, registered in `scripts/test-current.mjs`. Each test must
fail on the code before this work.

1. **Walking into someone standing still:** over 3 s the centres never come closer than
   0.55 m, and the player slides past.
2. **A full ring of people within 0.7 m:** the player gets out within 3 s at 0.3 m/s or
   faster, so no trap.
3. **A choreographed cast member bumped mid-crossing:**
   - they get a dodge offset and return to their track (the offset reaches 0);
   - `leave()` is never called;
   - the signal cycle keeps advancing. Use the real network the way the robustness and flee
     tests do.
4. **Someone on another level** (more than 1.2 m above or below) does not block.
5. **A bump is not combat:** no health change, no hostility, no witness event.
6. **A sprint bump** staggers harder than a walking bump, and knocks nobody down while the
   flag is off.
7. **No crowd** (`ctx.bodies` absent): movement is exactly as before (the existing controller
   tests pass unchanged).

Bench `qa/gta-upgrade/contact-cost.mjs`, following `sync-cost.mjs`: 1,978 walkers at the
Scramble, the player walking through for 600 frames. Report the mean and p95 cost per frame.
Target: mean below 0.05 ms and p95 below 0.15 ms.

**Device check** (the user's PC, Claude in Chrome, the tab in the foreground):

- `?qa=1&tier=high&time=day&camera=scramble`, player mode, walking through the Scramble on the
  pedestrian green for 60 s. Read `__SHIBUYA_CONTACT__`:
  - `minGap ≥ 0.5`;
  - `trappedSeconds` under 1.5.
- **fps** with and without walking in the crowd: the cost of contact is within noise.
- **Signals** keep cycling (`__SHIBUYA_LIFE__` signal state), and nobody freezes on a crossing.
- **Console:** 0 errors and 0 shader messages.
- **On a phone** (GitHub Pages after merge): the touch pad walks into people, slides past and
  gets through a crowd.

## 4. Risks and how to check them

- **Drawn position versus simulated position.** The HQ crowd draws `renderX/renderZ`, which is
  smoothed, and contact uses `p.x/p.z`. If people still look overlapped on the device, collide
  against `renderX/renderZ` near the player instead, and say so in the status doc.
- **Far-LOD people update every 0.2 s.** Anyone within contact range of the player is near LOD,
  so this should not matter. Confirm it with a test.
- **A stuck crossing.** Only `flee(..., {dodge: true})` may move the cast. Never call `leave()`,
  and never set a pause on anyone on a crossing (§16a: one held group freezes every signal).
- **Near characters.** The near humanoid pool (`src/life/near-characters.mjs`) reads the same
  `hurt*` fields; check that a bump plays `Hit` briefly and hands the body back.
- **Phone cost.** Measure on the phone, not only on the PC.

## 5. Order of work and commits

1. Step A plus its tests 1, 2, 4 and 7. One commit.
2. Step B plus test 3. One commit.
3. Step C plus tests 5 and 6. One commit.
4. The bench, the device-check evidence (`evidence/player-contact/`), and the status-doc
   section (a new §9l, plus a §16a entry if a bug is found). Separate commits for evidence and
   docs.
5. Before the PR: `npm run typecheck`, `npm run test:ci`, `npm test`, and `git status --short`.
   Then a PR into `master` using the repository template.
