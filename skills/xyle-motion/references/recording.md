# Narration

## Generated production narration

Use ElevenLabs for generated speech, with the approved script already in the
scene's `narration.text`:

```sh
npm exec -- explainer narrate videos/first-video --scene intro --voice voiceId
```

Require `ELEVENLABS_API_KEY` in the process environment using the existing secret
setup, with text-to-speech permission. Model listing permission is not required
for `narrate`. A voice is required through `--voice` or `ELEVENLABS_VOICE_ID`.
The key is required even when `narrate` can reuse a cached output.
`--model modelId` overrides `eleven_v4`, the default from the
[official quickstart](https://elevenlabs.io/docs/eleven-api/quickstart/).
Missing credentials or voice must fail before a network request. Do not put
keys into project files, YAML, command arguments, logs or generation receipts.

Explicit generation sends the approved scene text to the official ElevenLabs
HTTPS API and can consume account credits. The original MP3 and `receipt.json`
stay under `recordings/elevenlabs/<request-hash>/` in the video. The receipt
records generation identity and output checksums without the key or script.
Fitting speech attaches through the existing import path as a decoded WAV under
`recordings/imports/`. Overlong speech or a changed script leaves YAML and scene
timing unchanged; the preserved output remains available for review and reuse.

The same script, voice and model reuse the receipt-verified original instead of
making a new request. An ambiguous failure leaves `pending.json` in the request
folder and blocks another identical API call. Check provider history and recover
any completed output before clearing that marker. Never blindly retry or
substitute local synthetic speech. Listen to the generated take and review
synchronization and the complete music mix before delivery. Existing music and
effects stay in use.

## Human recordings

Existing human takes, recording, import, cleanup, inspection, validation and
rendering work offline without an ElevenLabs key.

Start Voice Studio from the consuming project with an explicit video directory:

```sh
npm exec -- explainer record videos/first-video
```

Open the printed local address and keep the command running. Use `--port 4319`
if the default port is occupied. Full FFmpeg must be on PATH for recording
import and cleanup. Browser recording, processing and playback stay local.

Choose a scene, rehearse its approved script, then record or import a take.
Listen to the original before trimming or using gentle/RNNoise cleanup.
**Enhance & preview** creates a processed copy; **Watch with clip** lets you
review it against the scene. Only **Use in video** attaches it to `video.yaml`.
Back up the video's `recordings/` folder, including original takes. Review the
complete render to assess narration with music and effects.

## Optional iPhone companion

Xyle Recorder is a separately installed iPhone app. It exchanges approved
scripts, speaking instructions and submitted takes through a private hosted
API. WarayWaray operates the first compatible backend. This skill does not
provision credentials, deploy the API or send tasks without user authorization.

When the user has authorized that workflow and supplied an existing private
credentials file, start Studio with it:

```sh
XYLE_RECORDER_CONFIG=/path/to/private-credentials.json npm exec -- explainer record videos/first-video
```

The file contains `api_url` (HTTPS), `project` (Studio identity) and `token`.
Keep it outside public source control. In Studio's **iPhone Recorder** section,
pair the phone once using the displayed API address and temporary pairing code.
Choose the paired phone and scene, provide the language and separate speaking
instructions, then send the approved script.

The person records, listens, redoes or explicitly submits each take. The phone
can submit while the Mac is offline. Studio imports checksum-verified originals
for the current video when next opened; other videos' takes remain queued.
Imports stay unreviewed and do not update `video.yaml`. Listen and explicitly
select a take before using it. Takes whose scene or script no longer matches
remain available in the iPhone inbox.

Closed-app notifications require a push-enabled native build and APNs setup.
Without push, requests appear when the app refreshes. The operator owns the
[backend and deployment contract](https://github.com/Jesse-jApps/waraywaray.com/blob/main/docs/mobile/voice-recorder.md).
