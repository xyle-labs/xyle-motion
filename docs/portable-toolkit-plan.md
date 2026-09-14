# Portable video toolkit — implementation plan

Status: extraction started, 14 September 2026. Chosen name: Xyle Motion.
GitHub `xyle-labs/motion`, npm `@xyle-labs/motion`, executable `explainer`.
The first installed-package smoke check passes; shared client configuration and
the client project pilot are next. See STATUS.md for measured checks and release limits. The actual client project checkout/path will be located before its pilot.

**Ship one installable package and one portable skill. The client project owns
its videos and assets. Reuse the existing renderer. Prove this in the client project before
building anything for a commercial platform.**

## Outcome and scope

An agent working inside the client project can use that project's knowledge, brand and
artwork to create, review, record and render an explainer. It stays in the same
workspace. The toolkit is a pinned dependency; it contains no client content.
An unrelated project can use the same package without a checkout of this repo.

Keep the current DSL, scene cache, asset library, animation grammar, sound/music
selection and local recording studio. The agent writes content and `video.yaml`;
the renderer remains deterministic. Token savings come from scoped reads,
existing scene patterns and reused assets, not skipped visual/audio review.

No monorepo, renderer rewrite, provider integration, MCP server, account system,
asset marketplace, cloud rendering, new timeline editor or billing in v0.1.
Public npm publication is optional for the pilot: a local npm tarball is enough.

## Where things live

New toolkit repository, one package:

```text
video-toolkit/
  bin/ src/                 Existing CLI and deterministic engine
  studio/                   Existing local recording interface
  library/                  Generic, redistributable SVGs, music and effects
  themes/                   Generic palettes cleared for redistribution
  skills/explainer-video/   Self-contained workflow and references
  examples/minimal/         Small neutral example, also used for smoke checks
  scripts/                  Build, audio generators and relevant checks
  docs/                     Current implementation guidance
  package.json              Version, bin, files allowlist, dependencies
  README.md LICENSE         Actual quickstart and chosen code license
```

Client project, illustrative layout; preserve existing folders and point to them:

```text
client/
  brand/                    Existing identity and brand guidance
  artwork/                  Existing reusable art
  docs/                     Existing subject knowledge
  .agents/skills/           Installed video workflow
  videos/
    explainer.yaml          Optional shared locations and creation defaults
    library/                New reusable client art, sounds and music
    learning-by-doing/
      brief.md
      research.md           Only when claims need research
      sources.yaml
      story.md
      storyboard.yaml
      video.yaml
      recordings/           Originals are source material, backed up
      output/               Generated frames, MP4 and scene cache, ignored
```

The public repo starts with an explicit copy of reviewed current source files,
including required untracked improvements. Do not export HEAD alone: this
working tree contains substantial unfinished/uncommitted work. Do not copy the
old `.git` history, client projects, recordings, generated output, `.env` files,
`elevenlabs/`, local Python environments or downloaded model weights. Keep the
original repository and projects intact as the reference and rollback path.

## Small public interface

Proposed commands, called through the installed binary (for example
`npm exec -- explainer ...` inside the consuming project):

```sh
explainer new videos/learning-by-doing
explainer inspect videos/learning-by-doing
explainer inspect videos/learning-by-doing --scene hook
explainer assets videos/learning-by-doing
explainer validate videos/learning-by-doing
explainer frame videos/learning-by-doing --scene hook --time 2
explainer contact-sheet videos/learning-by-doing --frames 3
explainer record videos/learning-by-doing
explainer render videos/learning-by-doing
```

Use an explicit video directory containing `video.yaml`; no new project
registry. Accept `--config <path>` for a shared workspace configuration. By
default, look for `explainer.yaml` in the video directory and its immediate
parent only; explicit configuration handles other layouts. Resolve it the same
way regardless of the shell's working directory. Keep unsupported/missing
project paths as clear errors rather than guessing another project.

