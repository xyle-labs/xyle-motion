import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

test('the copied skill keeps every local documentation link inside its own folder', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'explainer-skill-'));
  const skill = join(cwd, '.agents', 'skills', 'xyle-motion');
  const source = fileURLToPath(new URL('../', import.meta.url));
  try {
    mkdirSync(skill, { recursive: true });
    cpSync(join(source, 'SKILL.md'), join(skill, 'SKILL.md'));
    cpSync(join(source, 'references'), join(skill, 'references'), { recursive: true });
    for (const file of readdirSync(skill, { recursive: true }).filter((file) => file.endsWith('.md'))) {
      const path = join(skill, file);
      for (const [, target] of readFileSync(path, 'utf8').matchAll(/\]\(([^\s)]+)\)/g)) {
        if (/^(?:[a-z][\w+.-]*:|#)/i.test(target)) continue;
        const destination = resolve(dirname(path), decodeURIComponent(target.split(/[?#]/)[0]));
        const local = relative(skill, destination);
        assert.ok(!isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`), `${file}: ${target} escapes the copied skill`);
        assert.ok(existsSync(destination), `${file}: missing copied reference ${target}`);
      }
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

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
