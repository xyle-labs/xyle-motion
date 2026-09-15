import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI_ENTRY } from './paths.ts';
import { VideoSpec } from './schema.ts';

const spec = (id: string) => ({ version: 1, video: { id: 'demo' }, scenes: [{ id, duration: 1, elements: [] }] });

test('scene IDs are portable filename components', () => {
  for (const id of ['intro', 'scene-2', 'Scene_3', '4'])
    assert.equal(VideoSpec.parse(spec(id)).scenes[0].id, id);
  for (const id of ['', '.', '..', '../../../escaped', '..\\escaped', '/absolute', 'C:\\escaped', 'scene/name', 'scene name', 'scene\n', 'scene:stream', '%2e%2e%2fescaped'])
    assert.equal(VideoSpec.safeParse(spec(id)).success, false, JSON.stringify(id));
});

test('CLI rejects scene traversal before writing render outputs', () => {
  const root = mkdtempSync(join(tmpdir(), 'scene-path-'));
  try {
    const video = join(root, 'video');
    mkdirSync(video);
    const victim = join(root, 'escaped.props.json');
    writeFileSync(victim, 'preserve this file');
    writeFileSync(join(video, 'video.yaml'), JSON.stringify(spec('../../../escaped')));
    for (const args of [['render'], ['render', '--scene', '../../../escaped'], ['frame', '--scene', '../../../escaped']]) {
      const [command, ...options] = args;
      const result = spawnSync(process.execPath, [CLI_ENTRY, command, video, ...options], {
        encoding: 'utf8', timeout: 10_000,
        env: { ...process.env, XYLE_MOTION_CACHE: join(root, 'runtime'), XYLE_MOTION_BROWSER_EXECUTABLE: join(root, 'missing-browser') },
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /Scene ID/);
      assert.equal(readFileSync(victim, 'utf8'), 'preserve this file');
      assert.equal(existsSync(join(video, 'output')), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
