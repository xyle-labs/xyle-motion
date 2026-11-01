# Your first editable video

Xyle Motion is a development preview. Use Node.js 24 and npm. There is no npm
release yet: build a tarball from a reviewed checkout, then install that file
in the project that will own the video.

```sh
# In the toolkit checkout
npm ci
npm run security:setup
npm pack

# In your own project; replace this with the actual tarball path
npm install --save-dev --save-exact /path/to/xyle-labs-motion-0.1.0-dev.0.tgz
npm exec -- explainer --version
npm exec -- explainer demo videos/first-video
npm exec -- explainer validate videos/first-video
npm exec -- explainer render videos/first-video
```

Open `videos/first-video/output/first-video.mp4`. It contains two scenes over
six seconds, with bundled artwork, a music bed and effects. The second scene's
narration script has no take and remains silent. No provider key is needed.
The first render downloads a compatible headless browser into a writable cache.
See [browser recovery](browser-recovery.md) if that fails. Full FFmpeg on PATH is
needed for narration decoding, import and cleanup; ordinary rendering uses
Remotion's bundled FFmpeg.

`demo` copies the fixed bundled example and writes a brief; it refuses an
existing destination. It ignores project creation defaults and accepts neither
`--scene` nor `--config`. Use `new videos/your-video` for a blank starter that
uses your project's configured defaults.

## Make one change

Inspect the first scene:

```sh
npm exec -- explainer inspect videos/first-video --scene idea
npm exec -- explainer assets videos/first-video
```

Open `videos/first-video/video.yaml`. Change the `title` element in scene `idea`
from `An idea, made visible.` to `Your idea, made visible.`. Keep the rest of the
file. Check a frame after the entrance animation, then render again:

```sh
npm exec -- explainer validate videos/first-video
npm exec -- explainer frame videos/first-video --scene idea --time 1.5
npm exec -- explainer render videos/first-video
npm exec -- explainer render videos/first-video
```

Open `output/frame-idea-1.5s.png` to check the edit. After that single-scene edit,
rendering reports `1 rendered, 1 reused`. With no further changes, the next render
reports `0 rendered, 2 reused`. Full exports mix music across the complete timeline.

## Review and share

```sh
npm exec -- explainer contact-sheet videos/first-video --frames 3
npm exec -- explainer review videos/first-video --note 'Draft; listening review pending.'
```

Open `output/review/index.html`. It links the MP4, contact sheet and scene
navigation, and labels whether the render matches current inputs. Move the
whole `review` folder when sharing. Watch the cuts and listen to the full mix;
validation and a contact sheet cannot establish playback quality.

The [workflow GIF](media/workflow.gif) illustrates these commands with condensed
timing and then shows the actual rendered example. Its generator runs the
commands against an installed package; it is not a real-time terminal recording.
The commands and outputs above also provide a readable transcript.

## Work with an agent

Copy the entire `skills/xyle-motion` folder from the installed package to
`.agents/skills/xyle-motion` in your project (or `.claude/skills/xyle-motion`
for Claude Code). Preserve an existing installation.

Ask: `$xyle-motion Create a short explainer using this project's knowledge.
Guide me through the story, artwork, music and review.`

Keep the brief, facts, brand, YAML and original recordings in the consuming
project. Ignore `**/output/` and generated recording previews in its Git
configuration; back up original takes. [The workflow guide](workflow.md) covers
artwork, narration and targeted revisions.
