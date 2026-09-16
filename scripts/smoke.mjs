import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Test the packed product, outside the checkout. Keep evidence for inspection.
const tarball = process.argv[2];
assert.ok(tarball, 'usage: node scripts/smoke.mjs /path/to/package.tgz');
const root = mkdtempSync(join(tmpdir(), 'xyle-motion-consumer-'));
const cwd = join(root, "client's project with spaces");
mkdirSync(cwd);
writeFileSync(join(cwd, 'package.json'), '{"name":"consumer-smoke","private":true}\n');
writeFileSync(join(cwd, 'remotion.config.js'), 'throw new Error("Host config must not be loaded");\n');
const env = { ...process.env, XYLE_MOTION_CACHE: process.env.XYLE_MOTION_CACHE ?? join(root, 'runtime') };
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 240_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.error ?? ''}\n${result.stderr}\n${result.stdout.slice(-5000)}`);
  return result.stdout;
};
run('npm', ['install', '--offline', '--no-audit', '--no-fund', resolve(tarball)]);
const pkg = join(cwd, 'node_modules/@xyle-labs/motion');
const cli = join(pkg, 'dist/bin/explainer.js');
const fingerprint = (directory) => {
  const hash = createHash('sha256');
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else { hash.update(path); hash.update(readFileSync(path)); }
    }
  };
  walk(directory);
  return hash.digest('hex');
};
const before = fingerprint(pkg);
const video = join(cwd, 'videos', 'demo');
mkdirSync(join(cwd, 'videos'));
cpSync(join(pkg, 'examples/minimal'), video, { recursive: true });
const call = (...args) => run(process.execPath, [cli, ...args]);
assert.match(call('--help'), /usage:/);
assert.match(call('-h'), /decode only/);
const invalid = spawnSync(process.execPath, [cli, '--unknown'], { cwd, env, encoding: 'utf8' });
assert.equal(invalid.status, 1);
assert.doesNotMatch(invalid.stderr, /\n\s+at |ERR_PARSE_ARGS/);
assert.match(call('validate', video), /ok\s+minimal/);
assert.match(call('inspect', video, '--scene', 'idea'), /An idea, made visible/);
assert.match(call('assets', video), /household.lightbulb/);
call('frame', video, '--scene', 'idea', '--time', '1.5');
call('contact-sheet', video, '--frames', '3');
assert.match(call('render', video), /2 rendered, 0 reused/);
assert.match(call('render', video), /0 rendered, 2 reused/);
const specPath = join(video, 'video.yaml');
writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('An idea, made visible.', 'A clear idea, made visible.'));
assert.match(call('render', video), /1 rendered, 1 reused/);
writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('volume: 0.12', 'volume: 0.13'));
assert.match(call('render', video), /0 rendered, 2 reused/);
// Real PNG/WebP/SVG files in an external project, including aspect ratio and alpha.
const artwork = join(cwd, 'videos', 'local artwork');
mkdirSync(artwork);
// Synthetic 80x40 transparent images with a central green rectangle (original test art).
const pictures = {'png': 'iVBORw0KGgoAAAANSUhEUgAAAFAAAAAoCAYAAABpYH0BAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAfUlEQVR4nO3ZwQmAQAwAQQ/sv2W9HibgCTtpICz5ZV0h99cL/F0BUQFRAVEBUQFRAVEBUQHRfMBnz8nWnkFdICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqIJoPOPxzOF0XiAqICogKiAqICogKiAqICoheXvQCoKNzB44AAAAASUVORK5CYII=', 'webp': 'UklGRi4AAABXRUJQVlA4TCEAAAAvT8AJEA8w/xHzHwwyaZs5mH+Xc1AFZW9E/ycgkgPoA4YA'};
for (const [extension, bytes] of Object.entries(pictures))
  writeFileSync(join(artwork, `picture.${extension}`), Buffer.from(bytes, 'base64'));
writeFileSync(join(artwork, 'picture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><rect x="20" y="10" width="40" height="20" fill="#00ff00"/></svg>');
writeFileSync(join(artwork, 'video.yaml'), `version: 1
video: { id: local-artwork, width: 320, height: 240, fps: 10, background: '#0000ff' }
scenes:
${['png', 'webp', 'svg'].map(extension => `  - id: ${extension}
    duration: 1
    elements:
      - id: picture
        type: asset
        file: picture.${extension}
        width: 200
        height: 200
        enter: { type: appear }
        exit: { type: none }
`).join('')}`);
assert.match(call('validate', artwork), /3 assets/);
assert.match(call('inspect', artwork), /file:picture.png/);
assert.match(call('assets', artwork), /file:picture.webp/);
for (const extension of ['png', 'webp', 'svg']) {
  call('frame', artwork, '--scene', extension, '--time', '0.5');
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', join(artwork, 'output', `frame-${extension}-0.5s.png`),
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  assert.equal(result.status, 0, result.stderr?.toString());
  const pixel = (x, y) => [...result.stdout.subarray((y * 320 + x) * 3, (y * 320 + x) * 3 + 3)];
  const green = pixel(160, 120);
  assert.ok(green[1] > 240 && green[0] < 10 && green[2] < 10, `${extension}: image must decode`);
  // Stretching the 2:1 image into the square box would turn this pixel green.
  assert.deepEqual(pixel(160, 85), [0, 0, 255], `${extension}: preserve aspect ratio`);
  assert.deepEqual(pixel(75, 120), [0, 0, 255], `${extension}: preserve transparency`);
}
assert.match(call('render', artwork), /3 rendered, 0 reused/);
assert.match(call('render', artwork), /0 rendered, 3 reused/);
run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=80x40:d=0.1', '-frames:v', '1', join(artwork, 'picture.png')]);
assert.match(call('render', artwork), /1 rendered, 2 reused/);
call('contact-sheet', artwork);
// Exercise cleanup where the package/model path itself contains an apostrophe.
run(process.execPath, ['--input-type=module', '-e', `
  import { pathToFileURL } from 'node:url';
  import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
  import { join } from 'node:path';
  import assert from 'node:assert/strict';
  const { encodeWav, enhanceRecording, wavSeconds } = await import(pathToFileURL(process.argv[1]));
  const dir = process.argv[2]; mkdirSync(dir, {recursive:true});
  const input = join(dir, 'original.wav');
  const original = encodeWav(Int16Array.from({length:48000}, (_, i) => Math.round(Math.sin(i*0.03)*4000)), 48000);
  writeFileSync(input, original);
  for (const mode of ['gentle', 'isolate']) {
    const output = enhanceRecording(input, join(dir, mode), '', mode);
    assert.ok(Math.abs(wavSeconds(output)-1)<0.01);
    assert.deepEqual(readFileSync(input), original);
  }
