import assert from 'node:assert/strict';
import test from 'node:test';
import { assetId, distance, scan, statesOf, suggest } from './library.ts';

test('asset ids are derived from the path, not a registry', () => {
  assert.equal(assetId('energy/coal-powerplant.svg'), 'energy.coal_powerplant');
  assert.equal(assetId('generic/arrow.svg'), 'generic.arrow');
});

test('states are read off the art', () => {
  assert.deepEqual(statesOf('<g data-state="on"/><g data-state="off"/>'), ['on', 'off']);
  assert.deepEqual(statesOf('<g/>'), []);
});

test('distance counts single edits', () => {
  assert.equal(distance('bill', 'bill'), 0);
  assert.equal(distance('bill', 'bull'), 1);
  assert.equal(distance('', 'abc'), 3);
});

test('a near miss is suggested, an unrelated id is not', () => {
  const known = ['money.electricity_bill', 'energy.coal_powerplant'];
  assert.equal(suggest('money.electricity_invoice', known), 'money.electricity_bill');
  assert.equal(suggest('transport.jeepney', known), undefined);
});

test('the library on disk scans and every asset is real SVG', () => {
  const found = scan();
  assert.ok(found.size >= 10, `expected a library, found ${found.size}`);
  assert.ok(found.has('household.lightbulb'));
  for (const [id, path] of found) assert.match(path, /\.svg$/, id);
});

import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAssets } from './library.ts';
import { VideoSpec } from './schema.ts';
import { sceneKey } from './cache.ts';

test('local artwork resolves bytes, rejects escaping paths, and invalidates only consumers', () => {
  const root = mkdtempSync(join(tmpdir(), 'motion artwork '));
  const project = join(root, "project's video");
  mkdirSync(project);
  const spec = (file: string) => VideoSpec.parse({ version: 1, video: { id: 'local' }, scenes: [
    { id: 'art', duration: 2, elements: [{ id: 'picture', type: 'asset', file }] },
    { id: 'other', duration: 2, elements: [{ id: 'label', type: 'text', text: 'Hello' }] },
  ] });
  try {
    for (const [extension, mime] of [['png', 'image/png'], ['webp', 'image/webp'], ['svg', 'image/svg+xml']]) {
      const file = `local picture.${extension}`;
      // Synthetic bytes test resolution; the packed smoke test decodes real images.
      writeFileSync(join(project, file), 'first');
      const video = spec(file);
      const first = resolveAssets(video, undefined, project);
      assert.deepEqual(first.errors, []);
      assert.equal(first.assets[`file:${file}`], `data:${mime};base64,${Buffer.from('first').toString('base64')}`);
      writeFileSync(join(project, file), 'second');
      const second = resolveAssets(video, undefined, project);
      const key = (index: number, assets: Record<string, string>) => sceneKey(video.scenes[index], video.video, assets, {}, 'renderer');
      assert.notEqual(key(0, first.assets), key(0, second.assets));
      assert.equal(key(1, first.assets), key(1, second.assets));
    }
    writeFileSync(join(root, 'outside.svg'), '<svg/>');
    symlinkSync(join(root, 'outside.svg'), join(project, 'escape.svg'));
    mkdirSync(join(project, 'folder.png'));
    for (const [file, message] of [
      ['missing.png', /file not found/], ['../outside.svg', /inside the video directory/],
      ['escape.svg', /inside the video directory/], [join(root, 'outside.svg'), /video-relative/],
      ['https://example.invalid/image.png', /video-relative/], ['C:\\art.png', /video-relative/],
      ['local.jpg', /PNG, WebP or SVG/], ['folder.png', /regular file/],
    ] as const) {
      const result = resolveAssets(spec(file), undefined, project);
      assert.equal(result.errors.length, 1, file);
      assert.match(result.errors[0], message);
      assert.match(result.errors[0], /element "picture" in scene "art"/);
    }
    assert.match(resolveAssets(spec('local picture.png')).errors[0], /needs a video directory/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('asset elements require one source and reserve states for bundled SVGs', () => {
  const parse = (element: object) => VideoSpec.parse({ version: 1, video: { id: 'v' }, scenes: [
    { id: 's', duration: 1, elements: [{ id: 'e', type: 'asset', ...element }] },
  ] });
  assert.doesNotThrow(() => parse({ file: 'art.png' }));
  assert.doesNotThrow(() => parse({ asset: 'household.lightbulb', state: 'on' }));
  assert.throws(() => parse({}), /exactly one/);
  assert.throws(() => parse({ asset: 'a.b', file: 'art.png' }), /exactly one/);
  assert.throws(() => parse({ file: 'art.svg', state: 'on' }), /do not support/);
  assert.throws(() => parse({ type: 'text', text: 'hello', file: 'art.png' }), /do nothing/);
});
