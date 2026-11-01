import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI_ENTRY, PACKAGE_ROOT } from './paths.ts';

test('CLI demo works outside the package, ignores creation defaults, and preserves existing work', () => {
  const home = mkdtempSync(join(tmpdir(), 'motion-demo-'));
  const target = join(home, "a video's example");
  const call = (...args: string[]) => spawnSync(process.execPath, [CLI_ENTRY, ...args], { cwd: home, encoding: 'utf8' });
  try {
    writeFileSync(join(home, 'explainer.yaml'), 'defaults: { theme: missing, width: 100 }\n');
    const version = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
    assert.equal(call('--version').stdout.trim(), version);
    assert.equal(call('demo', target).status, 0);
    const source = readFileSync(join(target, 'video.yaml'));
    assert.deepEqual(source, readFileSync(join(PACKAGE_ROOT, 'examples/minimal/video.yaml')));
    assert.equal(call('validate', target).status, 0);
    assert.equal(call('demo', target).status, 1);
    assert.deepEqual(readFileSync(join(target, 'video.yaml')), source);
    assert.equal(call('demo', join(home, 'other'), '--config', 'missing.yaml').status, 1);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
