import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.ts';
import { resolveAssets } from './library.ts';
import { loadTheme } from './theme.ts';
import { VideoSpec } from './schema.ts';
import { sceneKey } from './cache.ts';
import { encodeWav, musicPath, resolveAudio } from './audio.ts';

test('one plain project config resolves roots from its own location and asset edits invalidate consumers', () => {
  const root = mkdtempSync(join(tmpdir(), 'motion config '));
  const video = join(root, 'videos', 'first');
  const assets = join(root, 'shared art');
  const themes = join(root, 'palettes');
  mkdirSync(video, { recursive: true });
  mkdirSync(assets);
  mkdirSync(themes);
  mkdirSync(join(assets, 'music'));
  mkdirSync(join(assets, 'sounds'));
  const art = join(assets, 'client.svg');
  writeFileSync(art, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(themes, 'brand.yaml'), 'colors: { accent: "#123456" }\n');
  const wav = encodeWav(new Int16Array(480), 48000);
  writeFileSync(join(assets, 'music', 'client-bed.wav'), wav);
  writeFileSync(join(assets, 'sounds', 'client-click.wav'), wav);
  writeFileSync(join(root, 'guide.md'), '# Local context\n');
  const configPath = join(root, 'videos', 'explainer.yaml');
  writeFileSync(configPath, 'assetRoots: ["../shared art"]\nthemeRoots: [../palettes]\ncontext: [../guide.md]\ndefaults: { theme: brand, fps: 24 }\n');
  try {
    const config = loadConfig(video);
    assert.equal(config.path, configPath);
    assert.deepEqual(config.assetRoots, [assets]);
    assert.deepEqual(config.context, [join(root, 'guide.md')]);
    assert.equal(config.defaults.fps, 24);
    assert.equal(loadTheme('brand', config.themeRoots).accent, '#123456');
    assert.equal(musicPath('client-bed', video, config.assetRoots), join(assets, 'music', 'client-bed.wav'));
    const soundSpec = VideoSpec.parse({ version: 1, video: { id: 'sound' }, scenes: [
      { id: 'cue', duration: 1, elements: [{ id: 'label', type: 'text', text: 'Hello', sound: { id: 'client-click' } }] },
    ] });
    const sound = resolveAudio(soundSpec, video, config.assetRoots);
    assert.deepEqual(sound.errors, []);
    assert.equal(sound.audio['sound:client-click'], `data:audio/wav;base64,${wav.toString('base64')}`);
    const more = join(root, 'other art');
    mkdirSync(join(more, 'music'), { recursive: true });
    mkdirSync(join(more, 'sounds'));
    writeFileSync(join(more, 'music', 'client-bed.wav'), wav);
    writeFileSync(join(more, 'sounds', 'client-click.wav'), wav);
    assert.throws(() => musicPath('client-bed', video, [assets, more]), /duplicate music.*shared art.*other art/);
    assert.throws(() => resolveAudio(soundSpec, video, [assets, more]), /duplicate sound.*shared art.*other art/);
    const spec = VideoSpec.parse({ version: 1, video: { id: 'test' }, scenes: [
      { id: 'art', duration: 1, elements: [{ id: 'shape', type: 'asset', asset: 'client' }] },
      { id: 'plain', duration: 1, elements: [] },
    ] });
    const first = resolveAssets(spec, undefined, video, config.assetRoots);
    assert.deepEqual(first.errors, []);
    writeFileSync(art, '<svg xmlns="http://www.w3.org/2000/svg"><circle r="3"/></svg>');
    const second = resolveAssets(spec, undefined, video, config.assetRoots);
    const key = (index: number, resolved: Record<string, string>) => sceneKey(spec.scenes[index], spec.video, resolved, {}, 'renderer');
    assert.notEqual(key(0, first.assets), key(0, second.assets));
    assert.equal(key(1, first.assets), key(1, second.assets));
    writeFileSync(join(assets, 'client-foo.svg'), '<svg/>');
    writeFileSync(join(assets, 'client_foo.svg'), '<svg/>');
    assert.throws(() => resolveAssets(spec, undefined, video, config.assetRoots), /duplicate asset.*client-foo.svg.*client_foo.svg/);
    assert.throws(() => loadConfig(video, join(root, 'missing.yaml')), /no configuration file/);
    writeFileSync(configPath, 'assetRoots: [/absolute/art]\n');
    assert.throws(() => loadConfig(video), /path must be relative/);
    writeFileSync(configPath, 'context: [https://example.invalid/guide.md]\n');
    assert.throws(() => loadConfig(video), /path must be relative/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
