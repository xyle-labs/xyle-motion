# License and third-party notices

Xyle Motion's original code, documentation, skill, examples, SVG artwork, themes
and procedurally generated music/effects are licensed under [MIT](LICENSE).
Retain the copyright and permission notice when redistributing them.
The npm package remains a private development preview; no npm release has been
published.

Third-party software and models retain their own terms. The MIT license does
not relicense dependencies or grant rights to their code, binaries or weights.
See the [dependency license review](docs/licensing.md) for the pinned versions,
distribution boundaries and upstream sources.

In particular, **Remotion 4.0.524 uses a separate Remotion License**. Its free
license covers individuals, for-profit organizations with up to three employees,
nonprofits and noncommercial evaluation. Other users need a Company License.
Its restrictions on distributing a derivative of Remotion still apply; this
project does not bundle or relicense Remotion's implementation.
Read the [terms for the installed version](https://github.com/remotion-dev/remotion/blob/v4.0.524/LICENSE.md).

The bundled `library/audio-models/cb.rnnn` is Gregor Richards' conjoined-burgers
RNNoise model. It is excluded from this project's MIT grant: its author states
that the models are not subject to copyright. The upstream tools and README
are not bundled. Retain the [model provenance and upstream statement](library/audio-models/README.md).

Optional neural model weights are not included or automatically downloaded by
the package. The experimental OpenVoice/LavaSR helpers and Python dependency
pins have been retired. Any future replacement requires its own dependency
and model-license review before it is enabled or redistributed.
