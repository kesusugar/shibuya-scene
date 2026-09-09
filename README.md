# Shibuya Scene Reconstruction — RUN S3

S0 conditional PASS; S1/S2 PASS. This version implements **Generic Buildings only**, on the unchanged S2 Ground. No deployment or later-stage builders.

- `npm ci`, `npm run dev`; `npm test` builds and runs **81 tests** (59 existing + 22 S3).
- Inspect `?only=ground,buildings,data,geo&camera=overview`; also `camera=scramble` / `camera=street`. Buildings can load independently and its switch disposes/rebuilds all owned geometry and materials.
- `src/buildings/config.mjs`: budgets, floor height, archetypes, centralized hero/station reservation. It reuses S1 HERO_IDS and reserves Mark City West plus overlapping station footprint.
- `model.mjs`: polygon/holes/self-intersection/triangulation validation, bounds clip, height priority, archetype/frontage metadata, safe roof placement, reason-coded exclusion. IDs seed variation; no input mutation.
- `render.mjs`: OSM extrusion walls + triangulated roofs merged into two vertex-colored meshes. Three window styles share one PlaneGeometry. Trim/balconies and rooftop boxes share a BoxGeometry; tanks/masts share a cylinder. Seven materials and eight batches, not one mesh per building/window.
- `lifecycle.mjs`: abort/generation guards prevent stale async loads from resurrecting disabled geometry.

378 generic buildings / 14 reserved sources / 274 excluded sources (236 outside target). All seven archetypes generated. Windows 38,060; rooftop props 701; 160,925 building triangles. Ground + Buildings: 208,754 triangles / 13 estimated calls. Figures exclude S1 debug outlines.

Reproduce CPU evidence: `node scripts/verify-buildings.mjs`, then optional `python3 scripts/plot-buildings.py` (matplotlib). `evidence/s3/S3_REPORT.txt` contains the complete Japanese report, metrics and limitations; geometry.json contains the exact Ground overlap audit; building-metadata.json contains per-building heights, frontage, roof placements and source exclusions. The CPU map is not a WebGL screenshot.

WebGL2/FPS/camera rendering remain unverified in this environment. CPU bounds, transformed instance vertices and rooftop containment pass. 85 road-edge surface overlaps remain documented (none meet the >25% and >10m² gross-overlap threshold); crossing stripe overlap is zero. No footprint deformation to hide source/road-width discrepancies. Shared walls may carry hidden windows; visual quality, clipping at the perimeter and inferred heights require later visual review. No night behavior, signage or hero geometry was added. S3 generation is synchronous, roughly one second here; this is not a GPU frame measurement.

## Historical S2 / S1 record

# Shibuya Scene Reconstruction — RUN S2

S0 conditional PASS / S1 PASS. S2 adds Ground only. No later scene modules, gameplay or deployment.

Run `npm ci`, `npm run dev`; `npm test` builds and runs 59 tests (42 existing + 17 S2). Inspect `?only=ground,data,geo&camera=overview`, `camera=scramble`, `camera=street`. Ground loads independently of data-outline visibility; Ground OFF restores outlines. Fixed cameras and S0 controls are preserved.

`src/ground/config.mjs`, `model.mjs`, `render.mjs` use existing S1 metric coordinates, triangulation/merge, RNG and spatial index. S1 sources are unchanged. Polygon-clipping (MIT, package-lock pinned) provides boolean operations. Segment rectangles and rounded joins tolerate repeated/short/reversing/self-crossing paths; X/Z clipped to ±250 m. Width priority: metric width > lanes × 3 + 1 m > class default. Elevated/tunnel/nonzero-layer geometry is excluded.

Central junction envelope uses OSM scramble crossing anchors. Four main crossings and one diagonal retain OSM directions; southern parts are joined, endpoints extended to road edge. Duplicate normal crossings are excluded within configured 40 m central radius. Other marked footways/crossing/signal points yield normal crossings; unmarked/informal/no tags excluded.

Sidewalk bands 3 m, curb height 0.15 m, ramps interpolate distance to road boundary over 1.5 m. Spatial index and adaptive subdivision resolve ramps. Sidewalk excludes curb tops; paint and tactile polygons are unioned before merge. Five material batches with deterministic procedural asphalt/sidewalk DataTextures and Ground-owned inspection daylight. Night/time remains a stub.

