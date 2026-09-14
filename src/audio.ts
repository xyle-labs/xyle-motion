// Recorded voice only. Scripts never trigger speech generation.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { VideoSpec } from './schema.ts';

import { PACKAGE_ROOT } from './paths.ts';
export const SOUNDS = join(PACKAGE_ROOT, 'library/sounds');

export const scanSounds = (root = SOUNDS): Map<string, string> =>
  existsSync(root)
    ? new Map(
        readdirSync(root)
          .filter((f) => f.endsWith('.wav'))
          .sort()
          .map((f) => [f.replace(/\.wav$/, ''), join(root, f)] as [string, string]),
      )
    : new Map();

const dataUri = (buffer: Buffer) => `data:audio/wav;base64,${buffer.toString('base64')}`;

/** Seconds, straight from the PCM WAV header — no subprocess, exact.
 *  Returns undefined for anything that is not a plain WAV.
 *
 *  Walks the RIFF chunk list rather than assuming `fmt ` sits at byte 12 and
 *  `data` at 36: recorders can write JUNK and FLLR padding chunks first, which
 *  pushes the real data well past any fixed offset. */
export function wavSeconds(input: Buffer | string): number | undefined {
  const buffer = typeof input === 'string' ? readFileSync(input) : input;
  if (buffer.length < 12) return undefined;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE')
    return undefined;

  let byteRate = 0;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > buffer.length) return undefined;
    if (id === 'fmt ') {
      if (size < 16 || buffer.readUInt16LE(body) !== 1) return undefined;
      byteRate = buffer.readUInt32LE(body + 8);
    }
    if (id === 'data') return byteRate ? size / byteRate : undefined;
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  return undefined;
}

