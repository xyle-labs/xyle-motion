import assert from 'node:assert/strict';
import test from 'node:test';
import { rendererFingerprint, sceneKey } from './cache.ts';

const video = { id: 'v', width: 1080, height: 1920, fps: 30, background: '#000', color: '#fff' } as any;
const scene = (text: string, asset = 'a.b') => ({
  id: 's', duration: 3,
  elements: [{ id: 'e', type: 'asset', asset, text } as any],
}) as any;

const key = (s: any, assets = { 'a.b': '<svg/>' }, palette = {}) =>
  sceneKey(s, video, assets, palette, 'fp');

test('the same scene hashes the same', () => {
  assert.equal(key(scene('x')), key(scene('x')));
});

test('a changed value changes the key', () => {
  assert.notEqual(key(scene('x')), key(scene('y')));
});

test('editing the art invalidates the scene that uses it', () => {
  assert.notEqual(
    key(scene('x'), { 'a.b': '<svg/>' }),
    key(scene('x'), { 'a.b': '<svg><g/></svg>' }),
  );
});

test('an unrelated asset does not invalidate the scene', () => {
  assert.equal(
    key(scene('x'), { 'a.b': '<svg/>', other: '1' }),
    key(scene('x'), { 'a.b': '<svg/>', other: '2' }),
  );
});

test('the theme is part of the key', () => {
  assert.notEqual(key(scene('x'), undefined as any, { accent: '#f00' }), key(scene('x')));
});

test('the renderer fingerprint is stable and non-empty', () => {
  assert.equal(rendererFingerprint(), rendererFingerprint());
  assert.match(rendererFingerprint(), /^[0-9a-f]{16}$/);
});

test('swapping the music does not invalidate any scene', () => {
  const withBed = { ...video, music: { file: 'bed.wav', volume: 0.2 } } as any;
  assert.equal(
    sceneKey(scene('x'), video, { 'a.b': '<svg/>' }, {}, 'fp'),
    sceneKey(scene('x'), withBed, { 'a.b': '<svg/>' }, {}, 'fp'),
  );
});

test('a scene is invalidated by its own audio, not another scene s', () => {
  const s = scene('x');
  s.elements[0].sound = { id: 'click', at: 0, volume: 1 };
  const base = { 'sound:click': 'AAA', 'narration:other': 'ZZZ' };
  assert.notEqual(
    sceneKey(s, video, {}, {}, 'fp', base),
    sceneKey(s, video, {}, {}, 'fp', { ...base, 'sound:click': 'BBB' }),
  );
  assert.equal(
    sceneKey(s, video, {}, {}, 'fp', base),
    sceneKey(s, video, {}, {}, 'fp', { ...base, 'narration:other': 'YYY' }),
  );
});
