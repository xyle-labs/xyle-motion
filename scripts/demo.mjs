import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

// Rebuild the documentation walkthrough from an installed package, in a fresh
// external directory. Source panels summarize verified commands and output for
// readability. This is an illustrated workflow, not a real-time screen capture.
const [packagePath, destination] = process.argv.slice(2);
assert.ok(packagePath && destination, 'usage: node scripts/demo.mjs /installed/package /new/external/directory');
const pkg = resolve(packagePath), root = resolve(destination);
assert.ok(!root.startsWith(pkg + '/') && root !== pkg, 'Keep demo output outside the package');
mkdirSync(root); // Refuse to overwrite a prior run.
const require = createRequire(join(pkg, 'package.json'));
const { parse, stringify } = require('yaml');
const cli = join(pkg, 'dist/bin/explainer.js');
const video = join(root, 'first-video');
const guide = join(root, 'walkthrough');
mkdirSync(guide);
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 240_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} failed\n${result.error ?? ''}\n${result.stderr}\n${result.stdout.slice(-3000)}`);
  return result.stdout;
};
const call = (...args) => run(process.execPath, [cli, ...args]);
const text = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const lines = (values, x, y, size, fill, family = 'sans-serif') => values.map((value, i) =>
  `<text x="${x}" y="${y + i * (size + 12)}" font-family="${family}" font-size="${size}" fill="${fill}">${text(value)}</text>`).join('');
const scenes = [];
copyFileSync(join(pkg, 'library/identity/xyle-motion-logo.svg'), join(guide, 'logo.svg'));
function panel(title, command, output, caption, image) {
  const id = `step-${scenes.length + 1}`;
  writeFileSync(join(guide, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <rect width="960" height="540" fill="#f5f9f9"/>
    ${lines([`${scenes.length + 1} / 5    ${title}`], 36, 125, 30, '#1d3242')}
    <rect x="28" y="155" width="492" height="280" rx="12" fill="#1d3242"/>
    ${lines(command, 48, 192, 19, '#55cbc5', 'monospace')}
    ${lines(output, 48, Math.max(292, 192 + command.length * 31 + 24), 17, '#f5f9f9', 'monospace')}
    ${lines([caption], 36, 480, 22, '#126e70')}
    ${lines(['Illustrated workflow · verified CLI commands · condensed timing'], 36, 516, 15, '#536b76')}
    </svg>`);
  scenes.push({ id, duration: 4.5, elements: [
    { id: 'panel', type: 'asset', file: `${id}.svg`, width: 960, height: 540, enter: { type: 'appear' }, exit: { type: 'none' } },
    { id: 'logo', type: 'asset', file: 'logo.svg', x: 160, y: 47, width: 245, height: 65, enter: { type: 'appear' }, exit: { type: 'none' } },
    { id: 'result', type: 'asset', file: image, x: 738, y: 280, width: 384, height: 216, enter: { type: 'fade', duration: 0.25 }, exit: { type: 'none' } },
  ] });
}

call('demo', video);
call('assets', video);
call('frame', video, '--scene', 'idea', '--time', '1.5');
copyFileSync(join(video, 'output/frame-idea-1.5s.png'), join(guide, 'before.png'));
assert.match(call('render', video), /2 rendered, 0 reused/);
const validation = call('validate', video);
assert.match(validation, /2 scenes\s+6s/);
assert.match(validation, /640x360@30\s+2 assets\s+2 audio/);
panel('Start with an editable example', ['$ explainer demo first-video', '$ explainer validate first-video'],
  ['ok  minimal  2 scenes  6s', '640x360@30  2 assets  2 audio'], 'Bundled artwork, music and effects. No account needed.', 'before.png');
const inspection = call('inspect', video, '--scene', 'idea');
assert.match(inspection, /An idea, made visible/);
panel('Inspect one scene', ['$ explainer inspect first-video \\', '    --scene idea'],
  inspection.split('\n').map(line => line.trim()).filter(line => /^(?:- id: idea|duration: 3|text: An idea|asset: household)/.test(line)),
  'The agent reads the scene, then edits its YAML.', 'before.png');
const yaml = join(video, 'video.yaml');
const spec = parse(readFileSync(yaml, 'utf8'));
spec.scenes[0].elements[0].text = 'Your idea, made visible.';
writeFileSync(yaml, stringify(spec));
call('validate', video);
call('frame', video, '--scene', 'idea', '--time', '1.5');
copyFileSync(join(video, 'output/frame-idea-1.5s.png'), join(guide, 'after.png'));
panel('Edit the source; check a frame', ['# first-video/video.yaml', 'text: Your idea, made visible.', '$ explainer frame first-video \\', '    --scene idea --time 1.5'],
  ['Frame rendered from updated YAML.'], 'An ordinary text edit changes the rendered result.', 'after.png');
const first = call('render', video);
assert.match(first, /1 rendered, 1 reused/);
const second = call('render', video);
assert.match(second, /0 rendered, 2 reused/);
panel('Render once; reuse unchanged scenes', ['$ explainer render first-video', '$ explainer render first-video'],
  ['1 rendered, 1 reused', '0 rendered, 2 reused'], 'Only the edited scene rerenders; unchanged parts are reused.', 'after.png');
call('contact-sheet', video, '--frames', '3');
call('review', video, '--note', 'Demo; playback and listening review pending.');
assert.match(readFileSync(join(video, 'output/review/index.html'), 'utf8'), /Current: rendered inputs/);
panel('Open the review bundle', ['$ explainer review first-video', '# open output/review/index.html'],
  ['video.mp4 + contact-sheet.png', 'Scene navigation + freshness'], 'Watch the export and listen before approving delivery.', 'after.png');
writeFileSync(join(guide, 'brief.md'), '# Motion workflow walkthrough\n\nFive 4.5-second illustrated steps, followed by the real six-second result.\nNo narration. Panels use synthetic content and condensed command output.\nProduction status: frame and playback review pending.\n');
writeFileSync(join(guide, 'video.yaml'), stringify({ version: 1, video: { id: 'workflow', width: 960, height: 540, fps: 20 }, scenes }));
call('validate', guide);
call('contact-sheet', guide, '--frames', '3');
call('render', guide);
run('ffmpeg', ['-v', 'error', '-i', join(guide, 'output/walkthrough.mp4'), '-i', join(video, 'output/first-video.mp4'),
  '-filter_complex', '[0:v]setsar=1[v0];[1:v]scale=960:540,fps=20,setsar=1[v1];[v0][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]',
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', join(root, 'workflow.mp4')]);
run('ffmpeg', ['-v', 'error', '-i', join(root, 'workflow.mp4'), '-filter_complex',
  'fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
  '-an', '-loop', '0', '-map_metadata', '-1', join(root, 'workflow.gif')]);
console.log(`Walkthrough ready: ${join(root, 'workflow.gif')}\nVideo: ${join(root, 'workflow.mp4')}`);
