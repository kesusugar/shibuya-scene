# Reality alignment (owner's QA pack, 2026-10-11)

The owner's "Shibuya Reality Alignment QA Pack" asked for the scene to be checked against the real crossing:
- camera first,
- then geography and massing,
- then facades, light and density.

Gate 1 was audit only. The owner then allowed any change to building sizes and the map ("ルール変更を認めます"). This file records what was found and what changed. The Gate 1 deliverables were handed to the owner outside the repository:
- report,
- registers,
- alignment figures.

## Sources
- **MLIT Project PLATEAU, Shibuya-ku 2025 CityGML.**
  - Building tiles 53393596, 53393595, 53393586 and 53393585. Each building carries its `measuredHeight` (aerial survey) and LOD2 roof surfaces.
  - Road tile 53393596 (LOD3 carriageway and sidewalk polygons).
  - Fetched through `https://api.plateauview.mlit.go.jp/datacatalog/citygml/m:<mesh>`.
  - Not committed: about 360 MB.
- **OpenStreetMap**, as already baked into `public/data/shibuya-scene-data.json` (footprints, network).
  - Its height tags are PLATEAU's, so the two agree where OSM has a height.
- **Wikimedia Commons photographs.** Used to solve cameras and to read facade features. No texture is taken from them.
  - `File:In_Front_of_Shibuya_Station.jpg` (Dick Johnson, 2010, CC BY 2.0)
  - `File:Shibuya_scramble_av_night_from_Stream.jpg` (Syced, 2024, CC0)
  - `File:Q-Front_2018.jpg` and `File:2025_Shibuya_Crossing.jpg` (Kakidai, CC BY-SA 4.0)
- **The owner's target image is not used for geometry.** It is likely generated: its crosswalks and MAGNET do not match any survey or photograph. It is a mood target only.

## Gate 1 findings (summary)
1. **CAM-09 is not a real vantage point.**
   - It is higher (86 m) and farther back than the target frame implies (about 45 m up, about 130 m from QFRONT).
   - From there, roofs and asphalt dominate.
2. **Footprints and the road network are right.**
   - Hero footprints match PLATEAU LOD0.
   - Ground anchors in a real photograph fit the scene to 2–22 px.
   - The open centre of the crossing is real: its area matches PLATEAU. It is not a road-width error.
3. **The Taiseido (大盛堂) building was raised from 24.1 m to 38 m** (`HEIGHT_OVERRIDES`) to give the Hisamitsu / サロンパス boards a wall.
   - In reality those boards stand on a steel frame on its roof.
   - This was a view-driven distortion of the world.
4. **QFRONT stopped at 45.9 m, with a crown set back to 76%.**
   - PLATEAU LOD2 shows the outer wall rising sheer to the 52.1 m parapet of the crown screen.
   - The roof deck is recessed at 48.4 m and the top storey ends at 44.0 m.
5. **105 of 378 generic buildings had random heights.**
   - Against PLATEAU: mean error 9.6 m; 24 are more than 10 m off.
6. **Roads (later stage).**
   - Carriageway IoU against PLATEAU is 0.73 within 40 m.
   - North and east legs are 2–4 m narrow per side, and corner fillets eat the corner waiting areas.
7. **Also found:**
   - The night crossing reads as a flat bright plane.
   - Traffic: 62 vehicles for the whole map.
   - The far city is random boxes.

## Changes
### Comparison cameras
New presets in `src/app/foundation.mjs`, marked `reference`. They are kept out of the main camera bar, and CAM-01..09 are unchanged.

| id | label | solved from | notes |
|---|---|---|---|
| `ref-a` | REF-A Station Walkway | `In_Front_of_Shibuya_Station.jpg`, 7 ground and corner anchors | position [-12.6, 10.2, 68.2], vfov 52.2, 4:3 |
| `ref-b` | REF-B Stream Night | `Shibuya_scramble_av_night_from_Stream.jpg`, 7 crosswalk and corner anchors | position [161.9, 159.6, 201.8], vfov 15.8, residual 7–28 px; the target lies on the ground along the ray (the orbit holds targets below 60 m) |
| `ref-c` | REF-C Target Frame | the owner's target, estimated | mood only, never measured against |

Capture with `look-stills.mjs`, passing the camera in the start query (`... look-stills.mjs <out> "qa=1&tier=high&time=night&camera=ref-b"` with `CAMS=-:ref-b` and `W`/`H` set to the photograph's frame).

### Measured heights (G2-1)
- `scripts/data/merge-plateau.py` attaches to each OSM building the PLATEAU building it overlaps most (share ≥ 0.5):
  - `plateau: {id, h, top, share, storeys, roofSteps}`;
  - 592 of 666 buildings are matched.
- Near the crossing (220 m), each matched building also gets its LOD2 roof steps that stand more than 1 m above the main roof, merged per 0.5 m level.
- `resolveHeight` prefers PLATEAU's height to OSM tags and to guesses. `HEIGHT_OVERRIDES` is empty.
- Generic buildings with roof steps get them extruded on the roof (`buildings/render.mjs`) in place of random rooftop plant.
- The commercial heroes get theirs as `plateau-roof` masses (`heroes/model.mjs plateauRoofMasses`):
  - MAGNET to 42.5 m;
  - Seibu A and B to 44–46 m;
  - 109 to 50 m.

### Sign structures
- `src/signs/sign-structures.mjs` adds a steel lattice frame on the Taiseido roof (24.1 m).
- It carries サロンパス (28.8–34.2 m) and Hisamitsu (34.4–40 m) on the face towards the crossing, 8.8 m wide. Positions are solved from the REF-A photograph.
- Reference ads 15 and 16 are excluded from the frame-percentage placement (`carried-by-sign-structure`).

### QFRONT (G2-2)
- **Masses**:
  - podium 0–7.5 m;
  - glass 7.5–39.9 m;
  - top storey to 44.0 m;
  - the crown as a perimeter screen on the full footprint to 52.1 m (a ring, not a box);
  - the deck recessed inside it at 48.4 m.
- **Facade**: white aluminium fins about 1 m apart, proud of the glass, with transoms on the 5.4 m storey lines.
- **Screen**: 14–38 m on the curved front. This is estimated from 2018 and 2025 photographs; the operator publishes no dimensions.
- **Blender asset** (`scripts/blender/build-qfront.py`): the crown is a full-height lattice of louvres with four rails, and the QFRONT lettering is on the crown.

### Night light on the crossing (G2-3)
- The broad warm pool over the scramble is 0.06, a third of what it was. At 0.16 the asphalt read as one lit plane, where photographs show dark road, bright zebra paint and colour from the screens.
- Lamp pools are 0.20 within 20 m (they were 0.26 within 24 m).
- Exposure: `SolarCycle.update` writes `toneMappingExposure` every frame, so it is the effective owner. The day-night and fidelity writes are transient.

## Next
- Road edges from PLATEAU tran for the 80 m core. Re-run the crowd and traffic audits.
- Traffic queues on the approaches.
- Far city from PLATEAU LOD1 footprints.
- Per-building facade sheets for the frontage.
- Night lighting: reduce the broad crossing pool; exposure is effectively owned by `SolarCycle.update` (it writes every frame).