`, join(pkg, 'dist/src/audio.js'), join(cwd, 'audio check')]);
call('contact-sheet', video, '--frames', '3'); // Current evidence after the edits above.
const bundle = join(video, 'output', 'review');
call('review', video, '--note', '<draft> listening pending');
const html = readFileSync(join(bundle, 'index.html'), 'utf8');
assert.match(html, /Current: rendered inputs/);
assert.match(html, /data-time="3">together/);
assert.match(html, /&lt;draft&gt; listening pending/);
assert.ok(!html.includes(cwd), 'review page must not expose source-machine paths');
assert.deepEqual(readdirSync(bundle).sort(), ['contact-sheet.png', 'index.html', 'video.mp4']);
writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('A clear idea, made visible.', 'A revised idea.'));
call('review', video);
assert.match(readFileSync(join(bundle, 'index.html'), 'utf8'), /Stale output/);
const badBrowser = spawnSync(process.execPath, [cli, 'frame', video, '--scene', 'idea'], {
  cwd, encoding: 'utf8', env: { ...env, XYLE_MOTION_BROWSER_EXECUTABLE: join(root, 'missing-browser') },
});
assert.equal(badBrowser.status, 1);
assert.match(badBrowser.stderr, /Missing executable.*missing-browser/);
assert.match(badBrowser.stderr, /XYLE_MOTION_BROWSER_EXECUTABLE/);
assert.doesNotMatch(badBrowser.stderr, /\n\s+at /);
const fresh = join(cwd, 'videos', 'fresh');
call('new', fresh);
assert.match(call('validate', fresh), /ok\s+fresh/);
// Decode-only import and scene mix parity, using synthetic narration.
const spoken = join(cwd, 'videos', 'spoken');
mkdirSync(spoken);
writeFileSync(join(spoken, 'video.yaml'), `# preserve this note
version: 1
video: { id: spoken, width: 320, height: 240, fps: 10, music: { file: daybreak, volume: 0.35 } }
scenes:
  - { id: first, duration: 1.2, elements: [] }
  - id: second
    duration: 1.8
    narration: { text: Hello, volume: 0.3 }
    markers: [{ id: word, time: 0.25 }]
    elements:
      - { id: cue, type: text, text: Hello, at: { marker: word, offset: 0.05 }, sound: { id: click, volume: 0.4 } }
