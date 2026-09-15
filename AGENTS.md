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
pass the installed tarball smoke check in scripts/smoke.mjs. The repository is
public by owner request; keep npm publication disabled until the release contents
and licenses have been reviewed. Do not choose a license without owner approval.

Run npm run security:setup after cloning. Use Jesse <jesse@xyle> for new commits;
neutral commits and contributors' GitHub noreply identities remain allowed.
Scan with npm run security:check before
pushing, and never bypass security hooks. Project and studio references are
acceptable. Keep confidential client content, personal paths, recordings and
assistant sessions out of source and commit messages. Review new media before updating
scripts/reviewed-media.json; retain public upstream license attribution.

Use branches and pull requests for changes to main. Required CI must pass and
review discussions must be resolved. Review changes to workflows, security
checks and media manifests explicitly; never bypass branch rules.
