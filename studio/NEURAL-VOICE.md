# Neural voice workflow status

OpenVoice/LavaSR conversion is unavailable in this development package. The
experimental Python installer, runner and dependency pins were retired because
their PyTorch environment had known security vulnerabilities. Do not run the
installer or runner from an older checkout or reuse that environment.

Use the studio's gentle cleanup, bundled RNNoise suppression, and pitch/tone
controls. They process recordings locally with FFmpeg and preserve originals.
See [the narration studio guide](README.md).

Restoring neural conversion requires a compatible, security-reviewed dependency
set, model-license review, and verified local inference. No Python environment
or neural model downloads are needed for the supported workflow.
