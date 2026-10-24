# Recording narration

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
