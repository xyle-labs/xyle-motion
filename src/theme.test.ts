import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTheme, loadTheme } from './theme.ts';

const palette = { background: '#EEE', text: '#111', accent: '#F00' };

test('a real theme file loads its palette', () => {
  const xyle = loadTheme('xyle');
  assert.equal(xyle.background, '#ECEAE4');
  assert.ok(xyle.accent);
});

test('an unknown theme fails loudly', () => {
  assert.throws(() => loadTheme('nope'), /no theme "nope"/);
});

test('the theme supplies ground and ink, and names resolve to hex', () => {
  const out = applyTheme(
    { video: {}, scenes: [{ elements: [{ color: 'accent' }] }] },
    palette,
  );
  assert.equal(out.video.background, '#EEE');
  assert.equal(out.video.color, '#111');
  assert.equal(out.scenes[0].elements[0].color, '#F00');
});

test('an explicit colour survives the theme', () => {
  const out = applyTheme({ video: { background: '#123456' }, scenes: [] }, palette);
  assert.equal(out.video.background, '#123456');
});

test('animation slot colours resolve too', () => {
  const out = applyTheme(
    { video: {}, scenes: [{ elements: [{ animation: { color: 'accent' } }] }] },
    palette,
  );
  assert.equal(out.scenes[0].elements[0].animation.color, '#F00');
});

test('a palette name used as content is left alone', () => {
  // The whole reason applyTheme targets known colour fields instead of
  // walking everything.
  const out = applyTheme(
    { video: {}, scenes: [{ elements: [{ type: 'text', text: 'accent' }] }] },
    palette,
  );
  assert.equal(out.scenes[0].elements[0].text, 'accent');
});

test('a studio scene keeps its own palette without recolouring subsequent content', () => {
  const out = applyTheme({ video: {}, scenes: [
    { palette: { background: '#F7F1E3', accent: '#A5B881', shell: '#805333' }, elements: [
      { color: 'shell', exit: { color: 'accent' } },
    ] },
    { elements: [{ color: 'accent' }] },
  ] }, palette);
  assert.equal(out.video.background, '#EEE');
  assert.equal(out.scenes[0].palette.background, '#F7F1E3');
  assert.equal(out.scenes[0].elements[0].color, '#805333');
  assert.equal(out.scenes[0].elements[0].exit.color, '#A5B881');
  assert.equal(out.scenes[1].elements[0].color, '#F00');
});
