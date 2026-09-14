# Implementation status and handoff

Updated: 2026-09-14 (reference advertisement pass)

## Target

The target is a dense, recognizable Shibuya night scene with believable building proportions, differentiated glass and displays, saturated signage, readable road surfaces, continuous legal vehicle flow, active pedestrian areas, and stable interactive performance. User-supplied images are visual direction; they are not proof of current billboard inventory or measured geometry.

## Seven-stage status

| Stage | Status | Exit work still required |
| --- | --- | --- |
| 1. Reference ledger | Started | Settle visual era, authoritative references, and permitted artwork set. |
| 2. QFRONT | In progress | Final day/night comparison, monitor readability, facade bleed check, production branding decision, frame-time acceptance. |
| 3. Principal advertisements | In progress | 21 of 30 reference slots placed and all 30 drawn; 9 await buildings that do not exist yet. Skyline hierarchy still open. |
| 4. Lighting and materials | Current | Improve shaped reflections, glass response, exposure balance, and fixed-camera visual acceptance. |
| 5. Stores and street fixtures | Started | Add convincing lower interiors, entrances, pavement furniture, and clearance validation. |
| 6. People and vehicles | Pending refinement | Increase variation and perceived continuity without signal-phase or performance regressions. |
| 7. Integrated QA and optimization | Pending | Capture paired fixed-camera evidence, eliminate shader/console errors, and establish stable FPS/draw-call budgets. |

Estimated visual progress toward the supplied target: 45–55%. This is a planning estimate, not an acceptance measurement.

## Recently completed

- QFRONT glass, shallow interiors, and central display were physically separated.
- Low-storey cafe and retail framing gained aligned physical geometry.
- Rooftop and facade sign density, sign emission, storefront spill, and road color breakup were expanded.
- Asphalt now has subtle relief and wetness-dependent roughness.
- A reserved GLSL identifier that made asphalt disappear was fixed; shader failures now raise a visible alert.
- Relevant lifecycle, material, storefront, road-shader, and type checks pass at the latest recorded implementation commit.
- The committed static model pack was stale against its own inputs, so every clean checkout
  silently rebuilt ground, station, signage, streetscape, traffic and crowd geometry at
  runtime on each HIGH load. The pack is rebaked and loads again; see the stage 0 note below.
- The reference advertisement inventory is placed on real facades and drawn on its own
  high-resolution sheet. See `docs/REFERENCE-ADS-2026-09-14.md`.

## Stage 0 findings (2026-09-14)

- `public/data/shibuya-static-models.json` stored key `5ab11510...` while its inputs hash to
  `a52355fa...`, and the mismatch predates the pack's own bake commit `78ca60e`. HIGH
  therefore logged `[Static models] runtime fallback Error: stale static models` on every
  clean checkout and paid full runtime generation. Rebaking fixed it.
- The mismatch was masked locally because `npm test` runs `prebuild`, which rebakes before
  the suite. Only `npm run test:ci` on a fresh clone exposed it, and
  `tests/launch-config.test.mjs` was failing on master for exactly this reason.
- Same-machine A/B under software rendering: with the pack, all 13 stages reported in 45.5 s;
  forcing runtime generation with `?prebuilt=0` had reached only stage 6 at 54 s. These are
  software-renderer figures and are diagnostic only, not performance acceptance.
- `tests/rendered-html.test.mjs` and `tests/ui-components.test.mjs` each fail one case on
  master in this environment, unrelated to scene work. Not yet diagnosed.
- `tests/s7-signage.test.mjs` has three cases failing on master. It is not in the
  `test:ci` lane, which is why the failures went unnoticed.

## Highest-priority next work

1. Finish stage 4 with narrower scene-derived-looking reflection shapes and balanced night exposure.
2. Continue stage 5 with lower-floor depth, entrances, illuminated station/utility boxes, curb furniture, and Center-gai pavement detail.
3. Refine stage 6 vehicle cadence, traffic phase visibility, crowd diversity, and Center-gai activity.
4. Run stage 7 at Scramble High, Scramble Street, QFRONT, Hachiko, 109, and Center-gai in both day and night.

## Known risks

- Current colored road spill is art-directed emission, not physically reflected scenery.
- Some real-brand signs are reconstructed approximations and their exact host placement is provisional.
- Performance readings collected during HMR or on different machines are not comparable acceptance data.
- Generated evidence contains machine-dependent timing fields and should be committed independently.
- A successful unit test does not compile every material variant on the GPU; browser QA remains mandatory.
- The 2026-09-15 historical audit also exposed unresolved long-run findings: reference choreography can report crosswalk-boundary contacts, and an older three-minute crowd/traffic audit did not observe the expected scramble traffic resume. Other failures were obsolete stage locks or stale constants. These long-run findings belong to stages 6–7 and are not claimed fixed by the current PR gate.

## Test lanes

- `npm run test:ci`: maintained current contracts used as the pull-request gate.
- `npm test`: portable production build followed by the current contracts.
- `npm run test:legacy`: expensive historical audit, including frozen stage locks and long simulations. Its failures must be classified, not blindly converted into current requirements or ignored.

## Handoff checklist

- Confirm branch and clean/understood working tree.
- Name the stage and camera affected.
- Keep geometry/material allocations bounded.
- Run targeted tests and typecheck; run full `npm test` for integration.
- Inspect HIGH day and night after HMR has settled.
- Record what was actually verified and what remains inferred.
- Update this file only when stage status or priority materially changes.
