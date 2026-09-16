# Reuse existing mechanisms

Use an approved scene in the current project when available. Extract only that
scene with `inspect <directory> --scene <id>` and adapt its IDs, claims, timings
and sources. Never copy another project's recorded take by accident.

The package includes `examples/minimal/video.yaml`: `idea` shows a simple object
with a pop entrance; `together` shows a staggered repeated pictogram grid. Copy
the example folder into a host project to render or inspect it; do not write
outputs inside the installed package.

Other existing primitives: callouts for labels that follow targets, groups for
shared transforms, two timed elements for SVG state changes, and count-up for a
number in a text element. Use the system reference for exact fields. No template
engine is necessary to reuse a working scene.

## Short comparison reel

This generic 27-second plan is an example, not a mandatory pace or a claim about
audience retention. Preserve the client's approved direction and opening.
Use a consistent palette, drawing style and label treatment across distinct art;
consistency does not require one picture throughout. Keep word cards as editable text.

| Time / scene ID | Exact narration | Picture and coordinated cue | Suggested take |
| --- | --- | --- | --- |
| 0–3 / question | “Which way helps you learn?” | Two paths appear; question holds. | question.wav |
| 3–10 / seeds | “Read about a seed, then plant one and watch what changes.” | Book transitions to a seedling; reveal “Try it” with a small upward move and optional soft-land. | seeds.wav |
| 10–17 / bridge | “Study a bridge, then build a model and test its strength.” | Distinct bridge/model art; move a weight with a wood-tap, away from the key spoken word. | bridge.wav |
| 17–24 / circuit | “See a circuit, then connect the parts and light the bulb.” | Circuit art lights up; “See the result” arrives with an optional click. | circuit.wav |
| 24–27 / takeaway | “Learn it. Try it. Understand it.” | Three editable phrases resolve; allow a quiet final hold. | takeaway.wav |

Recording handoff: record the rows in this order, using the exact narration;
save separate originals to `videos/comparison/recordings/incoming/` with the
suggested names (MP3/M4A are also accepted). Keep a natural pace and short pauses.
Import each into its named scene with `explainer import`; duration mismatches
leave YAML unchanged. Then place word reveals against the real takes, adjust
holds or shorten copy before considering speed changes, and audition `mix`
plus the full export before selecting music/effect levels. A two-example version
can use longer holds; subject changes and cues should serve the explanation.
