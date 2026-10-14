# Xyle Recorder

Xyle Recorder is the general iPhone companion to Xyle Motion Voice Studio.
Xyle Motion owns the recording workflow and Studio integration. Its installed
CLI runs the local Studio; the agent skill guides its use. The native app
ships separately from the npm package and contains no fixed lesson content.
Its source currently lives in the independent
[recorder target](https://github.com/Jesse-jApps/waraywaray-ios/tree/main/VoiceRecorder)
in the iOS repository.

One phone pairing serves all recording projects in the configured Studio.
Studio sends any project script, language and separate speaking instructions.
The person works through **Record → Listen → Redo or Submit**. Only explicit
submission transfers a take, and only server acknowledgement removes its task.
A completed queue waits for new requests. Originals remain available locally.

WarayWaray is the first backend operator. Its existing Django deployment hosts
pairing, scoped credentials, task state and private audio storage. The phone
can submit anywhere with internet, including while the Mac is offline. Studio
imports that video's takes when next opened; other projects remain queued.
The API host is configured in private credentials,
so a different compatible deployment can be used without changing the tool.

The authoritative [API and deployment contract](https://github.com/Jesse-jApps/waraywaray.com/blob/main/docs/mobile/voice-recorder.md)
lives with that backend. Do not duplicate endpoint specifications in the
package or app. Pairing and Studio usage are in the
[Voice Studio guide](../studio/README.md).

Normal closed-app iPhone notifications require an Apple push-enabled native
build and APNs configuration. Without it, new tasks refresh while the app is
open. Imported takes stay unreviewed and are never automatically applied to a
video or published.
