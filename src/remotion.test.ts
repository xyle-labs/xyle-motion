import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { remotionArgs, remotionCwd, rendererDiagnostic } from './remotion.ts';

test('browser/cache failures are actionable without substituting the selected browser', () => {
  const root = mkdtempSync(join(tmpdir(), 'motion-diagnostics-'));
  const browser = process.env.XYLE_MOTION_BROWSER_EXECUTABLE;
  const cache = process.env.XYLE_MOTION_CACHE;
  try {
    process.env.XYLE_MOTION_BROWSER_EXECUTABLE = join(root, 'missing-browser');
    assert.throws(() => remotionArgs(['still', 'Video']), /missing or not executable/);
    assert.match(rendererDiagnostic('net::ERR_CONNECTION_REFUSED at localhost'), /Local browser navigation failure/);
    assert.match(rendererDiagnostic('Failed to launch browser: exited'), /Browser launch failure/);
    assert.match(rendererDiagnostic('original failure'), /original failure$/);
    assert.ok(!rendererDiagnostic('failure').includes(root), 'summary does not expose the source-machine directory');
    const file = join(root, 'file'); writeFileSync(file, 'not a directory');
    process.env.XYLE_MOTION_CACHE = file;
    assert.throws(() => remotionCwd(), /cache is not writable.*XYLE_MOTION_CACHE/);
    assert.equal(process.env.XYLE_MOTION_BROWSER_EXECUTABLE, join(root, 'missing-browser'));
  } finally {
    if (browser === undefined) delete process.env.XYLE_MOTION_BROWSER_EXECUTABLE; else process.env.XYLE_MOTION_BROWSER_EXECUTABLE = browser;
    if (cache === undefined) delete process.env.XYLE_MOTION_CACHE; else process.env.XYLE_MOTION_CACHE = cache;
    rmSync(root, { recursive: true, force: true });
  }
});
