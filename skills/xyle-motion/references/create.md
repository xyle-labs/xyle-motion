# Create a video in the current project

Default to a 60-second portrait explanation for a general audience, using the
project's language and brand. Ask about the takeaway only if unclear. Preserve
explicit user choices. Read relevant existing knowledge; do not ingest the whole
repository. Save the brief and source links alongside the video.

For a requested short comparison reel, use the 25–30-second example in
[patterns](patterns.md#short-comparison-reel) instead of the 60-second default.

Run `npm exec -- explainer new videos/<id>`. It writes a neutral starter without
an obligatory brand opening. The starter uses bundled assets, effects and music.
Write narration in scene `narration.text`; it is silent until a recording is
attached. Source factual numbers, distinguish illustrative assumptions, and
budget speech at ≤165 spoken WPM. Include any opening in the requested runtime.

Propose a timed scene plan (one idea per scene), then continue once the direction
is approved or the user already authorized proceeding. Existing approvals carry
forward. Check the asset inventory before creating art. Render a representative
content frame at intended viewing size before assembling all scenes.

Useful commands, after `npm exec -- explainer`:

- `inspect videos/<id> [--scene <id>]`
- `assets videos/<id>`
- `validate videos/<id>`
- `frame videos/<id> --scene <id> --time <seconds>`
- `contact-sheet videos/<id> --frames 3`
- `record videos/<id>`
- `enhance videos/<id> --scene <id> --input <recording>`
- `import videos/<id> --scene <id> --input <prepared-recording>` (decode only)
- `mix videos/<id> --scene <id>` (music at the final timeline offset)
- `render videos/<id> [--scene <id>]`

Guide recording through rehearsal, take, processing preview and Use in video.
Keep originals and process locally. Current neural speaker conversion is disabled;
gentle/RNNoise cleanup remains available. Extend a scene or shorten copy before
forcing a faster performance. Speed-up requires the user's explicit choice.

For externally prepared narration, send one ordered handoff: scene ID, exact
spoken copy, suggested filename and the destination folder under this video.
The studio's script download supplies current scene order and copy; add filenames
and a destination when handing it to a recorder. Obtain the takes before locking
word arrivals and final mix levels. After they arrive, import each explicitly,
check duration, adjust copy/holds with the user's approval, then review scene
mixes and the full export. Never infer that importing a take approves it.

Use the quality reference to inspect composition, motion and final mix. Deliver
the requested draft/final video with accurate narration and review status.
