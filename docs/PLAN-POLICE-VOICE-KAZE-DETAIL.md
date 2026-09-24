# Plan: a Japanese patrol car that reads as one, a human police loudspeaker, and Kaze FR in detail

Status: **PLAN, not implemented.** Written 2026-09-25 on `master` `b2a39ef` (PRs #24–#31
merged). It comes from the user's first device run of the police and own-car work. The work
happens in a local Claude CLI session so it can be checked on the real device. Read
`AGENTS.md`, `CLAUDE.md`, `docs/GTA-FIDELITY-STATUS.md` (§9m–§9t, §16a),
`docs/PLAN-LOOKS-AND-FLEET.md` §0 and `docs/PLAN-POLICE-AND-OWN-CAR.md` first.

## 0. What the user saw, and decisions

- **The patrol car does not read as Japanese.** On the device, at night, the body looked grey
  all over rather than black below and white above. The roof "light bar" was a flat orange
  plank that looked like a taxi roof sign.
  - The code: the livery is a height band in the fleet body shader (`LIVERY.police` in
    `src/traffic/fleet.mjs`: lower `0x121417`, upper `0xf1f1ec`, `band: .58`). The light bar is
    a flat `BoxGeometry` pushed into the `tail` part in `src/traffic/vehicle-shape.mjs`
    (`d.lightbar`), so it takes the tail-lamp material.
- **The loudspeaker sounds like a machine.** It is the browser's `speechSynthesis`
  (`createLoudspeaker` in `src/police/siren.mjs`; lines in `src/police/director.mjs`). The user
  wants a real man's voice, a patrol officer calling out, half-shouting.
- **The user cannot record a voice,** so it is generated with a Japanese speech synthesiser.
  - The crowd's in-browser formant speech (`src/player/voices.mjs`) is good for short cries. It
    is not intelligible enough for sentences, so it is not used for this.
- **Kaze FR lacks detail against the reference photo.** The user agreed to the analysis below
  (2026-09-24/25). Everything stays "〜風" (`PLAN-LOOKS-AND-FLEET.md` §0):
  - the name guard applies;
  - no maker, model, body-kit maker or film names in `src/`;
  - the car evokes a 1990s rotary-era FR coupé and must not copy a specific body kit's panels,
    in particular the reference's aftermarket kit, its huge side intakes and its nose.

## 1. Step P: the patrol car reads as a Japanese black-and-white (small; do first)

- **Diagnose the grey first, on the device, at night and by day.**
  - Is the band evaluated in the space the shader thinks it is (local height as a fraction of
    `VEHICLES.police.height`)?
  - Does the upper colour arrive, or is the batch alpha that carries the livery being lost
    somewhere?
  - Is white simply lit grey at night?
  - Fix the cause. Write it into §16a if it was a bug.
- **Target look (generic Japanese patrol car):**
  - a crisp split, black below the beltline including the bonnet front and boot sides, and white
    doors, roof and pillars. Use the real proportion: the split sits at the beltline, not
    halfway up.
  - Black bumpers.
  - No text, emblem or agency name (§0 of the looks plan). Keep the door text off, as decided.
- **Light bar.**
  - Replace the flat plank with a roof-width bar: rounded ends, a red translucent lens split into
    segments, and a clear or white centre section.
  - It sits on a low dark mount, not flat on the roof, and is its own part or material, not the
    tail lamp.
  - Night emission rotates across the segments using `flashPhase()`, which already exists.
  - Add a pair of small red lamps in the front grille area.
- **Level of detail.** Traffic stays in the five fleet batches. Put the light bar's extra shape
  in the batch geometry, so there are no new draw calls. If a separate lens material is needed,
  it may add at most one draw call for all police cars together.
- **Tests.**
  - The police livery's upper and lower colours reach the shader, with the band at the beltline.
  - The light bar geometry is rounded (more than 8 segments), sits above the roof, and is not in
    the `tail` part.
  - The traffic draw-call count is unchanged or up by at most 1.
