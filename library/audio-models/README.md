# Offline noise model

`cb.rnnn` is Gregor Richards' conjoined-burgers RNNoise model, in the format
accepted by FFmpeg's `arnndn` filter. The studio reads this bundled 300 KB file
locally; it never downloads a model at runtime or sends audio to a service.
No Python, GPU, account or API key is required.

Pinned download URL and SHA-256 are in [provenance.json](provenance.json).
The [upstream author](https://github.com/GregorR/rnnoise-models/blob/master/README.md)
states that the models are not subject to copyright; the exception is the
upstream tools directory and README, neither of which is bundled here.
The FFmpeg-compatible distribution is
[richardpl/arnndn-models](https://github.com/richardpl/arnndn-models).

This is noise reduction, not speaker conversion. Strong suppression may damage
speech or leave artifacts, especially with competing speakers and severe noise.
Use Gentle for a less processed result. Keep originals and compare by listening.
Voice disguise uses local pitch/resonance shifts independently of this model;
it does not create a cloned speaker or guarantee anonymity.
