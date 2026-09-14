# Xyle Motion

One package and one skill. The agent writes video YAML; the deterministic shared
renderer reads it. Ponytail is the default. No per-video React or provider API.

Read skills/xyle-motion/SKILL.md for video work and its references only as needed.
Use explicit external video directories. Package resources resolve through
src/paths.ts; writes belong to the video or writable runtime cache. Never derive
client paths from the package working directory or load host Remotion config.

Keep originals and all narration processing local. Reuse existing SVGs, music,
effects and scene patterns. Validate and inspect actual frames; use playback
for motion/audio. Do not claim checks that were not performed.

Run npm run check and npm run build for logic changes. Packaging changes must
pass the installed tarball smoke check in scripts/smoke.mjs. Keep the repo and
package private until the release contents and licenses have been reviewed.