- **Device check.** Screenshots day and night, near (5 m) and far (40 m), beside a taxi and a
  sedan. It must read black-and-white at a glance.

## 2. Step V: a human-sounding police loudspeaker (medium)

### V1. Generate the lines offline with VOICEVOX

- The user installs and runs VOICEVOX (a free Japanese TTS app). Its local engine listens on
  `http://127.0.0.1:50021`.
- **`scripts/generate-police-voice.mjs`** (a dev tool, not shipped):
  - it calls `POST /audio_query?speaker=<id>&text=<line>` and then `POST /synthesis`;
  - it writes WAVs into `assets/audio/upstream/police/`, which is git-ignored like the other
    upstream audio.
- **Voice choice.**
  - Pick 2 male voices, with an energetic or harsh style where the character has one, so there
    are two officers.
  - **Read each character's terms before use.** Record in the lock file:
    - the terms URL and the terms text or version date;
    - whether a credit is required, and its exact form (e.g. `VOICEVOX:<キャラ名>`);
    - that it may be used in a publicly hosted game.
  - Use only characters whose terms allow this; if unsure, skip the character. Show the credit in
    `docs/AUDIO-ASSETS.md` and in an in-game credits line.
- **Performance**, the "half-shouting" feel, per line in the lock file:
  - volume and intonation up (`volumeScale` about 1.3–1.5, `intonationScale` about 1.3–1.6);
  - a little faster (`speedScale` about 1.1–1.2);
  - pitch slightly up (`pitchScale` about +0.02 to +0.05);
  - pauses shortened (`prePhonemeLength` and `postPhonemeLength` low).
  - Tune by ear on the device. The CLI proposes values, and the user judges.
- **Lines**, 2–3 takes each, differing in voice, style and parameters:

  | Aimed at | Lines |
  | --- | --- |
  | a driving player | 「前の車、止まりなさい！」「そこの車、左に寄せて止まりなさい！」「止まりなさい！止まれ！」 |
  | a player on foot | 「警察だ、止まりなさい！」「そこの人、止まれ！」「動くな！」 |
  | an arrest | 「確保！」 |

- **Lock file** `assets/audio/police-voice.lock.json`, which makes the lines reproducible:
  - the engine and app version;
  - per line: speaker id, style, text, every parameter, and the SHA-256 of the WAV;
  - the terms record above.
- **Convert.** Run the WAVs through the existing `scripts/convert-audio.mjs`:
  - trim silence, normalise to the one-shot target;
  - write MP3 into `public/audio/`;
  - add them to `manifest.json` as a new kind `police-voice`, with 1 voice for this kind and the
    global caps unchanged.

### V2. Play them like a real patrol car loudspeaker (runtime)

- **A megaphone chain in the sound bank** (`src/audio/bank.mjs`), applied only to
  `police-voice`:
  - a band-pass of about 350–3,500 Hz;
  - mild saturation (a `WaveShaperNode`);
  - a short slapback echo for the street, about 70–110 ms at low level;
  - a synthesised mic "click" or brief feedback blip before each line;
  - through the HRTF panner at the car, like the siren.
  - The siren ducks by about 6 dB while a line plays.
- **When.**
  - Only while pursuing with the siren on, the car within 40 m of the player, and at most one line
    every 8 s across all cars.
  - Choose the driving or on-foot set from the player's state, and never repeat the last take.
  - 「確保！」 plays on arrest.
- **Fallback.**
  - If the clips have not loaded, stay silent. Do not fall back to `speechSynthesis`, which is
    what sounded like a machine.
  - Keep `speechSynthesis` only behind `?voice=tts` for debugging, or remove it.
- **Tests.**
  - The lock file names terms, credit and SHA-256 for every clip.
  - The manifest has a `police-voice` kind.
  - Selection follows the driving/on-foot state, never repeats a take, and waits 8 s.
  - The megaphone chain is built only for that kind.
  - With no clips, silence and no `speechSynthesis` call.

## 3. Step K: Kaze FR in detail (large; two PRs)

