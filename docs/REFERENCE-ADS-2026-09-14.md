# Reference advertisement inventory

Branch: `claude/happy-tesla-dkn52d`
Stage: 3 (principal advertisements), feeding stage 4 (lighting and materials)

## What the inventory is

The user supplied a target frame of the scene and an inventory derived by comparing that
frame against the current build. The inventory lists 30 advertisements with their position
and size as a percentage of the CAM-02 frame, plus mount type, aspect and priority.

The percentages are resolution independent but **not aspect independent**. A percentage
only names the same world direction when it is unprojected through the aspect ratio it was
measured at, so `REFERENCE_VIEW` pins the measuring frame (1491x812, 50 degree vertical
field of view, CAM-02) and placement always unprojects through it, never through whatever
canvas the viewer happens to have.

## Placement

`src/signs/reference-ads.mjs` raycasts each slot against the scene's own sign hosts.

- Wall mounts take the nearest facade that faces the camera.
- Roof mounts resolve against roof planes instead, because a ray aimed at a rooftop sign
  passes over every facade and would otherwise land on whatever is far behind. When the
  scene's building in that direction is shorter than the reference building, the sign is
  stood on the nearest tall roof along the sight line and flagged `lowered`.
- World size is derived from the slot's screen coverage at the hit depth, divided by how
  much of the facade survives projection, then trimmed to the wall it landed on.

A slot is accepted only when it lands on a camera-facing wall, within the range the
reference frame covers, and at a size its mount type is actually built at. 21 of 30
resolve. The rest are reported with a reason rather than relocated.

`src/signs/reference-layer.mjs` applies the result at render time, not during the static
bake, so re-aiming or redrawing an advertisement does not invalidate the geometry pack.
Generated panels whose world footprint a slot covers are cleared by footprint rather than
by host identity, because a slot measured from the frame routinely straddles panels
belonging to a neighbouring host.

### The placement audit

Geometry that satisfies the raycast can still be wrong. Slots 19 and 20 resolved onto the
QFRONT facade at the same position as that building's own large screen, so IKEA and ACN
rendered stuck through the middle of it; two more hung out over the roadway. The raycast
only ever asked "does this land on a wall", never "is that wall already occupied".

Reference advertisements now clear the same `placementIssues` audit the procedural signs
clear, accepted one at a time against everything already standing, so two reference slots
resolving onto one wall are caught against each other as well. `vertical-host-bounds` is
excluded because a rooftop mount is meant to stand above its host's roofline.

This drops the placed count from 21 to 15. Those six were never buildable.

### Walls carrying a grid

Sizing each slot from its own screen coverage is right in isolation but collides once
several slots land on one facade. The reference frame's left block carries nine
advertisements across a facade far wider than the wall this scene models, so nine
individually-correct panels overlapped into an unreadable stack.

When three or more advertisements share a wall, the group's screen rectangle is mapped
linearly onto that wall instead. This reproduces the reference arrangement — same columns,
same rows, same relative sizes — and cannot overlap, because the reference rectangles do
not overlap either. Walls carrying one or two advertisements keep their raycast sizing.

### The rooftop drink brand

`center-gai.mjs` previously pushed this sign to a fixed height of 47.6 m above QFRONT,
which is higher than that roof, so it floated. The reference layer now owns it and stands
it on a real roof. It sits lower in frame than the reference because the building beneath
it in this scene is shorter than the reference building; the placement is flagged
`lowered` rather than faked.

## Overlap resolution

The placement audit in `model.mjs` guarantees the *model* signs do not intersect, but two
layers run after it and neither was audited. `commercialLayout` replaces dense faces with a
freshly generated grid, and the reference layer adds advertisements aimed from a
photograph. Both can land a panel on a panel the audit already accepted.

Measured on the render list: **61 intersecting pairs on master**, before any of this work.
They are almost all a generated `:commercial:` cell cutting into an audited model sign on
the same wall — for example `way/60739635:0:0:1:1` against
`way/60739635:0:0:0:0:commercial:0:0`.

