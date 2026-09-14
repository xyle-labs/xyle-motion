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
