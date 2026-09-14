// Box maths is what a callout points at, so it is checked here rather than by
// squinting at a rendered frame.  `npm run check`
import assert from 'node:assert/strict';
import test from 'node:test';
import { edge, elementBox, grid } from './layout.ts';

const video = { width: 1080, height: 1920 } as any;
const el = (over: object) =>
  ({ type: 'asset', x: 'center', y: 'center', repeat: 1, gap: 12, ...over }) as any;

test('keywords resolve to fractions of the canvas, numbers stay pixels', () => {
  assert.deepEqual(
    { ...elementBox(el({ x: 'left', y: 'bottom', width: 0, height: 0 }), video) },
    { x: 216, y: 1536, width: 0, height: 0 },
  );
  assert.equal(elementBox(el({ x: 400, width: 0, height: 0 }), video).x, 400);
});

test('an asset with only a width is square', () => {
  const box = elementBox(el({ width: 190 }), video);
  assert.equal(box.width, 190);
  assert.equal(box.height, 190);
});

test('a repeated element measures the whole grid, not one copy', () => {
  // 3 columns of 100px with 12px gaps, over 2 rows.
  const box = elementBox(
    el({ repeat: 6, columns: 3, gap: 12, width: 100, height: 100 }),
    video,
  );
  assert.equal(box.width, 3 * 100 + 2 * 12);
  assert.equal(box.height, 2 * 100 + 1 * 12);
});

test('text has no laid-out height, so the box estimates it from the font', () => {
  assert.equal(grid(el({ type: 'text', size: 40 }), video).height, undefined);
  assert.equal(elementBox(el({ type: 'text', size: 40 }), video).height, 50);
  assert.equal(elementBox(el({ type: 'text' }), video).height, 90); // default 72px
});

test('a line is measured from its own endpoints', () => {
  const box = elementBox(el({ type: 'line', from: [100, 200], to: [500, 400] }), video);
  assert.deepEqual({ ...box }, { x: 300, y: 300, width: 400, height: 200 });
});

test('edge picks the midpoint of the named side', () => {
  const box = { x: 500, y: 900, width: 200, height: 100 };
  assert.deepEqual(edge(box, 'left'), [400, 900]);
  assert.deepEqual(edge(box, 'right'), [600, 900]);
  assert.deepEqual(edge(box, 'top'), [500, 850]);
  assert.deepEqual(edge(box, 'bottom'), [500, 950]);
});
