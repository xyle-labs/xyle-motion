import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { encodeWav, musicMixFilter, narrationRanges } from './audio.ts';
import { VideoSpec } from './schema.ts';

test('opt-in ducking follows narration, reduces the bed and recovers smoothly through silence', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'motion-duck-'));
  try {
    const rate = 48000;
    const tone = (active: (t: number) => boolean) => encodeWav(Int16Array.from({ length: rate * 4 }, (_, i) =>
      active(i / rate) ? Math.round(4000 * Math.sin(i / rate * 2 * Math.PI * 440)) : 0), rate);
    writeFileSync(join(root, 'voice.wav'), tone(t => (t >= 1 && t < 1.6) || (t >= 2.7 && t < 3.3)));
    writeFileSync(join(root, 'silence.wav'), tone(() => false));
    writeFileSync(join(root, 'music.wav'), tone(() => true));
    const input = { version: 1, video: { id: 'duck', music: { file: 'calm' } }, scenes: [{
      id: 'speech', duration: 4, narration: { text: 'One. Two.', audio: 'voice.wav' },
      elements: [{ id: 'effect', type: 'text', text: 'Effect during pause', at: 2.2, sound: { id: 'click' } }],
    }] };
    const spec = VideoSpec.parse(input);
    assert.equal(spec.video.music!.ducking, false);
    const ranges = narrationRanges(spec, root);
    assert.equal(ranges.length, 2);
    assert.ok(Math.abs(ranges[0][0] - 1) < 0.01 && Math.abs(ranges[0][1] - 1.6) < 0.01);
    const mix = (ranges: [number, number][]) => {
      const result = spawnSync('ffmpeg', ['-v', 'error', '-i', join(root, 'silence.wav'), '-i', join(root, 'music.wav'),
        '-filter_complex', musicMixFilter(0.5, 4, 0, ranges), '-map', '[out]', '-f', 'f32le', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr?.toString());
      return result.stdout;
    };
    const fixed = mix([]), ducked = mix(ranges);
    const rms = (bytes: Buffer, at: number) => {
      let sum = 0;
      for (let i = Math.round(at * rate); i < Math.round((at + 0.02) * rate); i++) sum += bytes.readFloatLE(i * 4) ** 2;
      return Math.sqrt(sum);
    };
    const gain = (at: number) => rms(ducked, at) / rms(fixed, at);
    assert.ok(Math.abs(gain(1.2) - 0.25) < 0.01, 'speech reduces only the music bed by about 12 dB');
    assert.ok(gain(0.94) > 0.25 && gain(0.94) < 1, '80 ms attack ramps into speech');
    assert.ok(gain(1.72) > 0.25 && gain(1.72) < 1, '350 ms release recovers gradually');
    assert.ok(Math.abs(gain(2.2) - 1) < 0.01, 'an effect in a speech pause does not duck music');
    input.scenes[0].narration.audio = 'silence.wav';
    assert.deepEqual(narrationRanges(VideoSpec.parse(input), root), []);
    const absent = VideoSpec.parse({ ...input, scenes: [{ id: 'silent', duration: 4, elements: input.scenes[0].elements }] });
    assert.deepEqual(narrationRanges(absent, root), []);
    assert.equal(musicMixFilter(0.5, 4), musicMixFilter(0.5, 4, 0, []));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('short wholly silent takes leave music unchanged while short speech still ducks', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'motion-short-duck-'));
  try {
    const rate = 48000;
    const spec = VideoSpec.parse({ version: 1, video: { id: 'short-duck' }, scenes: [
      { id: 'before', duration: 2, elements: [] },
      { id: 'take', duration: 12, narration: { text: 'Short take.', audio: 'take.wav' }, elements: [] },
    ] });
    for (const seconds of [0.1, 0.2, 0.249, 0.25, 4804 / rate, 36004 / rate, 480001 / rate]) {
      writeFileSync(join(root, 'take.wav'), encodeWav(new Int16Array(Math.round(rate * seconds)), rate));
      assert.deepEqual(narrationRanges(spec, root), [], `${seconds}s of silence must not duck music`);
    }
    writeFileSync(join(root, 'take.wav'), encodeWav(Int16Array.from({ length: rate / 10 }, (_, i) =>
      Math.round(4000 * Math.sin(i / rate * 2 * Math.PI * 440))), rate));
    assert.deepEqual(narrationRanges(spec, root), [[2, 2.1]]);
    // Older FFmpeg logs this one-sample silence start in scientific notation.
    const transient = new Int16Array(rate + 1);
    transient[0] = 4000;
    writeFileSync(join(root, 'take.wav'), encodeWav(transient, rate));
    const brief = narrationRanges(spec, root);
    assert.equal(brief.length, 1);
    assert.equal(brief[0][0], 2);
    assert.ok(brief[0][1] > 2 && brief[0][1] < 2.001, 'a leading sample must not duck the following silence');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('music ducking mixes long narration timelines without exceeding expression depth', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, () => {
  for (const count of [100, 150, 151]) {
    const ranges: [number, number][] = Array.from({ length: count }, (_, i) => [0.5 + i * 0.03, 0.51 + i * 0.03]);
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-nostdin',
      '-f', 'lavfi', '-i', 'aevalsrc=0.1:s=48000:d=6',
      '-f', 'lavfi', '-i', 'aevalsrc=0.5:s=48000:d=6',
      '-filter_complex', musicMixFilter(0.4, 6, 0, ranges), '-map', '[out]',
      '-f', 'f32le', '-ac', '1', 'pipe:1'], { maxBuffer: 2 * 1024 * 1024 });
    const stderr = result.stderr.toString();
    assert.equal(result.status, 0, stderr);
    assert.doesNotMatch(stderr, /Invalid value|NaN/);
    assert.equal(result.stdout.length, 6 * 48000 * 4);
    assert.ok(Math.abs(result.stdout.readFloatLE(2 * 48000 * 4) - 0.15) < 0.005,
      `${count} ranges must reduce music while preserving narration gain`);
    assert.ok(Math.abs(result.stdout.readFloatLE(5.8 * 48000 * 4) - 0.1267) < 0.005,
      `${count} ranges must recover before the final fade`);
  }
});

