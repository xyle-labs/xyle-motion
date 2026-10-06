# Development status — 6 October 2026

Xyle Motion is a public development preview: one `@xyle-labs/motion` package,
the `explainer` CLI and the `$xyle-motion` skill. `package.json` remains
`private: true`; npm publication awaits review of the exact release contents.
Original source and assets use MIT, with third-party exceptions in [NOTICE.md](../NOTICE.md)
and [licensing.md](licensing.md).

## Implemented on `main`

- An installed, compiled package using explicit external video directories,
  bundled SVGs/themes/audio, isolated renderer/browser caches, a deterministic
  renderer and scene cache, scene inspection, and a neutral example.
- Video-relative PNG/WebP/SVG artwork; local recording with gentle/RNNoise
  cleanup; decode-only narration import; scene mixes with the final timeline
  music bed; editable narration timing markers; portable review bundles; and
  browser recovery diagnostics.
- A portable skill and development checks. The required `security` workflow
  runs the history scan, logic tests, build and skill context test on Ubuntu.
  CodeQL also runs. The installed-tarball render smoke has been exercised
  locally, including external paths, artwork, narration, cache behavior and an
  unchanged installed package. Prior frame/contact-sheet inspection and MP4
  probing are recorded; full human playback/listening review remains open.

Experimental OpenVoice/LavaSR helpers and Python dependency pins were retired.
Neural restoration and speaker conversion are unavailable. Scene IDs are
validated before use as cache/export filenames. The generic artwork supports
engine validation; it is not a finished brand kit.

## Remaining work, in order

1. [#35](https://github.com/xyle-labs/xyle-motion/issues/35): shared project
   asset/theme roots and creation defaults. Video-relative artwork already works;
   the planned `explainer.yaml` and `--config` interface do not yet exist.
2. [#36](https://github.com/xyle-labs/xyle-motion/issues/36): an installed-package
   client project pilot, preserving originals and checking actual playback.
3. [#37](https://github.com/xyle-labs/xyle-motion/issues/37): Linux CI for the
   installed-tarball render smoke. Current Ubuntu CI checks do not render video.
4. [#38](https://github.com/xyle-labs/xyle-motion/issues/38): exact-tree, tarball,
   license/media and publication review. Keep npm publication disabled until
   release contents are approved.

Optional [#17](https://github.com/xyle-labs/xyle-motion/issues/17) music ducking
has a [draft PR #29](https://github.com/xyle-labs/xyle-motion/pull/29) with
automated checks; its requested listening review is still outstanding. The
[implementation plan](portable-toolkit-plan.md) gives the milestone acceptance
details. GitHub issues track the remaining execution work.
