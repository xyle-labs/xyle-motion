import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { encodeWav, wavSeconds } from './audio.ts';
import { importRecording } from './import-recording.ts';
import { CLI_ENTRY } from './paths.ts';

test('decode-only import preserves samples, original and YAML; failures do not change project content', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'motion import '));
  try {
    const path = join(dir, 'video.yaml');
    const source = '# approved copy\nversion: 1\nvideo: { id: example }\nscenes:\n  - id: line\n    duration: 2\n    narration: { text: Hello, volume: 0.6 }\n    elements: []\n';
    writeFileSync(path, source);
    const input = join(dir, 'take.wav');
    const samples = Int16Array.from({ length: 48000 }, (_, i) => Math.round(2000 * Math.sin(i * 0.05)));
    const original = encodeWav(samples, 48000);
    writeFileSync(input, original);
    assert.throws(() => importRecording(dir, 'missing', input), /No scene/);
    assert.throws(() => importRecording(dir, 'line', join(dir, 'missing.wav')), /ENOENT/);
    writeFileSync(input, 'bad input');
    assert.throws(() => importRecording(dir, 'line', input), /Could not decode/);
    writeFileSync(input, encodeWav(new Int16Array(48000 * 3), 48000));
    assert.throws(() => importRecording(dir, 'line', input), /YAML unchanged/);
    assert.equal(readFileSync(path, 'utf8'), source);
    assert.equal(existsSync(join(dir, 'recordings')), false);
    writeFileSync(input, original);
    const { file, seconds } = importRecording(dir, 'line', input);
    assert.equal(seconds, 1);
    const decoded = readFileSync(join(dir, file));
    assert.equal(wavSeconds(decoded), 1);
    assert.deepEqual(decoded.subarray(decoded.indexOf(Buffer.from('data')) + 8), original.subarray(44));
    assert.deepEqual(readFileSync(input), original);
    assert.match(readFileSync(path, 'utf8'), /# approved copy/);
    const narration = parse(readFileSync(path, 'utf8')).scenes[0].narration;
    assert.deepEqual(narration, { text: 'Hello', volume: 0.6, audio: file });
    assert.deepEqual(readFileSync(join(dir, file, '..', 'original.wav')), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('help and invalid flags are concise and create no files', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'motion-help-'));
  try {
    for (const flag of ['--help', '-h', '--unknown']) {
      const result = spawnSync(process.execPath, [CLI_ENTRY, flag], { cwd, encoding: 'utf8' });
      assert.equal(result.status, flag === '--unknown' ? 1 : 0, result.stderr);
      assert.match(result.stdout + result.stderr, /usage:/);
      assert.doesNotMatch(result.stderr, /\n\s+at |ERR_PARSE_ARGS/);
    }
    assert.deepEqual(readdirSync(cwd), []);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