`inspect` adapts the existing skill context helper; it returns a compact summary
or one scene. Do not build another indexing service. Preserve `--scene` and
scene-relative `--time` behavior across the existing commands.

The optional configuration has only the fields the client project pilot needs: asset
roots, theme roots, new-video defaults and a short list of context-document
paths for the skill. Paths are relative to the configuration file. No inheritance,
remote fetching or executable configuration. Defaults are copied into a new
video's YAML, so changing them does not silently retime/rebrand existing videos.
The skill reads context pointers selectively; the renderer does not read prose.

Keep skill installation simple for v0.1: ship the complete skill folder and
document copying it into the host's supported skill directory. A repository-local
copy follows the toolkit version and can be reviewed in Git. Do not overwrite
existing skills or host `AGENTS.md` during package installation. Add a setup
helper only if the pilot shows the documented copy is a real onboarding problem.

## Path and ownership rules

| Input/output | Resolution |
| --- | --- |
| CLI target and explicit config argument | Relative to caller's working directory, normalized once |
| Renderer entry point, studio files, bundled library, helper scripts | Relative to installed package location |
| Shared asset/theme roots and context pointers | Relative to selected config file |
| Narration, explicit music paths, per-video recordings/output | Relative to video directory |
| Runtime/browser/model caches | Writable user cache or explicit local location; never the installed package |

Use one small path resolver and plain function arguments. No filesystem service
classes or plugin interfaces. Resolve actual asset/theme/audio bytes before
computing cache keys; hash installed renderer files rather than the host repo.
Keep music out of scene keys and mix it over the complete stitched video.

Reuse the filesystem registry. Combine bundled and explicitly configured local
roots, report the source in `assets`, and reject duplicate IDs with both paths.
Give client art a category such as `client/` to avoid collisions; no silent
overrides or new asset namespace syntax is needed. Shared client artwork stays
in that client workspace. Public contributions are intentional copies with
explicit rights, not an automatic promotion/upload feature.

The public starter uses a neutral palette and no mandatory studio opening.
Preserve the client’s branded opening in existing videos. A client may copy an approved
opening scene into new videos; use the current YAML composition mechanism,
not a renderer feature for branding. Offer the generic music/effect choices;
do not reduce the library to one default track or regenerate it on install.

## Milestones, in order

### 1. Extract and prove an installed render

Create the new local project from an allowlist of the current engine, relevant
tests and runtime resources. Record the source snapshot used. Keep one package
with the existing dependency versions during extraction. Add a minimal build
that emits JavaScript for the CLI/renderer and rewrites relative imports; prefer
the TypeScript compiler as a build-only dependency. Include the studio/static
resources at stable package-relative locations.

