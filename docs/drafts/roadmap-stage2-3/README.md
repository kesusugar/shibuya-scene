# Roadmap stage 3 — unfinished drafts (not wired, not run by any test suite)

Stage 2's drafts were wired in and moved out of here (GTA-FIDELITY-STATUS §9an).

Written while the stage 1 capture ran, then stopped when the work was handed over. Nothing here
is imported by the game. Move each file to its target path, then wire it as described.

| File | Target | Status |
|---|---|---|
| `helicopter.mjs` | `src/police/helicopter.mjs` | ☆4+ helicopter: arrival, orbit, searchlight sweep spiral, `sees` for the wanted level; procedural mesh with a fake light (cone + ground spot, no real light). Pure. |
| `stage3.test.mjs` | `tests/stage3.test.mjs` | 4 tests, passed against `helicopter.mjs` before the move. |

Still to do for stage 3: wire the helicopter into `police/director.mjs` (`seen ||= heli.sees`),
draw the mesh in the scene, add a rotor sound, draw the search circle on the minimap (play-ui
`draw()`: circle at `lastSeen`, radius `searchRadius`, while `flashing`), and put roadblocks and new
patrol cars ahead of the player's travel direction (pincer) in `police/units.mjs` (a roadblock at
☆4 already exists; it picks a random direction).
