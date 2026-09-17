# Audio handover: Shibuya ambience and pedestrian voices

Written for whoever implements this next. Nothing here is implemented; this is the
brief, the measurements that constrain it, and the decisions that have to be made
before code is written.

## What is wanted

1. A Shibuya ambience bed (BGM / city noise) under the whole scene.
2. Pedestrians calling out when the player's car bears down on them —
   「あぶな！」「やばい！」「きゃーー！！！」and similar.

## Is it possible

Yes, and most of the hard part already exists. Two things are already built that this
should reuse rather than reinvent:

- **`src/player/audio.mjs`** — a working Web Audio graph with an AudioContext that is
  started inside the click that enters player mode (browsers refuse a context no
  gesture asked for), a synthesised engine note, and one-shot noise bursts for impacts.
  It fails soft: if the context is refused, audio is silent and nothing else changes.
  Extend this module; do not open a second AudioContext.
- **`vehicle.alertPedestrians(crowd)`** — already decides who is about to be run over.
  It sweeps the car's body forward by `CAR.alertLead` seconds of travel and calls
  `crowd.scatter(p, dx, dz)` for everyone in that corridor. **That is the voice trigger.**
  No new proximity search is needed.

There is one real blocker, and it is not technical. See *Decisions needed* below.

## The measurement that shapes the design

Thirty seconds of driving through the crossing, measured on this repo:

| | |
|---|---|
| `scatter` calls | **3452** — about 115 per second |
| distinct pedestrians warned | **128** — about 4.3 per second |

Wiring a voice to every `scatter` call would produce 115 overlapping clips a second.
The same person is re-warned every frame they stay in the corridor, so the fix is to
speak per *person*, not per call:

- one voice per pedestrian per encounter, with a cooldown (suggest 4–6 s) before that
  same pedestrian can shout again;
- a global cap on simultaneous voices (suggest 4–6), oldest wins or nearest wins;
- distance culling — the crowd already keeps `p.lod` (`near` / `mid` / `far`); do not
  play anything for `far`.

Even deduplicated, 4.3 voices a second is a lot. Expect to need a further random gate
(perhaps 30–50% of eligible pedestrians actually shout) tuned by ear on real hardware.

## How the simulation should hand voices to the audio layer

There is an established pattern in this codebase for exactly this, and it should be
followed: **the simulation owns no audio, it queues events and the presentation layer
drains them.** See `CrowdSimulation.splashes` (`src/life/simulation.mjs`) and the drain
in `app/ShibuyaScene.tsx`:

```js
const queue = crowdSim?.splashes;
if (queue?.length) { for (const q of queue) blood?.splash(...); queue.length = 0; }
```

Add a `crowd.voices` queue on the same model — `{x, z, kind, id}` pushed from `scatter`
and `strike`, drained each frame in the app and handed to the audio module. Keeping the
simulation free of `AudioContext` is what makes the headless tests keep working.

## Constraints in this repository that will bite

- **Third-party audio may not be downloaded or committed without authorisation.** This
  is why the existing engine sound is synthesised rather than sampled. It is the blocker
  for this feature: see below.
- **Startup time is a first-class requirement.** Audio must be fetched lazily, after the
  scene is interactive, and must never block first paint. Check with `?startupTiming=1`
  on real hardware before and after.
- **The static prebake must not move.** `public/data/shibuya-static-models.json` is keyed
  by a hash over `STATIC_ROOTS` in `build/static-model-key.mjs`. Audio files under
  `public/` and a new `src/player/*.mjs` are outside that graph, so the key should stay
  `25ea9435…` — verify it after the change, do not assume.
- **The crowd's render budget is a tested contract** (13 geometries, 3 materials,
  `tests/r1-crowd-density.test.mjs`). Audio does not touch it, but do not be tempted to
  add a speech-bubble mesh to the crowd pools; that contract has been protected twice
  already by putting player affordances in their own module.
- **GitHub Pages serves from `/shibuya-scene/`** (`vite.config.ts`). Reference assets
  through the bundler or `import.meta.env.BASE_URL`, never a bare `/audio/...` path.
- **Autoplay.** The player-mode click already unlocks the context. Ambience in
  *observation* mode has no such gesture — it will need its own (a mute/unmute control
  is the honest answer, and is also what a user wants for a page that makes noise).

## Decisions needed before any code is written

1. **Where do the voice clips come from?** Web Audio can synthesise an engine; it cannot
   synthesise 「きゃーー！！！」. The options are: record them, generate them with a TTS
   whose licence permits redistribution, or buy a pack. **This is a licensing decision,
   not an engineering one, and the implementer cannot make it.** Same for the ambience
   bed.
2. **How many distinct lines, and in what registers?** A handful repeated at 4 voices a
   second will be recognised as a loop within a minute. Suggest 8–12 lines across a few
   voice types, varied in pitch per pedestrian (`p.id` already seeds their appearance —
   use it to seed the voice too, so the same person always sounds the same).
3. **Does the ambience change with the time of day?** The scene already has dawn / day /
   dusk / night and a solar cycle. Crossing chimes and traffic noise at night differ from
   midday; decide whether that is in scope.
4. **Should walking near people trigger anything?** The current corridor only exists while
   driving. Shouts on foot would need a separate, cheaper proximity check.

## What can and cannot be verified here

This environment renders through SwiftShader at about 0.2 fps **and has no audio device**.
Everything about audio can be checked as far as "the graph is built, the right events fire
at the right times, nothing throws" — the existing engine and impact sounds were only ever
verified to that level and remain **unverified by ear on real hardware**. Whoever
implements this should assume the same limit and plan a real-device pass.

Useful existing probes: `?diag=1` opens a panel with a device tab that reports whether
`AudioContext` is available, and the drive tab shows live state while driving.

## Files this will touch

| file | why |
|---|---|
| `src/player/audio.mjs` | extend: ambience bed, voice playback, buffer cache, mute |
| `src/life/simulation.mjs` | add the `voices` queue, pushed from `scatter` and `strike` |
| `src/player/vehicle.mjs` | nothing, if `scatter` carries the event — check before editing |
| `app/ShibuyaScene.tsx` | drain the queue, own the mute control, lazy-load on idle |
| `public/audio/` (new) | the clips, once their licence is settled |
