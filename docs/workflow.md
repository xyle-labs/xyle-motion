# From a brief to a reviewed export

The project owns the story, sources, brand, editable `video.yaml` and original
takes. The installed package owns the renderer and reusable library. Run every
command with an explicit video directory from the consuming project.

| Goal | Command after `npm exec -- explainer` | Inspect |
| --- | --- | --- |
| Try a finished small example | `demo videos/example` | Six-second video after rendering |
| Start your own story | `new videos/story` | `brief.md` and `video.yaml` |
| Understand a scene | `inspect videos/story --scene intro` | Script, timings, elements and warnings |
| Reuse resources | `assets videos/story` | Artwork, themes, music and effects |
| Check layout | `validate videos/story`, then `frame videos/story --scene intro --time 1.5` | Actual frame at a visible hold |
| Compare moments | `contact-sheet videos/story --frames 3` | Entrances, holds, exits and cuts |
| Preview motion | `preview videos/story --scene intro` | Real-time scene playback; music omitted |
| Record a take locally | `record videos/story` | Studio rehearsal, original and processed take |
| Attach prepared speech | `import videos/story --scene intro --input take.mp3` | Original retained, decoded WAV attached |
| Generate approved speech | `narrate videos/story --scene intro --voice voiceId` | ElevenLabs take and generation receipt |
| Check a scene's audio balance | `mix videos/story --scene intro` | Voice/effects with the timeline music bed |
| Export and share | `render videos/story`, then `review videos/story` | Full mix and portable review folder |

Start with a timed story and one representative content frame. Edit scenes by
their stable IDs. Keep sources for factual claims beside the brief; check counts,
labels and visual comparisons against those sources. Narration text alone is
silent. Budget speech at no more than 165 spoken words per minute, including
expanded numbers.

Use [project configuration](../README.md#shared-project-resources) for shared
artwork, themes, context pointers and creation defaults. Use
[video-relative files](../README.md#project-artwork) for project illustrations.
Reuse suitable library assets before drawing more. The
[DSL reference](../skills/xyle-motion/references/toolkit.md) documents supported
elements and animations.

Recording, cleanup, import and rendering are local. Explicit `narrate` calls
send the approved script to ElevenLabs and can consume account credits; they
require a process API key and selected voice. Read the
[narration guide](../skills/xyle-motion/references/recording.md) before generating
or replacing takes. Credentials never belong in YAML or command arguments.

After a change, refresh the evidence it affects: a frame for copy/layout,
playback for movement, listening for speech/effects, and the full export for
music or delivery. Changed scenes rerender; unchanged parts are reused. A review
bundle reports freshness and collects delivery artifacts; it does not approve
the video. Record what was actually reviewed and what remains open in the brief.

## Rebuild the walkthrough

After packing and installing Motion into an external project, run this from the
toolkit checkout, with the actual installed package path and a new external
directory whose parent already exists:

```sh
node scripts/demo.mjs /project/node_modules/@xyle-labs/motion /tmp/motion-walkthrough
```

The script requires full FFmpeg. It runs `demo`, `assets`, `inspect`, `validate`,
`frame`, `render`, `contact-sheet` and `review`, edits the first title, verifies
cache reuse and current review status, then renders five illustrated steps with
Motion itself and appends the real six-second export. Outputs are `workflow.gif`
and `workflow.mp4`; intermediate sources and evidence stay in the external
directory. Existing output directories are refused. The GIF is silent; the MP4
includes the example's music/effects. No speech is generated.

Review composition, motion and metadata before copying the GIF to
`docs/media/workflow.gif` and updating its checksum. The documentation media
exception accepts only that exact path and reviewed bytes. Run the installed
tarball smoke test after changing the packaged CLI or documentation.
