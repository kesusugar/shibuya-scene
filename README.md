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