The current `node bin/explainer.ts` development shortcut cannot simply become
an npm executable: Node refuses TypeScript stripping under `node_modules`.
See [Node's dependency rule](https://nodejs.org/api/typescript.html#type-stripping-in-dependencies).

Set a `bin` entry and explicit package `files` allowlist. Test with `npm pack`
and install the resulting tarball into an unrelated temporary project, outside
the source checkout. A symlinked development install does not prove packaging.
Use a pinned supported Node version (start with Node 24) and document browser
and FFmpeg requirements. Verify browser downloads/caches use writable locations.

Resolve the package's Remotion executable and explicit renderer entry point.
Avoid `npx remotion` selecting the client's version or downloading another one;
do not inherit unrelated host Remotion configuration. Keep all generated writes
outside the package, even if a renderer subprocess uses it as its working directory.

**Done:** from a directory containing only the installed package and a neutral
video, `validate`, `frame`, `contact-sheet` and full `render` work. Inspect the
frame and play the short MP4 with a bundled effect/music bed. No source checkout
or ancestor `node_modules` can supply missing files. Test a path with spaces.

### 2. Add client resources and complete local audio portability

Introduce the small shared configuration and resolver rules above. Carry the
same resolved paths through `library.ts`, `theme.ts`, `audio.ts`, `cache.ts`,
`recording.ts` and `recording-preview.ts`, as well as the CLI. The recording
server currently renders `basename(directory)` from the toolkit root; replace
that with the actual external video path. Recording previews also currently
derive project paths from the old `videos/` convention.

Keep native recording/import, FFmpeg cleanup, take previews and attachment.
Preserve local-only processing and original-take protections. Port optional
OpenVoice/LavaSR setup to a writable local cache with pinned provenance; do not
download weights during npm installation. They are not prerequisites for basic
creation. Do not advertise optional conversion as available until its installed
package path has been verified; the original installation remains usable.

**Done:** a client SVG/state, palette, music and effect resolve alongside
bundled resources. Duplicate IDs fail clearly. A recorded/imported take can be
previewed, attached and rendered in the external video without writing into
the package. Two clients can use their own libraries without sharing content.

### 3. Make the skill portable and run the client project pilot

Remove the skill's “run from toolkit root” requirement. Package its needed
references with it; replace links to private finished projects with a few
neutral working examples. Route scene/context reads through `inspect`. Preserve
the concise workflow, reusable patterns, artwork review, music auditioning,
local narration and final mix review established in the previous workflow update.

Locate the client project and read its own agent instructions. Install the packed version
there, or first use a disposable copy if it is an active production workspace.
Reference existing brand/art directories. Copy a representative video as a
pilot; keep its original untouched. Also create one short new video from the client project
knowledge, because rendering an imported file alone does not test the skill.

**Done:** an agent in the client project completes story → suitable existing art → targeted
visual review → narration/music → full video without reading this private
toolkit repo or writing bespoke React. A later one-scene revision reads and
changes that scene only. Capture available token usage and human review time;
report actual measurements, not predicted savings.

### 4. Prepare the public repository and v0.1 release

Write a short README about the working product: prerequisites, package install,
skill setup, first video, revisions and local audio. Link detailed references.
Keep the original 2,800-line design document in this development repository.
Choose a code license and document separate artwork/music/model rights and
attributions. Verify redistribution rights file by file for shipped media;
quarantine unclear assets from the public bundle without deleting originals.
Document [Remotion's separate license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).

Run CI for pure checks plus the packed-package smoke workflow. Start support
claims with macOS and Linux once verified; do not claim Windows compatibility
before its path, subprocess and audio flows are tested. Review the complete new
Git tree and tarball contents, including all commits intended for publication.
An npm allowlist does not protect files committed to a public Git repository.

**Done:** a fresh checkout can build the exact reviewed package; a new user can
follow the README to create a neutral explainer in another directory. Names,
license, media notices and release contents are concrete and reviewable before
creating/publishing the public `xyle-labs` repository or npm release. No accounts
or registry publication are necessary to complete the local pilot.

## Checks that earn their place

Keep existing meaningful pure tests and add one external-consumer integration
fixture. It should cover resource resolution and missing/colliding IDs; paths
with spaces; installed renderer/static resources; recording/export locations;
and unchanged originals. Run actual render checks from the installed tarball.

Cache acceptance: render twice (second reuses every part); edit one scene (only
it rerenders); edit a local SVG (only its consumers rerender); change music
(scene parts reused, final mix changes); change renderer build (parts invalidate).
Inspect representative frames before/after extraction using the same inputs;
compare actual pixels/motion and audio rather than MP4 file hashes. Review the
mixed output with headphones. Validation alone cannot establish art quality.

Test one fresh consumer with no host React setup and one host with its own React
dependencies. The toolkit must resolve its own compatible renderer dependencies.
Do not expand to a matrix of package managers or platforms until those cases work.

## Commercial follow-up

Keep agency market validation separate from this extraction. After the client project
pilot, use the same portable workflow in paid agency pilots and measure revision
time, art-direction effort, support burden and repeat demand. Those findings can
justify brand onboarding, paid packs or review tooling. No commercial platform
abstractions are needed to preserve that option now.

Packaging references: [npm package metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
and [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/).
