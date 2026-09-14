// The one runnable check for Phase 2. Animation maths is pure, so it is tested
// here rather than by eyeballing frames.  `npm run check`
import assert from 'node:assert/strict';
import test from 'node:test';
import { countUp, duringEffect, enterEffect, exitEffect, type Anim } from './animations.ts';
import { VideoSpec } from './schema.ts';

const FPS = 30;
const a = (over: Partial<Anim>): Anim => ({
  type: 'fade', duration: 1, delay: 0, easing: 'linear',
  distance: 60, by: [0, 0], color: '#e0a458', ...over,
});

test('enter progress runs 0 → 1 and clamps past the end', () => {
  const fade = a({ type: 'fade' });
  assert.equal(enterEffect(fade, 0, FPS).opacity, 0);
  assert.equal(enterEffect(fade, 30, FPS).opacity, 1);
  assert.equal(enterEffect(fade, 500, FPS).opacity, 1);
});

test('delay holds an animation at zero', () => {
  const delayed = a({ type: 'fade', delay: 1 });
  assert.equal(enterEffect(delayed, 29, FPS).opacity, 0);
  assert.equal(enterEffect(delayed, 60, FPS).opacity, 1);
});

test('slide-up travels `distance` and lands on zero', () => {
  const slide = a({ type: 'slide-up', distance: 100 });
  assert.equal(enterEffect(slide, 0, FPS).transform, 'translateY(100px)');
  assert.equal(enterEffect(slide, 30, FPS).transform, 'translateY(0px)');
});

test('count-up keeps surrounding text and decimal places', () => {
  assert.equal(countUp('P12.50/kWh', 0), 'P0.00/kWh');
  assert.equal(countUp('P12.50/kWh', 1), 'P12.50/kWh');
  assert.equal(countUp('up 40%', 0.5), 'up 20%');
  assert.equal(countUp('no digits here', 1), 'no digits here');
});

test('draw sweeps the dash offset 1 → 0', () => {
  const draw = a({ type: 'draw' });
  assert.equal(duringEffect(draw, 0, FPS).css?.strokeDashoffset, 1);
  assert.equal(duringEffect(draw, 30, FPS).css?.strokeDashoffset, 0);
});

test('move reaches exactly its offset', () => {
  const move = a({ type: 'move', by: [120, -40] });
  assert.equal(duringEffect(move, 30, FPS).transform, 'translate(120px, -40px)');
});

test('a grouped logo scales and moves together, with valid flat membership', () => {
  const shrink = a({ type: 'scale', delay: 1, distance: 0.5, by: [0, -140] });
  assert.equal(duringEffect(shrink, 20, FPS).transform, 'translate(0px, 0px) scale(1)');
  assert.equal(duringEffect(shrink, 45, FPS).transform, 'translate(0px, -70px) scale(0.75)');
  assert.equal(duringEffect(shrink, 60, FPS).transform, 'translate(0px, -140px) scale(0.5)');
  const spec = { version: 1, video: { id: 'group-test' }, scenes: [{ id: 'one', duration: 4, elements: [
    { id: 'mark', type: 'group', animation: { type: 'scale', distance: 0.5 } },
    { id: 'piece', type: 'overlay', group: 'mark' },
  ] }] };
  assert.ok(VideoSpec.safeParse(spec).success);
  spec.scenes[0].elements[1].group = 'missing';
  assert.ok(!VideoSpec.safeParse(spec).success);
  spec.scenes[0].elements[1].group = 'mark';
  spec.scenes[0].elements[1].type = 'group';
  assert.ok(!VideoSpec.safeParse(spec).success);
  spec.scenes[0].elements[0].animation!.distance = -1;
  assert.ok(!VideoSpec.safeParse(spec).success);
});

test('an unknown during-type is inert rather than throwing', () => {
  assert.deepEqual(duringEffect(a({ type: 'none' }), 15, FPS), {});
});

test('every named easing actually exists and spans 0 to 1', () => {
  // Remotion's Easing has no `quint` — a quintic is poly(5). Naming a curve
  // that does not exist threw at render time, not here, so pin it here.
  for (const easing of ['smooth', 'soft', 'linear', 'in', 'inout', 'back', 'spring'] as const) {
    const fade = a({ type: 'fade', easing });
    assert.equal(enterEffect(fade, 0, FPS).opacity, 0, easing);
    // spring settles by overshooting slightly, which is the point of it
    assert.ok(Math.abs(enterEffect(fade, 30, FPS).opacity! - 1) < 0.02, easing);
  }
});

test('tumble accelerates to its landing and sway returns to rest', () => {
  const fall = a({ type: 'tumble', easing: 'in', delay: 0.5, by: [40, 400], distance: 20 });
  assert.equal(duringEffect(fall, 14, FPS).transform, 'translate(0px, 0px) rotate(0deg)');
  assert.equal(duringEffect(fall, 30, FPS).transform, 'translate(10px, 100px) rotate(5deg)');
  assert.equal(duringEffect(fall, 45, FPS).transform, 'translate(40px, 400px) rotate(20deg)');
  assert.equal(duringEffect(fall, 90, FPS).transform, duringEffect(fall, 45, FPS).transform);
  const sway = a({ type: 'sway', duration: 2, delay: 0.5, distance: 20 });
  const angle = (frame: number) => Number(duringEffect(sway, frame, FPS).transform!.slice(7, -4));
  assert.equal(angle(0), 0);
  assert.ok(angle(30) > 0);
  assert.ok(angle(60) < 0);
  assert.equal(angle(75), 0);
  assert.equal(angle(150), 0);
});

test('an element leaves before its last frame', () => {
  const out = a({ type: 'fade', duration: 0.5 });
  const lifetime = 90;
  assert.deepEqual(exitEffect(out, 0, FPS, lifetime), {}, 'not leaving yet');
  assert.equal(exitEffect(out, lifetime, FPS, lifetime).opacity, 0, 'gone by the end');
  const mid = exitEffect(out, lifetime - 8, FPS, lifetime).opacity!;
  assert.ok(mid > 0 && mid < 1, `partway out, got ${mid}`);
});

test('exit none leaves the element alone', () => {
  assert.deepEqual(exitEffect(a({ type: 'none' }), 89, FPS, 90), {});
});

test('a departure fades evenly rather than snapping away', () => {
  // out(poly(5)) is ~0.76 by a quarter of the way through, which reads as an
  // element vanishing and then an empty frame. Exits default to linear.
  const out = a({ type: 'fade', duration: 1, easing: 'linear' });
  const lifetime = 60; // 2s at 30fps, so the exit occupies the last 30 frames
  const halfway = exitEffect(out, lifetime - 15, FPS, lifetime).opacity!;
  assert.ok(Math.abs(halfway - 0.5) < 0.05, `expected ~0.5 remaining, got ${halfway}`);
});
