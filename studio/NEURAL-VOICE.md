# Local neural voice processing

The studio can now use two complementary models:

- **LavaSR v2** denoises and restores speech quality. It keeps the speaker's voice.
- **OpenVoice V2** converts the recorded voice's speaker tone using a target
  embedding. Your recording supplies the words and performance. It does not
  generate narration from the script. Accent, rhythm and other speaking habits
  can remain; it is not a guarantee of anonymity.

Use **Speech restoration → LavaSR v2**, then choose a target under **Speaker
conversion → OpenVoice V2**. Selecting a target resets the old pitch disguise
and selects LavaSR. For cleanup alone, choose **Keep my voice**. Listen to the
original and the preview before **Use in video**.

**Preview full mix** renders the selected scene with the processed take, sound
effects and background music. It works before a take is attached or a full video
has been rendered. Music starts at that scene's position in the project; an
extended take gets the proposed longer scene. The preview is one video with
pause and seek controls, so all audio stays in sync. The first preview renders
locally; unchanged previews are cached. Recording and rehearsal still use a muted
clip reference. Only **Use in video** changes the project.

English targets come from the official OpenVoice V2 bundle. Their names identify
the supplied embeddings; they do not promise a new accent. No external reference
speaker is cloned. A project-specific reference upload is not implemented.

### Older male auditions

The Python runner also accepts `--reference path/to/speech.wav` with
`--speaker en-default`. `--reference-mix 0.5` blends that reference's embedding
with the bundled default; `1` uses the reference fully. This is an experimental
timbre blend, not a calibrated age control. No pitch shift or speed change is
added. Reference audio must contain 3–60 seconds of clear speech.

The first older-male comparison used the Mac's installed **Grandpa (English
(UK))** synthetic voice as a reference, saved locally at
`.local-voice/references/older-male.aiff`. It reads unrelated text only to supply
timbre; the human take still supplies every narrated word and its timing.
No cloud service or external person's recording is used. This character was
rejected as insufficiently fresh; it is not a selected studio preset.

To reproduce both variants from a recorded take:

```sh
.local-voice/venv/bin/python scripts/audition-older-voice.py path/to/take.wav .local-voice/references/older-male.aiff
```

The command creates `out/older-voice-audition/{older-subtle,older-full}.wav`,
records source hashes and checks duration, distinct outputs and preservation of
both source files. The synthetic reference is local to this Mac and is not
downloaded by setup or committed to Git.

The next comparison is in `out/british-voice-audition/`: the bundled `en-br`
target, a local Daniel reference, and a 65% local Eddy (English UK) reference
blended with the approved default. Both synthetic references are saved under
`.local-voice/references/british-*.aiff`. All use the human take with no added
pitch shift or acceleration. These remain auditions awaiting a listening choice;
reference timbre does not guarantee British pronunciation. `results.json`
records the exact inputs, settings, durations and output hashes.

The current shortlist is **OpenVoice default** (the user's preferred female
sound) and **British Daniel**. The next female-reference auditions are in
`out/female-voice-audition/`: local Flo (English UK) at full reference strength,
and a 40% Flo / 60% default embedding blend. They use the same original take
for comparison, not a generated reading of the revised PBL script. The reference
is `.local-voice/references/british-flo.aiff`; audition settings and hashes are
saved in `results.json`. No final series voice has been selected yet.

With both enabled, the pipeline is:

```
Recorded take → LavaSR denoising → OpenVoice tone conversion
              → LavaSR bandwidth restoration → timing/level adjustment → preview
```

Both models run on CPU in a separate Python 3.11 environment. Apple GPU
acceleration is not assumed. Model timing is checked; only partial frames at
the tail (up to 0.1 seconds) are padded/trimmed to maintain the recording clock.
The original is never overwritten. The 165 WPM teleprompter and 169 WPM ceiling
remain in effect; the model does not automatically rewrite or accelerate speech.

## Setup and reproducibility

From the repository root:

```sh
python3 scripts/setup-neural-voice.py
npm run explainer record project-based-learning
```

Setup downloads code, Python packages and model weights into `.local-voice/`,
which is ignored by Git. It changes no system Python installation. Allow roughly
2 GB including the environment and download cache. Git and full FFmpeg must
already be installed. This setup targets macOS/Linux.

Source revisions, model URLs and SHA-256 hashes are pinned in
[neural-models.json](neural-models.json); Python requirements live in
[neural-requirements.txt](../scripts/neural-requirements.txt). No TTS models,
Whisper, Gradio server or cloud inference endpoint are installed or called.
Inference sets offline flags and blocks Python network connections. Missing
models produce a setup error, never an automatic download during recording.

The converter uses the upstream model directly instead of OpenVoice's TTS/demo
wrapper. The generated preview is explicitly labelled as converted in the studio;
the optional upstream watermark component is not part of this pipeline.

## Local audition

For a recorded PCM WAV, this creates level-matched LavaSR-only and two converted
previews in `out/neural-audition/`, checks duration and caching, and confirms the
original file is unchanged:

```sh
node scripts/test-neural-voice.ts path/to/recording.wav
```

Neural processing currently accepts one scene at a time, 0.3–60 seconds. Results
are cached by recording, settings, runner, model manifest and requirements.
Listen for altered consonants, metallic sound, lost words or residual noise.
The automated checks establish execution and timing, not perceptual quality.

Sources: [OpenVoice V2](https://github.com/myshell-ai/OpenVoice) and its
[converter implementation](https://github.com/myshell-ai/OpenVoice/blob/main/openvoice/api.py)
(MIT); [LavaSR](https://github.com/ysharma3501/LavaSR) (Apache-2.0);
[Vocos dependency](https://github.com/langtech-bsc/vocos/tree/matcha) (MIT).
Upstream license files stay with their downloaded source checkouts.
