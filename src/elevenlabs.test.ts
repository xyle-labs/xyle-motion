import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { narrateScene, type NarrationOptions } from './elevenlabs.ts';
import { CLI_ENTRY } from './paths.ts';

const secret = 'synthetic-elevenlabs-test-credential';
const source = '# approved script\nversion: 1\nvideo: { id: example }\nscenes:\n  - id: line\n    duration: 2\n    narration: { text: Hello, volume: 0.6 }\n    elements: []\n';
const ffmpeg = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-f', 'mp3', 'pipe:1']);
const audio = ffmpeg.stdout;
const audioTest = { skip: ffmpeg.status !== 0 ? 'Full FFmpeg is required for narration import' : false };
const response = () => new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
const mock = (fn: (url: string, init: RequestInit) => Promise<Response>) => fn as typeof fetch;

async function fixture(work: (directory: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'motion-elevenlabs-'));
  const oldKey = process.env.ELEVENLABS_API_KEY, oldVoice = process.env.ELEVENLABS_VOICE_ID;
  process.env.ELEVENLABS_API_KEY = secret;
  delete process.env.ELEVENLABS_VOICE_ID;
  writeFileSync(join(directory, 'video.yaml'), source);
  try { await work(directory); }
  finally {
    if (oldKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = oldKey;
    if (oldVoice === undefined) delete process.env.ELEVENLABS_VOICE_ID; else process.env.ELEVENLABS_VOICE_ID = oldVoice;
    rmSync(directory, { recursive: true, force: true });
  }
}

test('ElevenLabs configuration gates requests and writes; CLI provides the command without a key option', async () => {
  await fixture(async directory => {
    const options = { voice: 'voice', fetch: mock(async () => { throw new Error('Must not send'); }) };
    delete process.env.ELEVENLABS_API_KEY;
    await assert.rejects(narrateScene(directory, 'line', options), /ELEVENLABS_API_KEY is required/);
    process.env.ELEVENLABS_API_KEY = secret;
    await assert.rejects(narrateScene(directory, 'line', { ...options, voice: undefined }), /Choose an ElevenLabs voice/);
    await assert.rejects(narrateScene(directory, 'line', { ...options, model: '../model' }), /valid ElevenLabs model/);
    await assert.rejects(narrateScene(directory, 'missing', options), /scene with narration.text/);
    assert.deepEqual(readdirSync(directory), ['video.yaml']);
    const result = spawnSync(process.execPath, [CLI_ENTRY, 'narrate', directory, '--scene', 'line', '--voice', 'voice'],
      { encoding: 'utf8', env: { ...process.env, ELEVENLABS_API_KEY: '' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ELEVENLABS_API_KEY is required/);
    const help = spawnSync(process.execPath, [CLI_ENTRY, '--help'], { encoding: 'utf8' });
    assert.match(help.stdout, /narrate.*--voice voiceId.*--model modelId/);
    assert.doesNotMatch(help.stdout, /--api-key/);
    assert.deepEqual(readdirSync(directory), ['video.yaml']);
  });
});

test('ElevenLabs uses the official request, preserves original bytes/comments and verifies cached audio', audioTest, async () => {
  await fixture(async directory => {
    let requests = 0;
    process.env.ELEVENLABS_VOICE_ID = 'configured-voice';
    const options: NarrationOptions = { fetch: mock(async (url, init) => {
      requests++;
      assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/configured-voice?output_format=mp3_44100_128');
      assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
      assert.deepEqual(init.headers, { 'xi-api-key': secret, 'content-type': 'application/json', accept: 'audio/mpeg' });
      assert.deepEqual(JSON.parse(init.body as string), { text: 'Hello', model_id: 'eleven_v4' });
      return response();
    }) };
    const result = await narrateScene(directory, 'line', options);
    assert.equal(result.reused, false); assert.ok(result.seconds > 0 && result.seconds < 0.5);
    assert.deepEqual(readFileSync(join(directory, result.original)), audio);
    assert.match(readFileSync(join(directory, 'video.yaml'), 'utf8'), /# approved script/);
    assert.equal(parse(readFileSync(join(directory, 'video.yaml'), 'utf8')).scenes[0].narration.audio, result.file);
    const receipt = readFileSync(join(directory, dirname(result.original), 'receipt.json'), 'utf8');
    assert.doesNotMatch(receipt, /synthetic-elevenlabs-test-credential|Hello|xi-api-key/);
    assert.deepEqual(Object.fromEntries(['provider', 'voice', 'model', 'format'].map(key => [key, JSON.parse(receipt)[key]])),
      { provider: 'elevenlabs', voice: 'configured-voice', model: 'eleven_v4', format: 'mp3_44100_128' });
    const attached = readFileSync(join(directory, 'video.yaml'), 'utf8');
    const again = await narrateScene(directory, 'line', options);
    assert.equal(again.reused, true); assert.equal(again.file, result.file); assert.equal(requests, 1);
    assert.equal(readFileSync(join(directory, 'video.yaml'), 'utf8'), attached);
    writeFileSync(join(directory, result.original), 'tampered');
    await assert.rejects(narrateScene(directory, 'line', options), /could not be verified/);
    assert.equal(requests, 1);
  });
});

test('an explicit model/voice changes the request and cache identity', audioTest, async () => {
  await fixture(async directory => {
    let requests = 0;
    const fetch = mock(async (url, init) => {
      requests++; assert.match(url, /explicit-voice\?/);
      assert.equal(JSON.parse(init.body as string).model_id, requests === 1 ? 'eleven_v4' : 'eleven_multilingual_v2');
      return response();
    });
    const first = await narrateScene(directory, 'line', { voice: 'explicit-voice', fetch });
    const second = await narrateScene(directory, 'line', { voice: 'explicit-voice', model: 'eleven_multilingual_v2', fetch });
    assert.notEqual(first.original, second.original); assert.equal(requests, 2);
  });
});

test('provider failures never expose bodies or exception secrets and do not send a blind retry', async () => {
  for (const fetch of [
    mock(async () => { throw new Error(secret); }),
    mock(async () => new Response(secret, { status: 401 })),
    mock(async () => new Response(secret, { headers: { 'content-type': 'application/json' } })),
    mock(async () => new Response(audio, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(21 * 1024 * 1024) } })),
  ]) await fixture(async directory => {
    let requests = 0;
    const options = { voice: 'voice', fetch: mock(async (...args) => { requests++; return fetch(...args); }) };
    await assert.rejects(narrateScene(directory, 'line', options), error => {
      assert.doesNotMatch((error as Error).message, /synthetic-elevenlabs-test-credential/);
      return /Check provider history/.test((error as Error).message);
    });
    await assert.rejects(narrateScene(directory, 'line', options), /no verified result/);
    assert.equal(requests, 1);
    assert.equal(readFileSync(join(directory, 'video.yaml'), 'utf8'), source);
    const cache = join(directory, 'recordings', 'elevenlabs');
    const saved = readdirSync(join(cache, readdirSync(cache)[0]));
    assert.deepEqual(saved, ['pending.json']);
  });
});

test('timeout and concurrent invocations preserve the pending guard', async () => {
  await fixture(async directory => {
    let requests = 0;
    const options = { voice: 'voice', timeoutMs: 20, fetch: mock(async (_url, init) => {
      requests++;
      await assert.rejects(narrateScene(directory, 'line', options), /no verified result/);
      return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error(secret)), { once: true }));
    }) };
    await assert.rejects(narrateScene(directory, 'line', options), /failed or timed out/);
    await assert.rejects(narrateScene(directory, 'line', options), /no verified result/);
    assert.equal(requests, 1);
  });
});

