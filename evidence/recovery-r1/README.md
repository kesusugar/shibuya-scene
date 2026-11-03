# Recovery R1 evidence (owner's recovery pack)

- **Before:** `71c62b9`, with every landmark missing because `buildHeroScene` threw.
- **After:** `1aee636`, with the PLATEAU roof steps repaired.

## Boards
- Each `board_<camera>_<phase>.jpg` shows three panels: the reference photograph or owner target, before, and after.
- The draw-call count of each capture is in its panel title.

## Raw stills
- The raw stills, with `meta.json` (SHA, static key), `conditions.txt`, `draws.txt` and the browser console, are under `before/` and `after/`.

## The REF-A night anomaly
- `after-night-ref-a-ANOMALY-black-signs.jpg` is the first after capture of REF-A at night, in which every sign rendered black. The cause is not established.
- Two recaptures at the same SHA were normal. `after/night-ref-a-gta.jpg` and the board use the first recapture, taken with the same procedure (start URL `time=day`, then QA phase night).
- `draws.txt` lists both REF-A night lines (anomalous capture and recapture).

## Credits
- **REF-A photograph:** "In Front of Shibuya Station", Dick Johnson, 2010, CC BY 2.0.
- **REF-B photograph:** "Shibuya scramble av night from Stream", Syced, 2024, CC0.
- **REF-C:** the owner's target image (mood only).