export function encodeWav(samples: Int16Array, rate: number, channels = 1): Buffer {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2 * channels, 28);
  header.writeUInt16LE(2 * channels, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Inline every sound and narration line the spec references, and report what
 *  is wrong with the references. Audio travels as data URIs for the same reason
 *  the SVGs do: the renderer stays a pure function of its props. */
export function resolveAudio(spec: VideoSpec, project: string) {
  const library = scanSounds();
  const audio: Record<string, string> = {};
  const errors: string[] = [];
  const unrecorded: string[] = [];

  for (const scene of spec.scenes) {
    for (const element of scene.elements) {
      if (!element.sound) continue;
      const path = library.get(element.sound.id);
      if (!path) {
        errors.push(
          `element "${element.id}" in scene "${scene.id}": unknown sound "${element.sound.id}"` +
            `; available: ${[...library.keys()].join(', ') || 'none'}`,
        );
        continue;
      }
      const key = `sound:${element.sound.id}`;
      if (!audio[key]) audio[key] = dataUri(readFileSync(path));
    }

    const narration = scene.narration;
    if (!narration) continue;
    if (!narration.audio) {
      unrecorded.push(scene.id);
      continue; // A script without a take is deliberately silent.
    }
    const path = join(project, narration.audio);
    if (!existsSync(path)) {
      errors.push(`scene "${scene.id}": no recorded narration at ${path}`);
      continue;
    }
    const spoken = readFileSync(path);
    const seconds = wavSeconds(spoken);
    if (seconds === undefined || seconds <= 0) {
      errors.push(`scene "${scene.id}": narration must be a valid PCM WAV; use explainer enhance`);
      continue;
    }
    audio[`narration:${scene.id}`] = dataUri(spoken);
    if (seconds !== undefined && seconds > scene.duration + 0.05)
      errors.push(
        `scene "${scene.id}" runs ${scene.duration}s but its narration is ` +
          `${seconds.toFixed(2)}s; lengthen the scene or shorten the line`,
      );
  }

  return { audio, errors, unrecorded };
}

/** Gentle rumble/hiss reduction and level control; no generated speech or
 * pitch/time changes. Originals are untouched; processed copies are cached. */
export const VOICE_CLEANUP = 'highpass=f=70,afftdn=nr=6:nf=-40,acompressor=threshold=0.125:ratio=2:attack=20:release=200:makeup=1';

export const LOCAL_SPEAKERS = ['own', 'en-default', 'en-us', 'en-br', 'en-au', 'en-india', 'en-newest'] as const;
export type LocalSpeaker = typeof LOCAL_SPEAKERS[number];
export type NoiseMode = 'gentle' | 'isolate' | 'lavasr';

export function neuralVoiceAvailable(): boolean {
  // ponytail: optional model-cache portability is the next milestone.
  return false;
}

function neuralRecording(input: string, directory: string, noise: NoiseMode, speaker: LocalSpeaker): string {
  if (!neuralVoiceAvailable()) throw new Error('Neural voice conversion is not available in this development package yet; use local gentle cleanup.');
  const fingerprint = createHash('sha256').update(readFileSync(input))
    .update(readFileSync('scripts/neural-voice.py')).update(readFileSync('studio/neural-models.json'))
    .update(readFileSync('scripts/neural-requirements.txt')).update(`${noise}:${speaker}`).digest('hex').slice(0, 16);
  const output = join(directory, `neural-${fingerprint}.wav`);
  if (existsSync(output) && wavSeconds(output)) return output;
  mkdirSync(directory, { recursive: true });
  const run = spawnSync('.local-voice/venv/bin/python', [
    'scripts/neural-voice.py', '--input', input, '--output', output,
    '--cleanup', noise === 'lavasr' ? 'lavasr' : 'none', '--speaker', speaker,
  ], { encoding: 'utf8', timeout: 180_000, env: { ...process.env, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', TRANSFORMERS_OFFLINE: '1' } });
  if (run.error || run.status !== 0) throw new Error(`Local neural processing failed: ${run.error?.message ?? run.stderr.slice(-1800)}`);
  const seconds = wavSeconds(output);
  if (!seconds || Math.abs(seconds - wavSeconds(input)!) > 0.1) throw new Error('Neural output failed the duration check. Original take preserved.');
  return output;
}

export function enhanceRecording(input: string, directory: string, edits = '', noise: NoiseMode = 'gentle', speaker: LocalSpeaker = 'own'): string {
  input = resolve(input);
  directory = resolve(directory);
  if (!LOCAL_SPEAKERS.includes(speaker)) throw new Error('Unknown local target voice');
  const neural = noise === 'lavasr' || speaker !== 'own';
  if (neural) {
    const clean = noise === 'lavasr' ? input : enhanceRecording(input, directory, '', noise);
    input = neuralRecording(clean, directory, noise, speaker);
  }
  const model = join(PACKAGE_ROOT, 'library/audio-models/cb.rnnn');
  if (noise === 'isolate' && !existsSync(model)) throw new Error('Local noise model missing: library/audio-models/cb.rnnn');
  // Run speech denoising on the original voice before changing pitch/formants.
  const isolation = noise === 'isolate' && !neural ? 'aresample=48000,arnndn=m=cb.rnnn:mix=1' : '';
  const cleanup = noise === 'isolate' || neural ? VOICE_CLEANUP.replace('afftdn=nr=6:nf=-40,', '') : VOICE_CLEANUP;
  const filters = [isolation, edits, cleanup, 'loudnorm=I=-16:TP=-2:LRA=11'].filter(Boolean).join(',');
  const fingerprint = createHash('sha256').update(readFileSync(input)).update(filters + ':48000:mono:pcm_s16le');
  if (noise === 'isolate') fingerprint.update(readFileSync(model));
  const key = fingerprint.digest('hex').slice(0, 16);
  const out = join(directory, `recorded-${key}.wav`);
  if (existsSync(out)) return out;
  mkdirSync(dirname(out), { recursive: true });
  const temporary = `${out}.${process.pid}.tmp.wav`;
  try {
    // Remotion's reduced FFmpeg lacks the cleanup filters; use full FFmpeg.
    const run = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', input,
      '-vn', '-af', filters, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', temporary,
    ], { encoding: 'utf8', timeout: 120_000, cwd: noise === 'isolate' ? dirname(model) : undefined });
    if (run.error) throw new Error(`Voice cleanup needs full ffmpeg on PATH: ${run.error.message}`);
    if (run.status !== 0) throw new Error(`Voice cleanup failed: ${run.stderr.trim()}`);
    if (!wavSeconds(temporary)) throw new Error('Voice cleanup produced no usable audio');
    renameSync(temporary, out);
    return out;
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function musicPath(file: string, project: string) {
  return file.includes('/')
    ? join(project, file)
    : join(PACKAGE_ROOT, 'library', 'music', `${file.replace(/\.wav$/, '')}.wav`);
}

/** Same bed envelope for the final export and a scene preview at its timeline offset. */
export function musicMixFilter(volume: number, duration: number, offset = 0): string {
  const t = `(t+${offset})`;
  const fade = Math.min(1.5, duration);
  return `[1:a]volume='${volume}*min(1,${t}/0.6)*max(0,min(1,(${duration}-${t})/${fade}))':eval=frame[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0[out]`;
}
