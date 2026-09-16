import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
