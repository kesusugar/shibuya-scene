# Implementation status and handoff

Updated: 2026-09-14

## Target

The target is a dense, recognizable Shibuya night scene with believable building proportions, differentiated glass and displays, saturated signage, readable road surfaces, continuous legal vehicle flow, active pedestrian areas, and stable interactive performance. User-supplied images are visual direction; they are not proof of current billboard inventory or measured geometry.

## Seven-stage status

| Stage | Status | Exit work still required |
| --- | --- | --- |
| 1. Reference ledger | Started | Settle visual era, authoritative references, and permitted artwork set. |
| 2. QFRONT | In progress | Final day/night comparison, monitor readability, facade bleed check, production branding decision, frame-time acceptance. |
| 3. Principal advertisements | In progress | Complete host placement and major skyline hierarchy; distinguish reconstructed from authorized assets. |
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
