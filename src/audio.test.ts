import assert from 'node:assert/strict';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { VideoSpec } from './schema.ts';
import { scanSounds, wavSeconds, encodeWav, resolveAudio } from './audio.ts';

/** A WAV whose fmt/data are pushed off their usual offsets by a padding chunk,
 *  as some recorders write them. This is the case that broke the first
 *  parser: it read byteRate from byte 28 and never found `data`. */
function awkwardWav(seconds: number, rate = 22050): Buffer {
  const bytes = Math.round(seconds * rate * 2);
  const junk = Buffer.alloc(8 + 28);
  junk.write('JUNK', 0);
  junk.writeUInt32LE(28, 4);
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0);
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE(rate * 2, 16); // byteRate
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const data = Buffer.alloc(8 + bytes);
  data.write('data', 0);
  data.writeUInt32LE(bytes, 4);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0);
  riff.writeUInt32LE(4 + junk.length + fmt.length + data.length, 4);
  riff.write('WAVE', 8);
  return Buffer.concat([riff, junk, fmt, data]);
}

test('duration survives padding chunks before fmt and data', () => {
  assert.equal(wavSeconds(awkwardWav(3)), 3);
  assert.equal(wavSeconds(awkwardWav(0.25)), 0.25);
});

test('non-WAV input is reported as unknown, not guessed', () => {
  assert.equal(wavSeconds(Buffer.from('not audio at all')), undefined);
  assert.equal(wavSeconds(Buffer.alloc(4)), undefined);
});

test('the synthesised library is real WAV of the length it claims', () => {
  const sounds = scanSounds();
  assert.ok(sounds.has('click') && sounds.has('chime'));
  assert.ok(Math.abs(wavSeconds(readFileSync(sounds.get('chime')!))! - 1.1) < 0.01);
  assert.equal(wavSeconds(readFileSync('library/music/daybreak.wav')), 32);
});

test('scripts stay silent and never discover legacy generated narration', () => {
  const spec = VideoSpec.parse({ version: 1, video: { id: 'test' }, scenes: [
    { id: 'hook', duration: 2, narration: { text: 'You flip a switch. The light comes on.' }, elements: [] },
  ] });
  const result = resolveAudio(spec, 'ph-electricity-price');
  assert.deepEqual(result.audio, {});
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unrecorded, ['hook']);
  assert.equal(VideoSpec.safeParse({ ...spec, scenes: [{ ...spec.scenes[0], narration: { text: 'Hello', voice: 'Daniel' } }] }).success, false);
});

test('recorded takes must exist, be valid WAV, and fit the scene', () => {
  const directory = mkdtempSync(join(tmpdir(), '_audio-test-'));
  const project = basename(directory);
  try {
    const spec = VideoSpec.parse({ version: 1, video: { id: project }, scenes: [
      { id: 'line', duration: 1, narration: { text: 'Hello', audio: 'take.wav' }, elements: [] },
    ] });
    assert.match(resolveAudio(spec, directory).errors[0], /no recorded narration/);
    writeFileSync(join(directory, 'take.wav'), 'not audio');
    assert.match(resolveAudio(spec, directory).errors[0], /valid PCM WAV/);
    writeFileSync(join(directory, 'take.wav'), encodeWav(new Int16Array(96000), 48000));
    assert.match(resolveAudio(spec, directory).errors[0], /narration is 2.00s/);
    writeFileSync(join(directory, 'take.wav'), encodeWav(new Int16Array(24000), 48000));
    const result = resolveAudio(spec, directory);
    assert.deepEqual(result.errors, []);
    assert.match(result.audio['narration:line'], /^data:audio\/wav;base64,/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('truncated PCM is rejected instead of getting a plausible duration', () => {
  const wav = encodeWav(new Int16Array(48000), 48000);
  assert.equal(wavSeconds(wav.subarray(0, 100)), undefined);
});

test('enhance CLI attaches a separate cleaned take, caches it, and preserves the original', {
  skip: spawnSync('ffmpeg', ['-version']).status !== 0 ? 'full FFmpeg required for recording cleanup' : false,
}, () => {
  const directory = mkdtempSync(join(tmpdir(), '_recording-test-'));
  const project = basename(directory);
  try {
    const input = join(directory, 'original.wav');
    const original = encodeWav(Int16Array.from({ length: 48000 }, (_, i) =>
      Math.round(1800 * Math.sin(2 * Math.PI * 440 * i / 48000) + 500 * Math.sin(2 * Math.PI * 30 * i / 48000))), 48000);
    writeFileSync(input, original);
    const source = '# Keep this comment\nversion: 1\nvideo: { id: recording-test }\nscenes:\n  - id: line\n    duration: 2\n    narration: { text: Hello }\n    elements: []\n';
    writeFileSync(join(directory, 'video.yaml'), source);
    const run = () => spawnSync(process.execPath, ['bin/explainer.ts', 'enhance', directory, '--scene', 'line', '--input', input], { encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const yaml = readFileSync(join(directory, 'video.yaml'), 'utf8');
    assert.ok(yaml.startsWith('# Keep this comment'));
    const spec = VideoSpec.parse(parse(yaml));
    const output = join(directory, spec.scenes[0].narration!.audio!);
    assert.notEqual(output, input);
    assert.deepEqual(readFileSync(input), original);
    assert.ok(Math.abs(wavSeconds(output)! - 1) < 0.01);
    assert.notDeepEqual(readFileSync(output), original);
    const modified = statSync(output).mtimeMs;
    assert.equal(run().status, 0);
    assert.equal(statSync(output).mtimeMs, modified);
    assert.deepEqual(resolveAudio(spec, directory).errors, []);
    // An overlong take must not alter YAML or the original recording.
    writeFileSync(join(directory, 'video.yaml'), source.replace('duration: 2', 'duration: 0.5'));
    assert.equal(run().status, 1);
    assert.equal(readFileSync(join(directory, 'video.yaml'), 'utf8'), source.replace('duration: 2', 'duration: 0.5'));
    assert.deepEqual(readFileSync(input), original);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