Evidence in `evidence/s2`: geometry.json, tests.log, build.log, browser.txt, ground-plan.png and S2_REPORT.txt. Other tests-s2 logs are intermediate development records. CPU plan is not a WebGL screenshot. Reproduce with `node scripts/verify-ground.mjs`, optionally `python3 scripts/plot-ground.py` (matplotlib).

Known constraints: WebGL2 unavailable; rendered camera views, Z-fighting, lighting, GPU calls and FPS unverified. CPU generation is synchronous (~8 seconds here), not a frame-time measurement. Generic sidewalk widths, road fallback widths, central envelope and signal-derived crossings are POC approximations, not surveyed curb geometry. No subagents used. No later build hooks added.

## Historical S1 record

# Shibuya Scene Reconstruction — S1

S0: conditionally PASS per user. Its WebGL limit remains an environment constraint. S0 foundation.mjs, camera definitions, styling and tests are preserved; app/page.tsx only integrates S1 and updates RUN labels. No gameplay or later-RUN systems. Not deployed.

Node >=22.13; npm ci; npm run dev. npm test builds and runs the tests. WebGL2 is needed to view raw diagnostic lines, not to validate OSM data or Geo utilities.

S1 implements OSM XML import and normalized JSON loading; coordinate conversion; polyline length/sample/tangent/heading/resample/extend/clip/offset; polygon bounds/membership/holes/triangulation/extrusion; geometry merge/transform/color/ribbon; seeded RNG; InstancedBuilder; spatial grid. Scene objects are only four batched LineSegments. Geometry helpers are not instantiated as Ground/Buildings/Station.

Coordinates [x,z]: metres, X east, Z south; Y up in Three.js. Origin 35.6595,139.7005 unchanged. Local equirectangular approximation is for this sub-kilometre scene only. Scramble node/291758776 is 6.84m from origin.

Counts: 666 buildings, 306 road parts, 648 footway parts, 96 rail parts, 118 crossings, 49 signals, 24 trees, 30 areas, 1176 POIs. Polygon/line IDs are typed OSM IDs; part distinguishes separate clipped parts or outer rings. sourceNodeIds records original way nodes, not clipped-point indices. Tags preserve width, lanes, bridge, tunnel, layer, oneway, height/levels. Unknown heights remain null.

Line clipping bounds X[-300,365], Z[-340,300] buffer the main ±250m area. Intersecting building/area polygons remain whole: total bounds X[-342.6,415.5], Z[-445.0,491.2]. This prevents severing boundary footprints. Offset is capped-miter, not self-intersection removal. Polygon helpers expect simple valid rings; bundled building polygons receive exhaustive area checks. Multipolygon relation outer/inner member ways are joined; incomplete geometry is reported. Type=building assemblies use constituent footprints, not an invented union. Polygon union/difference and junction surfaces belong to S2.

HERO_IDS is centralized in src/data/normalize.mjs. 11 anchors include QFRONT, 109, MAGNET, Scramble Square, Seibu A/B, Mark City East, Stream, station, Hachiko exit and scramble. Station way/904652357 and entrance node/6223298623 are validated by tags; the similarly named bus stop is not used. Mapping tags are not an independent survey of station layout.

?only=data,geo,debug enables diagnostics; ?skip=data disables dataset loading and report. Data owns world diagnostic lines; S0 debug retains overlay ownership. Request generation checks prevent stale async completions; teardown disposes buffers/materials. Full JSON is not retained after building outlines and the report.

Reproduce the exact snapshot: decompress data-source/shibuya.osm.gz; run python scripts/data/import-osm.py SOURCE.osm RAW.json; then node scripts/data/normalize.mjs RAW.json. That script metadata describes this fixed snapshot, not the time of a future refresh. Source provenance and ODbL attribution are included.

Workspace maintenance removed the first uncommitted S1 checkout. This source was reconstructed from the visible implementation record and surviving OSM bytes. See evidence/s1 for validation of this restored copy. STOP after S1; no deployment.