The car is drawn by `src/player/vehicle-asset.mjs` from the loft (`buildVehicleShape`, the
`fastback` silhouette, kit in `vehicle-shape.mjs`). It is one car, so it can afford more
geometry and a better material than traffic.

### K1 (first PR): proportions, body sections, cabin, wheels

1. **Proportions.** About 4.30 m long, 1.76 m wide and 1.23 m high, with a 2.43 m wheelbase.
   Short overhangs (front about 0.85 m). Wheels about 0.66 m in diameter overall, with a wide
   track, and the wheels flush with the arches.
2. **Body sections.** Go from about 10 to 15–20 stations. Each station's upper outline carries:
   - front fender peaks higher than a low bonnet valley between them;
   - a pinched waist at the doors and swelling rear haunches (the "coke bottle");
   - tumblehome, the flanks leaning in toward the roof.
   - Add smooth normals across stations, so there is no faceting.
3. **Cabin.** A separate curved loft:
   - a raked, curved windscreen and a canopy roof;
   - wrap-around rear glass;
   - black pillars and a black roof panel, per the reference's two-tone.
4. **Wheels and arches.**
   - Cut the arches out of the body around each tyre, with flares.
   - A 5-spoke silver rim, a tyre sidewall, and a dark brake disc visible through the spokes.
   - No wheel hidden under a skirt.
5. **Bench** `qa/gta-upgrade/carbench.html`, like `punchbench.html`: Kaze FR alone, rendered
   side, front, rear and three-quarter, day and night, at 1280×720. Evidence goes into
   `evidence/kaze-detail/`.

### K2 (second PR): parts, paint, lamps

6. **Parts:**
   - a rear wing at the tail edge: two uprights, end plates and a thin blade, not on the roof;
   - body-colour door mirrors;
   - pop-up headlamps (kept) plus slim clear fixed lamps below them, lit at night;
   - round or oval tail lamps;
   - a large black lower front opening with a lip;
   - side skirts, a rear diffuser and two exhaust tips;
   - a modest generic side intake behind each front wheel, smaller than the reference kit's.
7. **Paint.**
   - A clearcoat physical material for this car only: `MeshPhysicalMaterial`, `clearcoat` 1,
     low roughness, the environment map on.
   - Orange about `#f39a1d`.
   - Black bonnet, roof and lower accents as recessed or separate panels, not only colour.
8. **Budget:** at most 60k triangles and at most 10 draw calls for the whole car, and fps within
   noise at HIGH night.
9. **If the loft still cannot carry the curves after K1/K2,** propose (not do) a hand-modelled
   original GLB made in Blender by the project. It is original work, so there is no licence
   issue, but the name guard and the no-copy rule still apply.

- **Tests (K1 and K2).**
  - The dimensions are within ±3%.
  - The station count is at least 15.
  - The fender peaks are higher than the bonnet valley at the front axle.
  - The wing's position is behind the rear axle and below the roof peak.
  - The arch cut-outs expose at least 60% of the wheel's height from the side.
  - The triangle and draw-call budgets hold.
  - The name guard passes.
- **Device check.**
  - `carbench` shots against the reference-photo checklist (items 1–9 of the analysis): the
    fender curves, the canopy, the wing position, visible wheels, the proportions, the two-tone,
    the gloss, the parts and smoothness.
  - In game: a night drive, lamps, reflections, and the drift feel unchanged.

## 4. Order and commits

1. Step P: the patrol car look. One PR.
2. Step V: V1 and V2 together. One PR. The user must have VOICEVOX running and must choose the
   voices after reading their terms. The CLI stops and asks at that point if they are not chosen.
3. Step K1. One PR.
4. Step K2. One PR.

- Separate implementation, evidence and doc commits. Each PR adds a §9 section (and §16a
  entries for bugs) to `docs/GTA-FIDELITY-STATUS.md`.
- Before each PR: `npm run typecheck`, `npm run test:ci`, `npm test`, and `git status --short`.
