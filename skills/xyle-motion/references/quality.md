# Artwork, motion and audio review

## Reuse with art direction

Run `npm exec -- explainer assets <project>` before creating art. A library ID
is a candidate, not proof of fitness. Inspect its silhouette, relevant state,
perspective and visual weight against the other objects in the intended scene.
Reuse → recolour/resize → compose small assets → add the missing object.

Match the established style: rounded silhouettes, restrained shadows,
purposeful details and limited accents. Preserve simple pictograms for repeated
quantities. A decorative object can carry detail; sixty tiny people cannot.
Use the system reference's Assets and Themes sections when authoring SVGs;
do not flatten editable theme-aware art into bitmaps for convenience.

Check at phone viewing size as well as a full-resolution frame:

- Does the object read immediately, with correct proportions and state?
- Is the explanatory relationship true? Counts, bar lengths, labels, arrows
  and before/after states must agree with the stated comparison.
- Is there one clear focal point? Check contrast, small source credits,
  line breaks, overlaps, edge clipping and space needed by motion.
- Do objects share perspective, line weight and detail level? Does the subject
  remain legible in the actual palette, including scene overrides?
- For cutouts, composite the image over two contrasting solid backgrounds and
  inspect its alpha channel. A painted checkerboard is opaque artwork, not
  transparency; check edges for halos before approving the generated asset.

Inspect motion near arrival, the settled hold, the important action and exit.
Check repeated entrances finish in time and groups keep labels with subjects.
A midpoint thumbnail cannot establish any of those timing properties.

For a shared asset/theme change, find its consumers and inspect representative
affected uses (especially different sizes, states and palettes). Prefer a new
variant when an intentionally different object would alter approved old videos.

## Choose audio intentionally

The filesystem is the inventory: `rg --files library/music library/sounds`.
The installed package ships the existing tracks and cues. At present, the choices include upbeat `daybreak`, driving `momentum`,
warm `calm`, brighter `clean` and sparse `curious`. Use those descriptions to
shortlist, then audition available files; a mood label is not listening evidence.
Use the existing bed for a narrow edit unless the user requests a change.

Offer at most two plausible music choices when mood is undecided. Select volume
against the actual voice rather than assuming one number suits every recording.
There is no automatic ducking. A serious explanation may need a sparse bed;
an upbeat one may suit daybreak. The current starter is a default, not a mandate.

Use a cue to explain an event: `paper-turn` for a document change, `wood-tap` or
`soft-land` for an object arriving, `click` for a switch, `sparkle` or `chime` for
a discovery/resolution. Set cue density from the story: a short comparison may
need several coordinated subject changes, while a reflective explanation may
need very few. There is no effect quota. Never add one cue per copy
in a repeated grid. Leave breathing room around important words.

Preserve any approved client opening and its cues. Reuse existing
WAVs; only run a generator when changing that track/cue. Listen for clipping,
harsh effects, voice artifacts, inconsistent take levels and audible loop seams.

## Use the smallest sufficient evidence

All commands below start with `npm exec -- explainer` from the host project.

| Change/review | Evidence |
| --- | --- |
| Text, colour, size, asset state | `validate <project>` + `frame <project> --scene S --time T` at a visible hold |
| New scene layout | `contact-sheet <project> --scene S --frames 3`, then a full-size frame for fine detail |
| Movement, timing, state change | `preview <project> --scene S` or `render <project> --scene S`, inspect playback |
| Story structure / new full video | `contact-sheet <project> --frames 3` and inspect cuts in playback |
| Narration / effects | Listen to changed scene; validate fitting audio and check synchronization |
| Music, total duration, final delivery | Full `render <project>` and listen/watch the stitched MP4; unchanged scene parts are cached |

Choose `T` from the element's timing; `frame` defaults to time zero, often an
empty entrance. Three sheet samples are interior moments, not exact event
boundaries. Render event-specific frames when the action falls between them.

Studio and ordinary isolated scene renders omit background music. Use
`mix <project> --scene S` for a scene with the final timeline bed, then review
the full stitched video before delivery. A music-only edit should reuse
scene parts; do not bypass the cache or regenerate effects to audition a bed.

Open the actual produced artifact. An existing filename is not proof that it
matches current YAML/assets: saved sheets and MP4s can predate edits. The output
contact-sheet filename is also shared by full and scene-only sheet commands.
After a relevant input changes, refresh that evidence and note what it covers.

Fix a specific observed defect, recheck that scope, then stop. Do not repeatedly
render approved scenes to chase arbitrary polish. If playback/listening is not
available, state exactly what was inspected and leave that review for the user;
never call a silent validator result an audio or motion review.
