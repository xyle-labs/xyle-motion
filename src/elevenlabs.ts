import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { importRecording } from './import-recording.ts';
import { VideoSpec } from './schema.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
type Receipt = {
  provider: 'elevenlabs'; voice: string; model: string; format: string;
  requestHash: string; audioHash: string; createdAt: string;
  imported?: { file: string; seconds: number; hash: string };
};

export type NarrationOptions = {
  voice?: string; model?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number;
};

/** One explicit provider request, then the existing local decode/fit/attachment path. */
export async function narrateScene(directory: string, sceneId: string, options: NarrationOptions = {}) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('ELEVENLABS_API_KEY is required for narration. Set it in the process environment.');
  if (/[\r\n]/.test(key)) throw new Error('ELEVENLABS_API_KEY is invalid.');
  const voice = options.voice ?? process.env.ELEVENLABS_VOICE_ID;
  const model = options.model ?? 'eleven_v4';
  if (!voice || !/^[A-Za-z0-9_-]{1,128}$/.test(voice)) throw new Error('Choose an ElevenLabs voice with --voice or ELEVENLABS_VOICE_ID.');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(model)) throw new Error('Choose a valid ElevenLabs model ID.');
  const readScene = () => {
    const spec = VideoSpec.parse(parse(readFileSync(join(directory, 'video.yaml'), 'utf8')));
    const scene = spec.scenes.find(scene => scene.id === sceneId);
    if (!scene?.narration?.text.trim()) throw new Error('Choose a scene with narration.text first.');
    return scene;
  };
  const originalScene = readScene();
  const text = originalScene.narration!.text;
  const format = 'mp3_44100_128';
  const requestHash = hash(JSON.stringify({ voice, model, text, format }));
  const cache = join(directory, 'recordings', 'elevenlabs', requestHash);
  const original = join(cache, 'original.mp3');
  const receiptPath = join(cache, 'receipt.json');
  const pending = join(cache, 'pending.json');
  const saveReceipt = (receipt: Receipt) => {
    writeFileSync(`${receiptPath}.tmp`, JSON.stringify(receipt, null, 2) + '\n');
    renameSync(`${receiptPath}.tmp`, receiptPath);
  };
  let receipt: Receipt;
  const reused = existsSync(receiptPath);
  if (reused) {
    try {
      receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      if (receipt.provider !== 'elevenlabs' || receipt.voice !== voice || receipt.model !== model || receipt.format !== format ||
          receipt.requestHash !== requestHash || receipt.audioHash !== hash(readFileSync(original))) throw new Error();
    } catch { throw new Error('Cached ElevenLabs audio could not be verified. Inspect the saved output before requesting again.'); }
  } else {
    if (existsSync(original)) throw new Error('An unverified ElevenLabs original is already saved. Inspect it before requesting again.');
    mkdirSync(cache, { recursive: true });
    try { writeFileSync(pending, JSON.stringify({ requestHash, startedAt: new Date().toISOString() }) + '\n', { flag: 'wx' }); }
    catch { throw new Error(`An earlier ElevenLabs request has no verified result. Check provider history before removing ${relative(directory, pending)} to retry; no new request was sent.`); }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
    let failure = 'ElevenLabs request failed or timed out; billing status is unknown.';
    let bytes: Buffer;
    try {
      const response = await (options.fetch ?? globalThis.fetch)(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${format}`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: model }),
        });
      if (!response.ok) {
        failure = `ElevenLabs returned HTTP ${response.status}. No provider response body is logged.`;
        await response.body?.cancel();
        throw new Error();
      }
      failure = 'ElevenLabs did not return a supported audio response.';
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('audio/mpeg') || !response.body) throw new Error();
      failure = 'ElevenLabs audio exceeded the 20 MiB response limit.';
      if (Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES) {
        await response.body.cancel();
        throw new Error();
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        failure = 'ElevenLabs audio download failed or timed out; billing status is unknown.';
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_AUDIO_BYTES) {
          failure = 'ElevenLabs audio exceeded the 20 MiB response limit.';
          await reader.cancel();
          throw new Error();
        }
        chunks.push(value);
      }
      bytes = Buffer.concat(chunks);
      if (!bytes.length) { failure = 'ElevenLabs returned empty audio.'; throw new Error(); }
    } catch {
      throw new Error(`${failure} Check provider history before retrying; the pending marker prevents another charge.`);
    } finally { clearTimeout(timeout); controller.abort(); }
    // Keep the original and its verification receipt even when it cannot yet fit.
    writeFileSync(original, bytes, { flag: 'wx' });
    receipt = { provider: 'elevenlabs', voice, model, format, requestHash, audioHash: hash(bytes), createdAt: new Date().toISOString() };
    saveReceipt(receipt);
    rmSync(pending);
  }
  const scene = readScene();
  if (scene.narration!.text !== text)
    throw new Error('Script changed during generation. Original ElevenLabs audio saved; YAML unchanged.');
  if (scene.narration!.audio !== originalScene.narration!.audio)
    throw new Error('Selected narration changed during generation. Original ElevenLabs audio saved; YAML unchanged.');
  const imported = receipt.imported;
  if (imported && !isAbsolute(imported.file) && !relative(resolve(directory), resolve(directory, imported.file)).startsWith('..') &&
      scene.narration!.audio === imported.file && Number.isFinite(imported.seconds) && imported.seconds > 0 && imported.seconds <= scene.duration + 0.05) {
    try {
      if (hash(readFileSync(join(directory, imported.file))) === imported.hash)
        return { file: imported.file, seconds: imported.seconds, reused, original: relative(directory, original) };
    } catch { /* Re-import the verified original when a decoded copy has gone missing. */ }
  }
  let result: ReturnType<typeof importRecording>;
  try { result = importRecording(directory, sceneId, original); }
  catch {
    // Decoder diagnostics can include provider metadata; never expose those bodies.
    throw new Error('ElevenLabs audio could not be decoded or does not fit this scene. Original MP3 saved; YAML unchanged. Check FFmpeg and the scene duration.');
  }
  receipt.imported = { ...result, hash: hash(readFileSync(join(directory, result.file))) };
  saveReceipt(receipt);
  return { ...result, reused, original: relative(directory, original) };
}
