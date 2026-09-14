---
name: xyle-motion
description: Create, edit and review editable explainer videos inside the current project using Xyle Motion. Guide story development, reusable artwork, music, recorded narration, visual review and rendering through the installed CLI.
---

# Xyle Motion

Work inside the user's project. The installed package owns the engine and bundled
library; the project owns its content, brand, recordings and video YAML. Use
`npm exec -- explainer <command> <video-directory>`; do not change into a toolkit
checkout or generate bespoke React. If the package is missing, follow the
project's installation instructions; do not guess a published version.

For an existing video, read its brief and run `inspect <video-directory>`.
Use `inspect <video-directory> --scene <id>` for a targeted revision. Read the
original YAML around that scene and edit surgically. Do not replace the full
file with an extracted scene. Read research only for factual changes.

For a new video, read [creation](references/create.md). Ask only for missing
choices that change the result. Respect existing approvals and client guidance.
Present a timed story and establish a representative content frame before
propagating visual choices. Keep knowledge and new assets in the host project.

Read [quality](references/quality.md) for artwork, motion or audio review and
[patterns](references/patterns.md) when reusing a visual mechanism. Read only the
needed section of [the system reference](references/toolkit.md) for DSL details.

Run `assets <video-directory>` before creating artwork. Select suitable objects
by inspecting their appearance and states. Use bundled music by mood and effects
for meaningful actions. Reuse files rather than regenerating them. Current
shared client library/theme configuration is pending; do not invent unsupported
fields. Existing external recordings/music paths remain video-relative.

Recorded narration stays local with originals preserved. Plan at ≤165 spoken
WPM including expanded numbers. Text without a take is silent. Never fabricate
listening or playback review. Validate, inspect representative frames, review
motion in scene playback, and assess the complete music mix in a full render.

Keep a short production status in the brief: approved choices, evidence reviewed,
open issues and next action. Refresh evidence after relevant inputs change.
Link the output and state any unrecorded scenes or incomplete reviews at handoff.
