import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse } from 'yaml';
import { encodeWav, resolveAudio } from './audio.ts';
import { sceneKey } from './cache.ts';
import { CLI_ENTRY } from './paths.ts';
import { VideoSpec } from './schema.ts';

const raw = (time = 1) => ({ version: 1, video: { id: 'markers' }, scenes: [{
  id: 'example', duration: 3, narration: { text: 'One. Two.', audio: 'take.wav' },
  markers: [{ id: 'phrase', time }], markersAudio: undefined as string | undefined,
  elements: [{ id: 'card', type: 'text', text: 'Two', at: { marker: 'phrase', offset: 0.25 }, sound: { id: 'click', at: 0.2 } }],
}] });

test('named marker edits move card and attached effect; unknown, duplicate and out-of-scene times fail', () => {
  const one = VideoSpec.parse(raw()), two = VideoSpec.parse(raw(1.5));
  assert.equal(one.scenes[0].elements[0].at, 1.25);
  assert.equal(two.scenes[0].elements[0].at + two.scenes[0].elements[0].sound!.at, 1.95);
  const key = (spec: VideoSpec) => sceneKey(spec.scenes[0], spec.video, {}, {}, 'renderer');
  assert.notEqual(key(one), key(two));
  const missing = raw(); missing.scenes[0].markers = [];
  assert.throws(() => VideoSpec.parse(missing), /unknown marker/);
  const duplicate = raw(); duplicate.scenes[0].markers.push({ id: 'phrase', time: 2 });
  assert.throws(() => VideoSpec.parse(duplicate), /duplicate marker/);
  assert.throws(() => VideoSpec.parse(raw(3)), /outside scene/);
  assert.throws(() => VideoSpec.parse(raw(2.9)), /starts at/);
  const negative = raw(); negative.scenes[0].elements[0].at.offset = -2;
  assert.throws(() => VideoSpec.parse(negative), /starts at/);
});

test('inspection exposes resolved arrivals and changed narration bytes require marker review', () => {
  const root = mkdtempSync(join(tmpdir(), 'marker-take-'));
  try {
    const bytes = encodeWav(new Int16Array(48000), 48000);
    writeFileSync(join(root, 'take.wav'), bytes);
    const input = raw();
    assert.deepEqual(resolveAudio(VideoSpec.parse(input), root).markerReviews, ['example']);
    input.scenes[0].markersAudio = createHash('sha256').update(bytes).digest('hex');
    assert.deepEqual(resolveAudio(VideoSpec.parse(input), root).markerReviews, []);
    writeFileSync(join(root, 'video.yaml'), JSON.stringify(input));
    const inspect = () => {
      const result = spawnSync(process.execPath, [CLI_ENTRY, 'inspect', root, '--scene', 'example'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return parse(result.stdout).timing;
    };
    assert.deepEqual(inspect().arrivals, [{ id: 'card', at: 1.25, soundAt: 1.45 }]);
    assert.equal(inspect().review, 'reviewed against this take');
    writeFileSync(join(root, 'take.wav'), encodeWav(new Int16Array(48000).fill(100), 48000));
    assert.deepEqual(resolveAudio(VideoSpec.parse(input), root).markerReviews, ['example']);
    assert.equal(inspect().review, 'needs narration review');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
