# Development status — 15 September 2026

Xyle Motion: package `@xyle-labs/motion`, command `explainer`, skill `$xyle-motion`.
The repository is public by owner request. Original source and assets use MIT;
third-party terms and the pinned dependency review are in NOTICE.md and
docs/licensing.md. The npm package remains private pending publication review.

Implemented: compiled npm package; explicit external video directories; bundled
SVG/theme/audio resolution; video-relative PNG/WebP/SVG artwork; isolated
renderer/browser caches; portable basic recording studio; scene inspection;
neutral example; self-contained skill.
Decode-only narration import, cached scene mixes with the final timeline bed,
CLI help, and short comparison-reel recording handoffs are implemented.
The existing deterministic renderer and scene cache are retained.

Validation: 61 logic and recording checks, plus the skill context check. The
packed-package smoke test installs into an unrelated directory with spaces and
an apostrophe, ignores a deliberately failing host Remotion config, renders
frames/a sheet/a six-second MP4, checks unchanged/one-scene/music-only cache
behavior, decodes local PNG/WebP/SVG artwork with proportion and transparency
assertions, checks image-byte edits invalidate only consuming scenes,
exercises gentle and RNNoise cleanup, and verifies the installed
package is unchanged. It also imports synthetic MP3 narration without modifying
the original and compares scene mix audio with the full export. Decoded scene
audio is trimmed before stitching so AAC padding cannot shift later takes.
The browser's initial download was also exercised.
A contact sheet was visually inspected; MP4 streams and duration were probed.
Full human listening/playback review remains outstanding.

Next: shared project asset/theme roots and workspace creation defaults; the client project pilot;
Linux render CI and publication review. Experimental neural tooling and its
Python dependency pins are retired; existing local cleanup and native recording
remain. Scene IDs are validated before they can become export/cache filenames.
The current artwork is suitable for engine validation, not a finished brand kit.

Extraction used the current working toolkit files, including uncommitted work,
rather than exporting its older HEAD alone. Client projects, recordings,
identity logos, credentials, model weights and old Git history were excluded.
The original repository and its videos were not modified during extraction.
