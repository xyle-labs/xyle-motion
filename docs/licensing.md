# Dependency license review

Reviewed 15 September 2026 against `package-lock.json`, installed license files,
the package file list and upstream terms. MIT is a suitable permissive license
for Xyle Motion's original work; dependencies do not select a unique license for
the project. MIT allows commercial use, modification and redistribution while
requiring preservation of its copyright and permission notice.

## Direct dependencies

| Dependency | Pinned version | License |
| --- | --- | --- |
| React and React DOM | 19.3.0 | MIT |
| YAML | 2.9.1 | ISC |
| Zod | 4.5.4 | MIT |
| Remotion and `@remotion/cli` | 4.0.523 | Custom Remotion License |
| TypeScript (development) | 7.0.2 | Apache-2.0 |
| `@types/node` (development) | 24.13.4 | MIT |
| `@types/react` (development) | 19.3.0 | MIT |

The MIT/ISC/Apache dependencies do not require independently written Xyle files
to use their license. Preserve their notices if redistributing their code.
The installed dependency packages provide the applicable license texts.

**Remotion is not MIT.** The [4.0.523 license](https://github.com/remotion-dev/remotion/blob/v4.0.523/LICENSE.md)
permits free video/image creation for individuals, for-profit organizations
with up to three employees, nonprofits and noncommercial evaluation. Otherwise
a Company License is required. Its prohibition on copying/modifying Remotion
to sell or relicense a derivative also remains applicable. Xyle's MIT grant
does not waive these restrictions. Review the exact installed version: the
upcoming Remotion 5 terms are not the terms used for this review.

## Transitive dependencies and native tools

The lockfile includes MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD,
Unlicense and Python-2.0 packages, plus these exceptions:

| Component | License and implication |
| --- | --- |
| `mediabunny` and its AAC/FLAC/MP3 encoder packages, 1.55.5 | MPL-2.0. Its file-level copyleft applies to covered files, including modifications; it does not require separate Xyle files to use MPL. |
| `caniuse-lite`, 1.0.30001810 | CC-BY-4.0 data. Preserve attribution and applicable notices when redistributing the data. |
| Other `@remotion/*` modules and platform compositors | Separate upstream terms; missing npm license metadata is not a permissive license grant. Compositors also contain native FFmpeg components with their own terms. |
| FFmpeg | Normally LGPL-2.1-or-later; GPL-enabled and nonfree builds have different distribution conditions. Check the actual build before redistributing binaries. |

See [Mozilla's MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) for separate
files and source-availability duties, and [FFmpeg's legal documentation](https://ffmpeg.org/legal.html)
for native build conditions. An independently written CLI using an external
FFmpeg process does not by that fact need to adopt FFmpeg's license.

The package compiles its own TypeScript and declares external dependencies;
it does not bundle `node_modules`, Remotion's implementation, FFmpeg or a
browser. If a future release distributes those components, browser bundles or
containers containing them, review that artifact and include all required
notices and corresponding source. This review is not a redistribution approval
for every downstream binary or deployment.

## Assets and optional models

The original generic SVGs, themes, examples and procedural music/effects use
MIT with the source. The 18 WAV files were regenerated from the repository's
music/sound generators and matched their reviewed checksums. No human recording
or client identity artwork is included. New contributed assets still need
provenance review; the repository license cannot grant someone else's rights.

The bundled RNNoise model is a separate upstream artifact. Its author states
that the models are not subject to copyright. Preserve the exact source and
checksum in [the model provenance](../library/audio-models/provenance.json) and
the [upstream usage notes](../library/audio-models/README.md); do not label it MIT.

The experimental neural helpers and Python dependency pins have been retired.
OpenVoice/LavaSR/Vocos weights are not included. A source-code license is not
automatically a model weight license; review any replacement dependencies and
models before enabling or distributing neural conversion.

Keep `private: true` until a separate npm release is approved. Revisit this
review when dependencies, assets or the distribution format change.
