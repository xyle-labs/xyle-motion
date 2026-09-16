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