`);
const take = join(cwd, 'prepared take.mp3');
run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.75', '-c:a', 'libmp3lame', take]);
const originalTake = readFileSync(take);
assert.match(call('import', spoken, '--scene', 'second', '--input', take), /attached 0.75s decoded narration/);
assert.deepEqual(readFileSync(take), originalTake);
assert.match(readFileSync(join(spoken, 'video.yaml'), 'utf8'), /# preserve this note/);
assert.match(call('validate', spoken), /ok\s+spoken/);
assert.match(call('inspect', spoken, '--scene', 'second'), /needs narration review/);
call('render', spoken);
const preview = call('mix', spoken, '--scene', 'second').match(/: (.+\.mp4)\s*$/)?.[1];
assert.ok(preview, 'mix must report its output');
const samples = (file, offset) => {
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ss', String(offset), '-t', '1.8', '-f', 'f32le', '-ar', '8000', '-ac', '1', 'pipe:1']);
  assert.equal(decoded.status, 0, decoded.stderr?.toString());
  return Array.from({ length: decoded.stdout.length / 4 }, (_, i) => decoded.stdout.readFloatLE(i * 4));
};
const assertMixParity = (previewFile) => {
  const fullAudio = samples(join(spoken, 'output', 'spoken.mp4'), 1.2);
  const previewAudio = samples(previewFile, 0);
  // AAC packet boundaries may shift decoded samples slightly; compare aligned interiors.
  let error = Infinity;
  for (let lag = -256; lag <= 256; lag++) {
    let difference = 0, energy = 0;
    for (let i = 800; i < Math.min(fullAudio.length, previewAudio.length) - 800; i++) {
      difference += (fullAudio[i] - previewAudio[i + lag]) ** 2;
      energy += fullAudio[i] ** 2;
    }
    error = Math.min(error, difference / energy);
  }
  assert.ok(error < 0.15, `scene mix must match the final timeline audio (relative error ${error})`);
};
assertMixParity(preview);
assert.match(call('render', spoken), /0 rendered, 2 reused/, 'mix must leave the stitchable scene cache unchanged');
const spokenSpec = join(spoken, 'video.yaml');
writeFileSync(spokenSpec, readFileSync(spokenSpec, 'utf8').replace('volume: 0.35', 'volume: 0.35, ducking: true'));
assert.match(call('render', spoken), /0 rendered, 2 reused/, 'ducking changes only the final mix');
const duckedPreview = call('mix', spoken, '--scene', 'second').match(/: (.+\.mp4)\s*$/)?.[1];
assert.ok(duckedPreview);
assertMixParity(duckedPreview);
writeFileSync(spokenSpec, readFileSync(spokenSpec, 'utf8').replace('time: 0.25', 'time: 0.45'));
assert.match(call('render', spoken), /1 rendered, 1 reused/, 'marker changes must invalidate the consuming scene');
assert.equal(fingerprint(pkg), before, 'rendering must not write into the installed package');
console.log(`Packed consumer checks passed. Evidence: ${video}/output`);