test('download limit applies to streamed bytes even without content-length', async () => {
  await fixture(async directory => {
    const options = { voice: 'voice', fetch: mock(async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(20 * 1024 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close();
    } }), { headers: { 'content-type': 'audio/mpeg' } })) };
    await assert.rejects(narrateScene(directory, 'line', options), /20 MiB/);
    assert.equal(readFileSync(join(directory, 'video.yaml'), 'utf8'), source);
  });
});

test('orphan provider output cannot cause another paid request and decoder failures are private', audioTest, async () => {
  await fixture(async directory => {
    const fetch = mock(async () => new Response(secret, { headers: { 'content-type': 'audio/mpeg' } }));
    await assert.rejects(narrateScene(directory, 'line', { voice: 'voice', fetch }), error => {
      assert.doesNotMatch((error as Error).message, /synthetic-elevenlabs-test-credential/);
      return /YAML unchanged/.test((error as Error).message);
    });
    const cache = join(directory, 'recordings', 'elevenlabs');
    const receipt = join(cache, readdirSync(cache)[0], 'receipt.json');
    rmSync(receipt);
    await assert.rejects(narrateScene(directory, 'line', { voice: 'voice', fetch: mock(async () => {
      throw new Error('Must not send another request');
    }) }), /unverified ElevenLabs original/);
    assert.equal(readFileSync(join(directory, 'video.yaml'), 'utf8'), source);
  });
});

test('overlong and changed-script results preserve YAML and reuse paid output after a duration fix', audioTest, async () => {
  await fixture(async directory => {
    const path = join(directory, 'video.yaml');
    const short = source.replace('duration: 2', 'duration: 0.01'); writeFileSync(path, short);
    let requests = 0;
    const options = { voice: 'voice', fetch: mock(async () => { requests++; return response(); }) };
    await assert.rejects(narrateScene(directory, 'line', options), /YAML unchanged/);
    assert.equal(readFileSync(path, 'utf8'), short);
    writeFileSync(path, source);
    assert.equal((await narrateScene(directory, 'line', options)).reused, true);
    assert.equal(requests, 1);
  });
  await fixture(async directory => {
    const changed = source.replace('text: Hello', 'text: Updated script');
    await assert.rejects(narrateScene(directory, 'line', { voice: 'voice', fetch: mock(async () => {
      writeFileSync(join(directory, 'video.yaml'), changed); return response();
    }) }), /Script changed/);
    assert.equal(readFileSync(join(directory, 'video.yaml'), 'utf8'), changed);
    const cache = join(directory, 'recordings', 'elevenlabs');
    assert.ok(existsSync(join(cache, readdirSync(cache)[0], 'original.mp3')));
    assert.ok(existsSync(join(cache, readdirSync(cache)[0], 'receipt.json')));
  });
  await fixture(async directory => {
    const changed = source.replace('text: Hello', 'text: Hello, audio: recordings/selected.wav');
    await assert.rejects(narrateScene(directory, 'line', { voice: 'voice', fetch: mock(async () => {
      writeFileSync(join(directory, 'video.yaml'), changed); return response();
    }) }), /Selected narration changed/);
    assert.equal(readFileSync(join(directory, 'video.yaml'), 'utf8'), changed);
  });
});
