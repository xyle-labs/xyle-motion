# Xyle Motion

Create editable explainer videos inside the project that owns the knowledge,
brand and artwork. One npm package, one coding-agent skill, no MCP server.
The agent writes `video.yaml`; the shared renderer produces the video.

**Public development preview:** Xyle Motion's original code and assets use the
[MIT license](LICENSE). Dependencies and the bundled RNNoise model retain their
own terms; see [NOTICE.md](NOTICE.md), especially Remotion's separate company
licensing requirements. The package remains private and is not published to npm.

## Try the packed build in another project

Requires Node.js 24 and npm. The first render downloads a headless browser into
a writable user cache. Full FFmpeg on PATH is needed for recording/import and
voice cleanup; Remotion supplies the FFmpeg used to stitch ordinary renders.

In this repository:

```sh
npm ci
npm pack
```

In your own project, install the generated `.tgz` file by its actual path:

```sh
npm install --save-dev --save-exact /path/to/xyle-labs-motion-0.1.0-dev.0.tgz
npm exec -- explainer new videos/first-video
npm exec -- explainer inspect videos/first-video
npm exec -- explainer validate videos/first-video
npm exec -- explainer frame videos/first-video --time 1
npm exec -- explainer render videos/first-video
```

The video directory owns its `video.yaml`, `recordings/` and `output/`. Ignore
`**/output/` and generated recording previews in the host repository. Back up
original recordings. An existing directory is never overwritten by `new`.

A six-second, two-scene example is included in `examples/minimal/video.yaml`.
Copy its folder into your project to audition the reusable artwork, effects and
continuous music bed. Its narration script is deliberately unrecorded.

## Use the skill

Copy `skills/xyle-motion` from this repository (or the installed npm package)
to your project's `.agents/skills/xyle-motion`. Copy the entire folder so the
references travel with it; keep an existing skill if one is already installed.
Claude Code can use the same folder via `.claude/skills/xyle-motion`.

Ask: `$xyle-motion Create a short explainer using this project's knowledge.
Guide me through the story, artwork, music and review.`

The skill calls the installed CLI. It does not need this source checkout or
another provider account. It reads only relevant project context and scene YAML.

## Commands

`new`, `inspect`, `assets`, `validate`, `preview`, `frame`, `contact-sheet`,
`record`, `enhance`, and `render` all accept an explicit video directory.
Use `--scene <id>` for isolated changes and `--time <seconds>` for a frame.
Scene IDs must start with an ASCII letter or digit and contain only ASCII
letters, digits, underscores or hyphens (for example, `intro` or `scene-2`).
`contact-sheet --frames 3` shows three interior moments per scene.

`record` opens the local recording studio. Recorded takes, gentle/RNNoise
cleanup, trims, pitch controls and local previews are retained. Optional
OpenVoice/LavaSR conversion is unavailable; its experimental Python workflow
has been retired. No audio is uploaded. Text without a take is silent.

Studio/ordinary scene renders omit the music bed. Full stitched renders include
it; processed-take previews in the recording studio also audition the bed at
the appropriate timeline offset. Inspect real playback and listen before delivery.

## Project artwork

Keep illustrations beside the video's YAML and reference them with `file`:

```yaml
- id: illustration
  type: asset
  file: artwork/plant.png
  x: center
  y: center
  width: 800
  height: 1000
  enter: { type: fade }
  exit: { type: none }
```

PNG, WebP and SVG files use the usual asset positioning, size, opacity, groups,
repeats and animations. The image fits inside its width/height box without
stretching or cropping; transparency is preserved. Paths are relative to the
video directory and must stay inside it, including symlink targets. Absolute
paths and URLs are rejected. `assets` lists referenced local files alongside the
bundled library; `validate` reports missing files. Changed image bytes invalidate
only the rendered scenes using them.

Use exactly one of `file` or a bundled `asset` ID. Local SVGs render as images;
they do not inherit theme colours or support `state`. Use self-contained SVGs
with explicit colours and a `viewBox`. Bundled SVGs retain their inline styling
and state controls. Files are embedded in render props; no package files change.

## Current boundary

External video directories, local artwork and bundled assets/palettes/audio are implemented.
Shared client asset/theme configuration and the client project pilot are next. Explicit
narration/music paths are relative to the video directory. No cloud rendering,
accounts, or paid features are included.

## Development

Run `npm run security:setup` after cloning to install the commit/push checks and
retain an approved Git identity or use the neutral fallback. See [SECURITY.md](SECURITY.md) for
coverage, media review and remote protection requirements.

```sh
npm run check
npm run build
node --test skills/xyle-motion/scripts/context.test.mjs
node scripts/smoke.mjs /absolute/path/to/package.tgz
```

`XYLE_MOTION_CACHE` overrides the writable render/browser cache location.
`XYLE_MOTION_BROWSER_EXECUTABLE` selects an existing compatible Chrome binary.
These settings are optional. The renderer uses its own dependencies and an
explicit empty configuration, rather than the host project's Remotion config.

See [the extraction plan](docs/portable-toolkit-plan.md).

Contributions go through pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md).
