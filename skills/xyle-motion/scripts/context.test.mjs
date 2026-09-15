import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

test('context summarizes current timing and audio, isolates a scene, and never edits the project', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'explainer-context-'));
  try {
    mkdirSync(join(cwd, 'videos', 'demo'), { recursive: true });
    const path = join(cwd, 'videos', 'demo', 'video.yaml');
    const source = `video: { id: demo, music: { file: calm } }
scenes:
  - id: opening
    duration: 4.7
    elements: []
  - id: claim
    duration: 6
    narration: { text: Hello }
    elements:
      - { id: a, asset: people.person, sound: { id: pop } }
      - { id: b, asset: people.person }
      - { id: c, type: asset, file: 'artwork/local picture.png' }
      - { id: d, type: asset, file: 'artwork/local picture.png' }
  - id: end
    duration: 2
    narration: { text: Goodbye, audio: take.wav }
    elements: []
`;
    writeFileSync(path, source);
    const run = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('./context.mjs', import.meta.url)), ...args], { cwd, encoding: 'utf8' });
    const summary = run('videos/demo');
    assert.equal(summary.status, 0, summary.stderr);
    const result = parse(summary.stdout);
    assert.equal(result.totalSeconds, 12.7);
    assert.equal(result.scenes[1].start, 4.7);
    assert.equal(result.scenes[1].narration, 'unrecorded (silent)');
    assert.equal(result.scenes[2].narration, 'attached (not verified)');
    assert.deepEqual(result.scenes[1].assets, ['people.person', 'file:artwork/local picture.png']);
    assert.deepEqual(result.scenes[1].sounds, ['pop']);
    assert.equal(result.video.music.file, 'calm');
    const selected = run('videos/demo', 'claim');
    assert.equal(selected.status, 0, selected.stderr);
    assert.deepEqual(parse(selected.stdout).scenes, [parse(source).scenes[1]]);
    assert.equal(run('videos/demo', 'missing').status, 1);
    assert.equal(run('../outside').status, 1);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(path, 'utf8'), source);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