`src/signs/overlap.mjs` is the last word before geometry is built. Panels are accepted in
priority order — hero screens, then reference advertisements, then hero signs, then audited
model signs, then generated filler — and anything that cuts into an accepted panel is
dropped. The result is **0 intersecting pairs**, at the cost of 41 generated filler cells
out of 615 faces. No hero screen, reference advertisement or audited model sign is dropped.

## Advertisements with no building

These fifteen are not placed. The buildings that carry them in the reference frame do not
exist in this scene, and inventing a wall would put the advertisement somewhere the
reference never showed it. Artwork for all of them is already drawn, so adding the
buildings is the only remaining work.

| id | brand | priority | reason |
| --- | --- | --- | --- |
| 4 | Cafeレストラン ガスト | medium | facade-recedes-from-view |
| 8 | もんじゃ | medium | no-host-on-ray |
| 15 | Hisamitsu | high | resolved-wider-than-mount-allows |
| 21 | DMM | medium | no-host-on-ray |
| 22 | 大盛堂書店 | low | no-host-on-ray |
| 24 | QFRONT | low | host-beyond-reference-range |
| 26 | STARBUCKS | high | no-host-on-ray |
| 29 | CITY DRUG | low | no-host-on-ray |
| 30 | サンドラッグ | high | no-host-on-ray |
| 12 | SHIBUYA 109 | medium | placement-audit:facade-distance |
| 13 | UC | high | placement-audit:road-projection |
| 14 | 龍角散ダイレクト | medium | placement-audit:road-projection |
| 17 | もん字 | low | placement-audit:facade-distance |
| 19 | IKEA | high | placement-audit:duplicate-overlap |
| 20 | ACN | medium | placement-audit:duplicate-overlap |

`no-host-on-ray` means the sight line leaves the scene without meeting a building.
`facade-recedes-from-view` means the wall it met runs away from the camera, so the recorded
screen coverage would demand an implausibly long sign. `resolved-wider-than-mount-allows`
and `host-beyond-reference-range` both mean the ray flew past the intended mid-distance
building and struck something far behind it. A `placement-audit:` reason means the slot
found a wall but failed the shared sign audit — it overlapped an existing sign, stood off
its facade, or projected over the roadway.

## Artwork

The generic city atlas spreads 32 tiles across roughly 600 signs, so each tile is 256x512
at HIGH and each tile is shared by many faces. That is the cause of the repeated-sticker
look: one subtitle string appears on four visible panels at once, every panel follows the
same pictogram/brand/subtitle composition, and no tile has the pixels to carry legible
type.

`src/signs/reference-art.mjs` gives the 30 reference advertisements their own sheet: 4096
square at HIGH in a 5-column grid, so each panel gets 819x683, more than four times a city
tile. Medium and low fall back to 2048 and 1024. Each panel is an individually composed
reconstruction, not a recoloured template.

Printed panels and self-lit displays render through separate materials so night emission
can differ by light source: `signs-reference` at 1.45 and `signs-referenceVision` at 2.3,
against `signs-print` at 1.15. The sheet costs one texture and two batches.

`tests/reference-art.test.mjs` enforces the property the generic atlas lost: no two panels
may draw identical text, no line may appear on more than two panels, and the sheet must
carry distinct backgrounds.

## Brand artwork policy

Every panel is drawn from scratch with canvas primitives. No official logo file, brand
font or third-party asset is downloaded or committed. These are recognisable
approximations for a streetscape reconstruction, not reproductions of trademark artwork,
and the positions come from a single reference frame — they are approximations, not a
surveyed advertising inventory.

## Not verified

Rendering was inspected through a headless Chromium using the SwiftShader software
renderer. That is enough to confirm composition, placement and that materials compile, and
it is **not** a frame-rate, startup-speed or visual-acceptance measurement. Any FPS figure
observed in that environment is meaningless for the real target. Settled HIGH day/night
inspection on a GPU remains required.
