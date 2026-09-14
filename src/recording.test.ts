import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { get } from 'node:http';
import { parse } from 'yaml';
import { encodeWav, enhanceRecording, wavSeconds } from './audio.ts';
import { planVoice, readingPlan, spokenWordCount, startRecordingStudio } from './recording.ts';

test('prompter leaves room at both ends and gives punctuation extra time', () => {
  const { cues, wpm } = readingPlan('One, two three.', 4);
  assert.equal(cues[0].at, 0.25);
  assert.ok(cues[1].at - cues[0].at > cues[2].at - cues[1].at);
  assert.ok(cues[2].at < 3.8);
  assert.equal(wpm, 51);
  assert.deepEqual(readingPlan('', 2).cues, []);
});

test('timing fit rejects truncation and excessive speed-up, and validates trims', () => {
  assert.throws(() => planVoice(8, 5, { end: 8, fit: 'keep' }), /longer than/);
  assert.throws(() => planVoice(8, 5, { end: 8, fit: 'speed' }), /20%/);
  assert.throws(() => planVoice(5, 6, { start: 3, end: 2 }), /Trim/);
  assert.throws(() => planVoice(5, 6, { end: 8 }), /Trim/);
  assert.throws(() => planVoice(5, 6, { end: 5, pitch: 12 }));
  assert.throws(() => planVoice(5, 6, { end: 5, speaker: 'remote-voice' }));
  assert.equal(planVoice(5, 6, { end: 5, speaker: 'en-default', noise: 'lavasr' }).settings.speaker, 'en-default');
  assert.equal(planVoice(8, 5, { end: 8, fit: 'extend' }).speed, 1);
  assert.ok(planVoice(5, 5, { end: 5, fit: 'speed' }).speed > 1);
  assert.throws(() => planVoice(5, 5, { end: 5, fit: 'speed' }, 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen'), /169 WPM/);
});

test('reading windows stay under 170 WPM including numbers, abbreviations and compound words', () => {
  assert.equal(spokenWordCount('235 students'), 6);
  assert.equal(spokenWordCount('PBL is project-based learning.'), 7);
  const plan = readingPlan('one two three four five six seven eight nine ten', 2);
  assert.ok(plan.window > 2);
  assert.ok(plan.wpm <= 165);
  assert.ok(plan.wordCount * 60 / plan.minimumWindow < 170);
  const pbl = parse(readFileSync('examples/minimal/video.yaml', 'utf8'));
  for (const scene of pbl.scenes) {
    if (scene.narration) assert.ok(spokenWordCount(scene.narration.text) * 60 / (scene.duration - 0.45) < 170, scene.id);
  }
});

test('offline neural cleanup suppresses test noise more than gentle cleanup; disguise preserves timing', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'local-voice-'));
  try {
    const input = join(directory, 'noise.wav');
    let seed = 123;
    const noise = Int16Array.from({ length: 96000 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.round((seed / 4294967296 - 0.5) * 2000);
    });
    writeFileSync(input, encodeWav(noise, 48000));
    const samples = (path: string) => {
      const b = readFileSync(path); let offset = 12;
      while (b.toString('ascii', offset, offset + 4) !== 'data') { const size = b.readUInt32LE(offset + 4); offset += 8 + size + size % 2; }
      const size = b.readUInt32LE(offset + 4);
      return Array.from({ length: size / 2 }, (_, i) => b.readInt16LE(offset + 8 + i * 2) / 32768);
    };
    const rms = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length);
    const gentle = enhanceRecording(input, directory);
    const strong = enhanceRecording(input, directory, '', 'isolate');
    assert.equal(wavSeconds(strong), 2);
    assert.ok(20 * Math.log10(rms(samples(gentle)) / rms(samples(strong))) > 5);
    assert.deepEqual(readFileSync(input), encodeWav(noise, 48000));
    const tone = join(directory, 'tone.wav');
    writeFileSync(tone, encodeWav(Int16Array.from({ length: 96000 }, (_, i) => Math.round(6000 * Math.sin(i / 48000 * 2 * Math.PI * 220))), 48000));
    const plan = planVoice(2, 3, { end: 2, pitch: -7, tone: 'deep' });
    const altered = enhanceRecording(tone, directory, plan.filters);
    assert.ok(Math.abs(wavSeconds(altered)! - 2.25) < 0.1);
    const middle = samples(altered).slice(48000, 96000);
    const crossings = middle.reduce((sum, value, i) => sum + (i && middle[i - 1] < 0 && value >= 0 ? 1 : 0), 0);
    assert.ok(Math.abs(crossings - 220 * 2 ** (-7 / 12)) < 4, 'deep disguise changes pitch without speeding the voice');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('studio preserves originals, previews separately, applies safely, and survives reopening', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'narration-studio-'));
  const path = join(directory, 'video.yaml');
  const source = '# Keep this production note\nversion: 1\nvideo: { id: test }\nscenes:\n  - id: scene\n    duration: 2\n    narration: { text: "Read this line." }\n    elements: []\n';
  writeFileSync(path, source);
  const { server, url } = await startRecordingStudio(directory, 0);
  try {
    const html = await (await fetch(url)).text();
    const token = /name="studio-token" content="([^"]+)"/.exec(html)![1];
    const post = async (route: string, data: unknown, overrides = {}) => {
      const response = await fetch(url + route, { method: 'POST', headers: { 'X-Studio-Token': token, 'Content-Type': 'application/json', ...overrides }, body: Buffer.isBuffer(data) ? data : JSON.stringify(data) });
      return { status: response.status, data: await response.json() as any };
    };
    assert.equal((await post('/api/apply', {}, { 'X-Studio-Token': 'wrong' })).status, 403);
    assert.equal((await post('/api/apply', {}, { Origin: 'https://elsewhere.example' })).status, 403);
    const hostileHost = await new Promise((done) => get(url + '/api/state', { headers: { Host: 'elsewhere.example' } }, (response) => { response.resume(); done(response.statusCode); }));
    assert.equal(hostileHost, 403);
    const digest = createHash('sha256').update('Read this line.').digest('hex');
    const samples = Int16Array.from({ length: 48000 * 3 }, (_, i) => Math.round(7000 * Math.sin(i / 48000 * Math.PI * 2 * 220)));
    const original = encodeWav(samples, 48000);
    const result = await post(`/api/take?scene=scene&script=${digest}`, original, { 'Content-Type': 'audio/wav' });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    const take = result.data;
    assert.deepEqual(readFileSync(join(directory, take.original)), original);
    assert.equal(readFileSync(path, 'utf8'), source);
    const range = await fetch(`${url}/media/take?id=${take.id}`, { headers: { Range: 'bytes=0-43' } });
    assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 44);
    assert.equal((await fetch(`${url}/media/take?id=${take.id}`, { headers: { Range: 'bytes=9999999-' } })).status, 416);
    const script = await (await fetch(url + '/api/script')).text();
    assert.match(script, /Read this line/);
    assert.equal((await post('/api/process', { id: take.id, settings: { end: 3, fit: 'keep' } })).status, 400);
    const processed = await post('/api/process', { id: take.id, settings: { start: 0.25, end: 2.75, lead: 0.3, pitch: -2, tone: 'warm', fit: 'extend' } });
    assert.equal(processed.status, 200, JSON.stringify(processed.data));
    const preview = processed.data.processed;
    assert.ok(preview.duration > 2);
    assert.ok(Math.abs(wavSeconds(join(directory, preview.file))! - 2.8) < 0.1, 'pitch shifting preserves duration and adds lead-in');
    const wave = readFileSync(join(directory, preview.file));
    assert.ok(wave.length > 48000);
    assert.equal(readFileSync(path, 'utf8'), source, 'processing leaves project untouched');
    writeFileSync(path, source + '# Concurrent edit\n');
    assert.equal((await post('/api/apply', { id: take.id })).status, 400, 'stale previews cannot overwrite edits');
    assert.equal((await post('/api/process', { id: take.id, settings: { end: 3, fit: 'extend' } })).status, 200);
    assert.equal((await post('/api/apply', { id: take.id })).status, 200);
    const updated = readFileSync(path, 'utf8');
    assert.match(updated, /Keep this production note/); assert.match(updated, /Concurrent edit/);
    assert.ok(parse(updated).scenes[0].duration > 3);
    assert.match(parse(updated).scenes[0].narration.audio, /^recordings\/enhanced\//);
    assert.deepEqual(readFileSync(join(directory, take.original)), original);
    // A trimmed take can fit the original scene with independent pitch/speed controls.
    const short = await post('/api/process', { id: take.id, settings: { start: 0.5, end: 2, fit: 'keep', pitch: 2, tone: 'bright' } });
    assert.equal(short.status, 200, JSON.stringify(short.data));
    assert.ok(short.data.processed.seconds < 2);
    writeFileSync(path, updated.replace('Read this line.', 'A changed script.'));
    assert.equal((await post('/api/process', { id: take.id, settings: { end: 3, fit: 'extend' } })).status, 400);
    assert.equal((await post(`/api/take?scene=scene&script=${digest}`, original, { 'Content-Type': 'audio/wav' })).status, 400);
    const reopened = await startRecordingStudio(directory, 0);
    try {
      const state = await (await fetch(reopened.url + '/api/state')).json() as any;
      assert.equal(state.takes.length, 1);
      assert.equal(state.takes[0].id, take.id);
    } finally { await new Promise<void>((done) => reopened.server.close(() => done())); }
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(directory, { recursive: true, force: true });
  }
});
