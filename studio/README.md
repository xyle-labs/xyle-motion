# Narration studio

For generated production narration, use the installed CLI with the approved
scene script:

```sh
npm exec -- explainer narrate videos/first-video --scene intro --voice voiceId
```

It requires a process `ELEVENLABS_API_KEY`; `ELEVENLABS_VOICE_ID` can supply the
voice, and `--model` overrides the default `eleven_v4`. Generation sends approved
text to ElevenLabs and can consume account credits. Keep keys out of project
files and arguments, reuse verified outputs and avoid blind retries. See the
[narration guide](../skills/xyle-motion/references/recording.md). Existing human
takes and the recording/cleanup controls below work offline without a key.

The **iPhone Recorder** section pairs **Xyle Recorder**, the general iPhone
companion, with a protected internet API, sends scene scripts with speaking instructions,
and automatically imports its original M4A takes. Start Studio with
`XYLE_RECORDER_CONFIG=/path/to/private-credentials.json`; the file contains
`api_url`, the Studio identity `project` (for example `xyle-motion`), and its `token`.
Pair the phone once. Each task carries the current video ID, and the local
Studio imports only that video's takes. Other projects' takes remain queued.

The authoritative API and provisioning guide live in the WarayWaray backend's
`docs/mobile/voice-recorder.md`. The backend must be deployed and enabled first.
For notifications while the phone is closed, configure `XYLE_APNS_KEY_FILE`,
`XYLE_APNS_KEY_ID`, `XYLE_APNS_TEAM_ID` and the app's Apple push signing
capability. Failed notifications leave the request queued. Importing a take
never applies it to the video automatically. Takes without a matching
scene appear in the iPhone inbox for playback.

Use gentle cleanup, RNNoise suppression, and pitch/tone controls for local
voice processing. The experimental OpenVoice/LavaSR workflow has been retired;
neural speaker conversion is unavailable. The supported workflow needs no
Python environment or neural model downloads.

Start from the consuming project with an explicit video directory:

```sh
npm exec -- explainer record /path/to/video-directory
```

Open the printed local address in Chrome or Safari. Keep the terminal running.
Use `--port 4319` if the default port is already occupied. Full `ffmpeg` must
be installed and on PATH for importing and enhancing recordings.

1. Choose a scene. **Download script** exports all spoken lines with timing.
2. **Rehearse** follows a three-second countdown. Words highlight at the
   target pace; punctuation gets a little extra room. The words-per-minute
   figure counts spoken numbers and abbreviations conservatively. The target
   is 165 WPM or slower; the guide cannot be set above 169 WPM. Adjust
   **Reading window** to find a comfortable pace. **Focus mode** enlarges text.
3. **Record take** asks for microphone permission. Read after the countdown,
   then **Stop**. The reading guide finishing does not cut off your recording.
   Each take belongs to one scene; you can also import WAV, M4A, MP3, OGG or WebM.
4. Listen to the original and trim unwanted silence using its time display.
   Choose natural, warm or bright tone, or a deeper/lighter disguise. Pitch
   ranges from −9 to +9 semitones, with reading speed compensated separately.
   Strong cleanup uses a bundled RNNoise model locally; Gentle uses conventional
   hiss/rumble reduction. Both even out loudness. Strong reduction may damage
   speech, so compare by listening. Complete noise removal is not guaranteed.
   These disguise presets are conventional audio effects. Neural speaker
   conversion is unavailable.
5. Choose how to fit the clip: **Keep my pace** requires the take to fit;
   **Gentle speed-up** allows up to 20% without exceeding 169 estimated WPM;
   **Extend scene** keeps your reading
   speed and holds the scene longer. Set a short lead-in (default 0.25 seconds).
6. **Enhance & preview**, then listen or **Watch with clip**. The clip is muted
   so you hear the new voice alone. A reference from an older render is labelled;
   extension previews hold its last frame. Re-render to inspect the final motion.
7. **Use in video** attaches that processed copy and applies any scene extension.
   Repeat for the other scenes, then **Render video** makes the full music,
   sound-effects and narration mix using the existing scene cache.

Highlighting follows a clock, not your speech. Timing matches the scene window,
not individual visual beats. Review the rendered video if a number or reveal
needs to land on a particular word. Extending a scene holds its default elements;
explicit element `until` times retain their authored timing.

The browser only requests the microphone when you press Record, and releases it
when you stop. Your browser's selected/default microphone is used. These
recording and cleanup controls run on this computer. The bundled denoising model
requires no runtime download, account, GPU, Python or API key. ElevenLabs
generation is a separate explicit API operation.
Original files and take metadata are stored under the video's
`recordings/takes/`; processed WAVs go in its `recordings/enhanced/`.
Back up the recordings alongside the project. Reopening the studio restores takes.
Within Studio, only **Use in video** updates the YAML; recording and previewing
leave it untouched.
If the script or project changes, create a fresh preview before attaching a take.

Technical references: browser recording uses [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
with [supported-format detection](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).
Voice processing uses the standard [FFmpeg audio filters](https://ffmpeg.org/ffmpeg-filters.html).
