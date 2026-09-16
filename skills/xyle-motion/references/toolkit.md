# Toolkit system reference

## The DSL as it stands

Elements: `text`, `overlay` (a rect; full-bleed when given no geometry), `line`,
`asset`, `callout`, `group`.
Position with `x`/`y` (pixels, or `left|center|right` / `top|center|bottom`) —
they address the element's **centre**. Also `width height rotation z opacity
at until`.

A `group` transforms several elements together. Put `group: <group-id>` on
its members; their coordinates and times stay scene-relative. The group's
`x`/`y` set the transform pivot, and its animation composes with each member's
motion. Groups are flat (no nesting or repeats) and affect visuals; audio
remains on the scene timeline. Keep labels and targets in the same group.

Many copies of one thing: `repeat: 60, columns: 10, gap: 12, stagger: 0.03`.
`width` then sizes one copy and the grid is centred on x/y; `stagger` delays
each copy's entrance. This is README §14's Row/Column/Grid/Stack as four fields
— reach for it before hand-placing anything more than once.

A `callout` labels another element: `target` names an element id in the same
scene, `side` (left|right|top|bottom) picks an edge, and a leader line runs out
from that edge to the word. Its `x`/`y` are ignored — the position is derived,
so moving the thing moves its label. `leader` is the line's length, `thickness`
its weight, `gap` the space before the text. With `side: right`, `enter: { type:
wipe }` draws the leader and then lands the word. Reach for this instead of
hand-placing a `line` plus a `text`; those coordinates go stale the moment the
subject moves.

Three animation slots per element, which compose (opacity multiplies, transforms
concatenate):

- `enter:` appear fade slide-up slide-down slide-left slide-right pop wipe
- `animation:` none highlight pulse count-up switch-on switch-off move draw
  drift float tumble sway scale
- `exit:` none fade slide-* shrink wipe — **defaults to a 0.4s linear fade**, so
  a scene empties itself and the cut lands on nothing

All three take `duration delay easing distance by color`. Easings are
`smooth` (out-quintic, the default), `soft`, `linear`, `in` (accelerating quadratic),
`inout`, `back`, `spring`. `tumble` combines a `by` translation with a `distance`
turn in degrees. `sway` uses `distance` degrees for one damped oscillation over
`duration`, then rests; it uses elapsed time directly, independent of easing.
Both rotate about the element's centre; place an SVG's pivot there when authoring it.
`scale` uses `distance` as the final scale factor (0.5 = half size) and `by`
as an accompanying translation. Its starting scale is 1.

**Arrivals ease out, departures do not.** `smooth` is 0.76 of the way done a
quarter through — right for something landing, wrong for something leaving,
where it reads as a vanish followed by an empty frame. Exits default to
`linear` for that reason, and a test pins it.

Scenes render separately, so there is no cross-dissolve between them. Exits are
what replace it: the outgoing scene clears, the incoming one arrives.
`count-up` animates the first number written in the element's own `text`, so
`"PHP 12.50 per kWh"` needs no extra fields. `draw` requires a `line`.

## Themes

The public starter uses the bundled neutral palette. Per-client theme lookup is
planned; use supported explicit scene/video colours in the meantime.

`video.theme: neutral` loads the bundled `themes/neutral.yaml`. Any colour field may then name a
palette entry (`color: accent`) instead of a hex, and the video's ground and ink
default from the theme. Resolution happens on the raw YAML *before* Zod runs, so
schema defaults only fill what the theme left unsaid.

The palette also reaches the page as CSS variables, which is why an asset
written with `currentColor` and `var(--accent, ...)` recolours with the theme
instead of needing a second copy of the file. Author them that way.

A scene may provide `palette: { background, text, ... }` to override the video
palette for that scene's semantic colours, SVG variables, ground and ink.
A reusable branded opening embeds its brand palette this way, keeping
the same appearance across themed videos without recolouring their content.

## Assets

There is no `registry/assets.yaml`. **The filesystem is the registry**:
`library/energy/coal-powerplant.svg` is `energy.coal_powerplant` (README §11
id form, derived). `explainer assets <project>` lists everything available and
marks what the project uses — run it before creating an asset (Rule 2).

Bundled assets are inlined into the page, not `<img>`-ed, so `currentColor` and
`var(--accent, ...)` in the art follow the element's `color`. Author new assets
that way: `viewBox="0 0 200 200"`, `width="100%" height="100%"`, main shape in
`currentColor`, highlights in `var(--accent, #e0a458)`.

States (README §9) live in the art, not in a registry or a React prop: wrap a
variant in `<g data-state="lights-on">`. An asset that has states requires the
element to name one, and validation lists the options when it does not. To
change state mid-scene, use two elements with `at`/`until` — that is what those
fields are for; there is no `set:` verb.

Project artwork uses `type: asset` with `file: artwork/plant.png` instead of
`asset:`. PNG, WebP and self-contained SVG are supported. Paths are video-relative
and must remain inside that directory, including symlinks; URLs and absolute
paths are rejected. Normal asset layout, animation, groups and repeats apply.
The image fits inside width/height without cropping or stretching and retains
transparency. Local SVGs render as images, with explicit colours and no `state`
or inherited theme styling. The CLI lists referenced files, validates paths and
invalidates only affected scene caches when file bytes change.

## Commands and audio

Use `npm exec -- explainer <command> <video-directory>` from the host project.
All paths to narration and explicit music files are relative to that video.
Bundled SVGs, music and effects are read from the installed package. Run assets
for the inventory. Project artwork uses video-relative `file` paths; shared client roots are pending.

Element sound: `{ id, at, volume }`; scene narration: `{ text, audio, volume }`;
video music: `{ file, volume }`. A bare music name selects a bundled bed. Current
choices: daybreak (upbeat), momentum (driving), calm (warm), clean (brighter),
curious (sparse). Text alone is silent. Audio processing stays local. Preserve
original takes; script edits require reviewing the attached audio.

Use validate plus actual visual/playback checks. Full render caches scene parts
and stitches them, then mixes continuous music. A scene edit invalidates only
that scene; music changes reuse all scene parts. Studio and ordinary isolated
renders omit music. `mix <video-directory> --scene <id>` and recording take
previews audition music at the scene's timeline offset with full-video fades.
`import <video-directory> --scene <id> --input <take>` decodes prepared narration
without cleanup, preserves its original and attaches a video-relative PCM WAV.
Cache metadata is generated output, not instructions to read.
