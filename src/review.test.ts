import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { createReview, renderIdentity, saveRenderManifest } from './review.ts';
import { VideoSpec } from './schema.ts';

test('review bundles match rendered chapters, expose stale inputs, escape notes and exclude originals', () => {
  const root = mkdtempSync(join(tmpdir(), 'motion-review-'));
  const spec = (duration: number) => VideoSpec.parse({ version: 1, video: { id: '<script>title</script>' }, scenes: [
    { id: 'first', duration, elements: [] }, { id: 'second', duration: 2, elements: [] },
  ] });
  try {
    const one = spec(1), two = spec(2);
    const key = (s: VideoSpec) => renderIdentity(s, root, {}, {}, {});
    assert.notEqual(key(one), key(two));
    const missing = createReview(root, one, key(one));
    assert.match(readFileSync(missing, 'utf8'), /Missing video/);
    const video = join(root, 'output', 'reviewed.mp4');
    writeFileSync(video, 'synthetic rendered bytes');
    writeFileSync(join(root, 'output', 'props.json'), 'private renderer props');
    mkdirSync(join(root, 'recordings')); writeFileSync(join(root, 'recordings', 'original.wav'), 'private original');
    saveRenderManifest(root, one, video, key(one));
    const page = createReview(root, one, key(one), '<script>alert("x")</script>');
    const html = readFileSync(page, 'utf8');
    assert.match(html, /Current: rendered inputs/);
    assert.match(html, /data-time="1">second/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>alert|private original|private renderer props/);
    assert.ok(!html.includes(root));
    assert.deepEqual(readdirSync(join(root, 'output', 'review')).sort(), ['index.html', 'video.mp4']);
    assert.match(readFileSync(createReview(root, two, key(two)), 'utf8'), /Stale output/);
    saveRenderManifest(root, two, video, key(two));
    assert.match(readFileSync(createReview(root, two, key(two)), 'utf8'), /data-time="2">second/);
    writeFileSync(video, 'a replaced output');
    assert.match(readFileSync(createReview(root, two, key(two)), 'utf8'), /Stale output/);
    rmSync(video);
    createReview(root, two, key(two));
    assert.deepEqual(readdirSync(join(root, 'output', 'review')), ['index.html']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('review narration summary follows the displayed render without exposing scripts or take paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'motion-review-narration-'));
  const spec = VideoSpec.parse({ version: 1, video: { id: 'narration-review' }, scenes: [
    { id: 'awaiting-take', duration: 1, narration: { text: 'Private unrecorded script.' }, elements: [] },
    { id: 'attached-take', duration: 1, narration: { text: 'Private recorded script.', audio: 'recordings/private-take.wav' }, elements: [] },
    { id: 'visual-only', duration: 1, elements: [] },
  ] });
  try {
    mkdirSync(join(root, 'output'));
    const video = join(root, 'output', 'video.mp4');
    writeFileSync(video, 'synthetic rendered bytes');
    saveRenderManifest(root, spec, video, 'rendered-inputs');
    const current = readFileSync(createReview(root, spec, 'rendered-inputs'), 'utf8');
    assert.match(current, /Current: rendered inputs/);
    assert.match(current, /1 of 2 scripted scenes have attached narration/);
    assert.match(current, /Scripts awaiting recording \(silent\): awaiting-take\./);
    assert.doesNotMatch(current, /Private unrecorded script|Private recorded script|private-take\.wav|recordings\//);

    const changed = VideoSpec.parse({ ...spec, scenes: [
      { id: 'new-scene', duration: 2, narration: { text: 'A newer private script.' }, elements: [] },
    ] });
    const stale = readFileSync(createReview(root, changed, 'changed-inputs'), 'utf8');
    assert.match(stale, /Stale output/);
    assert.match(stale, /Scripts awaiting recording \(silent\): awaiting-take\./);
    assert.doesNotMatch(stale, /new-scene|newer private script/);

    spec.scenes[0].narration!.audio = 'recordings/another-private-take.wav';
    saveRenderManifest(root, spec, video, 'complete-inputs');
    const complete = readFileSync(createReview(root, spec, 'complete-inputs'), 'utf8');
    assert.match(complete, /2 of 2 scripted scenes have attached narration/);
    assert.doesNotMatch(complete, /Scripts awaiting recording/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('review narration is unavailable without a video and valid rendered timeline', () => {
  const root = mkdtempSync(join(tmpdir(), 'motion-review-no-timeline-'));
  const spec = VideoSpec.parse({ version: 1, video: { id: 'draft' }, scenes: [
    { id: 'current-script', duration: 1, narration: { text: 'Private current script.' }, elements: [] },
  ] });
  const unavailable = /Unavailable: no rendered timeline is available/;
  try {
    assert.match(readFileSync(createReview(root, spec, 'current-inputs'), 'utf8'), unavailable);
    const video = join(root, 'output', `${basename(root)}.mp4`);
    writeFileSync(video, 'synthetic rendered bytes');
    const missing = readFileSync(createReview(root, spec, 'current-inputs'), 'utf8');
    assert.match(missing, unavailable);
    assert.doesNotMatch(missing, /Scripts awaiting recording|Private current script/);

    writeFileSync(join(root, 'output', 'render-manifest.json'), JSON.stringify({ spec: {}, output: basename(video) }));
    assert.match(readFileSync(createReview(root, spec, 'current-inputs'), 'utf8'), unavailable);
    saveRenderManifest(root, spec, video, 'current-inputs');
    rmSync(video);
    assert.match(readFileSync(createReview(root, spec, 'current-inputs'), 'utf8'), unavailable);

    writeFileSync(video, 'synthetic rendered bytes');
    const visualOnly = VideoSpec.parse({ ...spec, scenes: [{ id: 'visual-only', duration: 1, elements: [] }] });
    saveRenderManifest(root, visualOnly, video, 'visual-inputs');
    assert.match(readFileSync(createReview(root, visualOnly, 'visual-inputs'), 'utf8'), /No scripted narration in the rendered timeline/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