test('preview ducking ignores unrelated missing takes while retaining absolute boundary timing', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'motion-preview-duck-'));
  try {
    const rate = 48000;
    const tone = (seconds: number, active: (t: number) => boolean) => encodeWav(Int16Array.from({ length: rate * seconds }, (_, i) =>
      active(i / rate) ? Math.round(4000 * Math.sin(i / rate * 2 * Math.PI * 440)) : 0), rate);
    writeFileSync(join(root, 'prior.wav'), tone(1, t => t >= 0.8));
    writeFileSync(join(root, 'selected.wav'), tone(2, t => t >= 0.8 && t < 1.2));
    writeFileSync(join(root, 'next.wav'), tone(1, t => t < 0.2));
    const spec = VideoSpec.parse({ version: 1, video: { id: 'preview-duck' }, scenes: [
      { id: 'far-before', duration: 3, narration: { text: 'Moved take.', audio: 'missing-before.wav' }, elements: [] },
      { id: 'gap-before', duration: 3, elements: [] },
      { id: 'prior', duration: 1, narration: { text: 'Previous line.', audio: 'prior.wav' }, elements: [] },
      { id: 'selected', duration: 2, narration: { text: 'Selected line.', audio: 'selected.wav' }, elements: [] },
      { id: 'next', duration: 1, narration: { text: 'Next line.', audio: 'next.wav' }, elements: [] },
      { id: 'gap-after', duration: 3, elements: [] },
      { id: 'far-after', duration: 1, narration: { text: 'Moved take.', audio: 'missing-after.wav' }, elements: [] },
    ] });
    const ranges = narrationRanges(spec, root, [7, 9]);
    assert.equal(ranges.length, 3);
    for (const [i, expected] of [[0, [6.8, 7]], [1, [7.8, 8.2]], [2, [9, 9.2]]] as const)
      assert.ok(ranges[i].every((time, j) => Math.abs(time - expected[j]) < 0.001), 'speech must retain full-timeline offsets');
    assert.throws(() => narrationRanges(spec, root), /ENOENT/, 'full render analysis must still validate every take');
    const mixed = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin',
      '-f', 'lavfi', '-i', 'aevalsrc=0:s=48000:d=2',
      '-f', 'lavfi', '-i', 'aevalsrc=0.5:s=48000:d=2',
      '-filter_complex', musicMixFilter(0.4, 14, 7, ranges), '-map', '[out]', '-f', 'f32le', '-ac', '1', 'pipe:1']);
    assert.equal(mixed.status, 0, mixed.stderr.toString());
    const sample = (at: number) => mixed.stdout.readFloatLE(Math.round(at * rate) * 4);
    assert.ok(Math.abs(sample(0) - 0.05) < 0.005, 'previous speech release crosses the preview start');
    assert.ok(Math.abs(sample(0.4) - 0.2) < 0.005, 'music recovers in the selected scene pause');
    assert.ok(Math.abs(sample(1) - 0.05) < 0.005, 'selected speech ducks at its absolute offset');
    assert.ok(sample(1.99) > 0.05 && sample(1.99) < 0.19, 'next speech attack crosses the preview end');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
