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
const fresh = join(cwd, 'videos', 'fresh');
call('new', fresh);
assert.match(call('validate', fresh), /ok\s+fresh/);
assert.equal(fingerprint(pkg), before, 'rendering must not write into the installed package');
console.log(`Packed consumer checks passed. Evidence: ${video}/output`);
