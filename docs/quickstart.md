# Install Motion, use it with an agent, keep the result

[Watch with pause/seek](media/workflow.mp4) or [view the silent GIF](media/workflow.gif).
The tutorial has three chapters: install at 0:00, use at 0:34, and outputs/benefits
at 1:13. A real six-second example starts at 1:42.

## 1. Install once

Use Node.js 24, npm and Git. Motion is a development preview and is not on npm
yet. Build the package from the public repository:

```sh
git clone https://github.com/xyle-labs/xyle-motion.git
cd xyle-motion
npm ci
npm run security:setup
npm pack
```

This creates `xyle-labs-motion-0.1.0-dev.0.tgz`. In your own existing project,
install that file using its actual path:

```sh
cd /path/to/your-project
npm install --save-dev --save-exact /path/to/xyle-labs-motion-0.1.0-dev.0.tgz
npm exec -- explainer --version
```

Give your agent the entire Motion skill folder. Run this from the same project,
and keep an existing `.agents/skills/xyle-motion` installation if present:

```sh
mkdir -p .agents/skills
cp -R node_modules/@xyle-labs/motion/skills/xyle-motion .agents/skills/xyle-motion
```

Claude Code can use `.claude/skills/xyle-motion` as the destination instead.
Invoke the installed skill in chat with `$xyle-motion`.

## 2. Use it actively

Start with a small, complete example:

```sh
npm exec -- explainer demo videos/first-video
npm exec -- explainer render videos/first-video
```

Open `videos/first-video/output/first-video.mp4`. The first render downloads a
compatible headless browser into a writable cache. Rendering the example needs
no provider key. See [browser recovery](browser-recovery.md) if needed.
Full FFmpeg on PATH is needed for narration decoding, import and cleanup;
ordinary rendering uses Remotion's bundled FFmpeg.

Ask your agent for one focused change:

> $xyle-motion Inspect videos/first-video. Change only the first title to
> “Clear ideas, made visible.” Keep scene two. Render a draft.

The skill directs the agent to inspect scene `idea`, edit that part of
`video.yaml`, validate it, check a frame and render. After the title edit,
rendering reports `1 rendered, 1 reused`. An unchanged render reports
`0 rendered, 2 reused`. The tutorial verifies these operations with the CLI;
its agent request is an illustrative prompt.

For your own topic, put the brief, facts and brand guidance in your project,
then ask:

> $xyle-motion Create a 30-second explainer from docs/topic.md. Use the project
> brand. Show a story plan and a sample frame. After approval, render a draft
> for review.

Use `new videos/your-video` for a blank starter with your project defaults.
`demo` copies the fixed six-second example. Both refuse an existing destination.
The [workflow guide](workflow.md) covers shared artwork, narration and targeted
revisions. Text without a take is silent; recorded speech stays local, while
explicit ElevenLabs generation requires credentials and can consume credits.

## 3. Keep the video and its editable source

| File | What it gives you |
| --- | --- |
| `videos/first-video/video.yaml` | Editable scenes, timings and references to artwork/audio |
| `videos/first-video/brief.md` | The story and review status |
| `videos/first-video/output/first-video.mp4` | The rendered video |
| `videos/first-video/output/review/index.html` | A portable page for reviewing the draft |

Create the review page after rendering:

```sh
npm exec -- explainer contact-sheet videos/first-video --frames 3
npm exec -- explainer review videos/first-video --note 'Draft; listening review pending.'
```

Open the review page, watch the cuts, check each scene and listen if audio is
present. Share the entire `output/review` folder. Its freshness label checks
whether the render matches current inputs; it does not approve the video.

Revisions involve less repeated work: the agent can inspect the scene being
changed, reuse the shared renderer and artwork, and render only changed scene
parts. Focused context and code reuse can reduce agent token use; savings
depend on the task and agent, and have not been benchmarked. Scene-cache reuse
reduces rendering work and is verified separately from token use.

Keep original takes and project artwork beside the video. Ignore `**/output/`
and generated recording previews in the project's Git configuration, and back
up original recordings. The project keeps ownership of its content and source.
