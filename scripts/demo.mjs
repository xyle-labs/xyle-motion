import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

// The tutorial explains install → use → results. Commands and edits are checked
// against an installed package; the agent prompts are illustrative requests.
const [packagePath, destination, mode] = process.argv.slice(2);
assert.ok(packagePath && destination && (!mode || mode === '--prepare'),
  'usage: node scripts/demo.mjs /installed/package /new/external/directory [--prepare]');
const pkg = resolve(packagePath), root = resolve(destination);
assert.ok(!root.startsWith(pkg + '/') && root !== pkg, 'Keep demo output outside the package');
mkdirSync(root);
const require = createRequire(join(pkg, 'package.json'));
const { parse, stringify } = require('yaml');
const cli = join(pkg, 'dist/bin/explainer.js');
const video = join(root, 'videos/first-video');
const guide = join(root, 'walkthrough');
mkdirSync(guide);
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 240_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} failed\n${result.error ?? ''}\n${result.stderr}\n${result.stdout.slice(-3000)}`);
  return result.stdout;
};
const call = (...args) => run(process.execPath, [cli, ...args]);
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (values, x, y, size = 34, fill = '#1d3242', mono = false) => values.map((value, i) =>
  `<text xml:space="preserve" x="${x}" y="${y + i * (size + 17)}" font-family="${mono ? 'monospace' : 'sans-serif'}" font-size="${size}" fill="${fill}">${escape(value)}</text>`).join('');
const terminal = values => `<rect x="64" y="240" width="1152" height="340" rx="18" fill="#1d3242"/>${text(values, 92, 291, 32, '#f5f9f9', true)}`;
const prompt = values => `<rect x="64" y="245" width="1152" height="285" rx="18" fill="#e3efed"/>${text(['Example request to your coding agent'], 92, 292, 24, '#126e70')}${text(values, 92, 350, 32)}`;
const scenes = [];
copyFileSync(join(pkg, 'library/identity/xyle-motion-logo.svg'), join(guide, 'logo.svg'));

function panel(id, chapter, title, content, notes, duration, images = []) {
  const labels = ['1  INSTALL', '2  USE WITH AN AGENT', '3  WHAT YOU GET'];
  const tabs = labels.map((label, i) => `<rect x="${64 + i * 392}" y="107" width="368" height="44" rx="8" fill="${chapter === i + 1 ? '#126e70' : '#e3efed'}"/>${text([label], 84 + i * 392, 137, 22, chapter === i + 1 ? '#ffffff' : '#536b76')}`).join('');
  writeFileSync(join(guide, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <rect width="1280" height="720" fill="#f5f9f9"/>
    ${tabs}${text([title], 64, 211, 44)}${content}
    ${text(notes, 64, 616, 28, '#126e70')}
    ${text(['Silent tutorial · pause the MP4 to follow commands · full steps in the quickstart'], 64, 708, 18, '#536b76')}
    </svg>`);
  scenes.push({ id, duration, elements: [
    { id: 'panel', type: 'asset', file: `${id}.svg`, width: 1280, height: 720, enter: { type: 'appear' }, exit: { type: 'none' } },
    { id: 'logo', type: 'asset', file: 'logo.svg', x: 207, y: 48, width: 286, height: 68, enter: { type: 'appear' }, exit: { type: 'none' } },
    ...images,
  ] });
}
const save = () => writeFileSync(join(guide, 'video.yaml'), stringify({ version: 1, video: { id: 'workflow', width: 1280, height: 720, fps: 20, background: '#f5f9f9' }, scenes }));

panel('build', 1, 'Build the development preview', terminal([
  'git clone https://github.com/xyle-labs/xyle-motion.git',
  'cd xyle-motion',
  'npm ci',
  'npm run security:setup',
  'npm pack',
]), ['Start with Node.js 24 and npm installed.', 'This creates a .tgz package. Motion is not on npm yet.'], 12);
if (mode === '--prepare') {
  save(); call('validate', guide); call('frame', guide, '--scene', 'build', '--time', '2');
  console.log(`Representative frame: ${join(guide, 'output/frame-build-2s.png')}`);
  process.exit(0);
}

panel('install', 1, 'Install the package in your own project', terminal([
  'cd /path/to/your-project',
  'npm install --save-dev --save-exact \\',
  '  /path/to/xyle-labs-motion-0.1.0-dev.0.tgz',
]), ['Use the actual .tgz path from the previous screen.', 'Your project owns the videos. The package supplies the engine.'], 11);
panel('skill', 1, 'Give your agent the Motion skill', terminal([
  'mkdir -p .agents/skills',
  'cp -R \\',
  '  node_modules/@xyle-labs/motion/skills/xyle-motion \\',
  '  .agents/skills/xyle-motion',
]), ['Run this in your project. Copy the whole skill folder once.', 'Keep an existing skill. Invoke the skill in chat with $xyle-motion.'], 11);
mkdirSync(join(root, '.agents/skills'), { recursive: true });
cpSync(join(pkg, 'skills/xyle-motion'), join(root, '.agents/skills/xyle-motion'), { recursive: true });
assert.ok(readFileSync(join(root, '.agents/skills/xyle-motion/SKILL.md'), 'utf8').includes('inspect'));

call('demo', video);
call('assets', video);
assert.match(call('validate', video), /2 scenes\s+6s/);
call('frame', video, '--scene', 'idea', '--time', '1.5');
copyFileSync(join(video, 'output/frame-idea-1.5s.png'), join(guide, 'before.png'));
assert.match(call('render', video), /2 rendered, 0 reused/);
panel('first-video', 2, 'Try a complete six-second example', terminal([
  'npm exec -- explainer demo videos/first-video',
  'npm exec -- explainer render videos/first-video',
]), ['Run these in your project after installation.', 'The first render downloads a browser. No provider key is needed.'], 9);
panel('request', 2, 'Use plain language to request a change', prompt([
  '$xyle-motion Inspect videos/first-video.',
  'Change only the first title to:',
  '“Clear ideas, made visible.” Keep scene two. Render a draft.',
]), ['The skill guides the agent through inspection, edits and checks.', 'The next screen shows the same edit verified with the CLI.'], 11);
assert.match(call('inspect', video, '--scene', 'idea'), /An idea, made visible/);
const yaml = join(video, 'video.yaml');
const spec = parse(readFileSync(yaml, 'utf8'));
const untouched = stringify(spec.scenes[1]);
spec.scenes[0].elements[0].text = 'Clear ideas, made visible.';
writeFileSync(yaml, stringify(spec));
assert.equal(stringify(parse(readFileSync(yaml, 'utf8')).scenes[1]), untouched);
call('validate', video);
call('frame', video, '--scene', 'idea', '--time', '1.5');
copyFileSync(join(video, 'output/frame-idea-1.5s.png'), join(guide, 'after.png'));
assert.match(call('render', video), /1 rendered, 1 reused/);
assert.match(call('render', video), /0 rendered, 2 reused/);
panel('edit', 2, 'One request. One scene changes.',
  text(['BEFORE'], 90, 270, 26, '#536b76') + text(['AFTER'], 704, 270, 26, '#126e70'),
  ['The agent edits video.yaml. The source stays editable.', 'Scene two stays intact; its cached render is reused.'], 8,
  ['before', 'after'].map((name, i) => ({ id: name, type: 'asset', file: `${name}.png`, x: 338 + i * 604, y: 435, width: 548, height: 308,
    enter: { type: 'fade', delay: i * 0.4, duration: 0.35 }, exit: { type: 'none' } })));
panel('own-topic', 2, 'Create from your project knowledge', prompt([
  '$xyle-motion Create a 30-second explainer from docs/topic.md.',
  'Use the project brand. Show a story plan and a sample frame.',
  'After approval, render a draft for review.',
]), ['Put the brief, facts and brand guidance in your project.', 'The agent writes scene YAML; the shared renderer makes the video.'], 11);
panel('outputs', 3, 'Get a video and its editable source',
  `<rect x="64" y="242" width="1152" height="336" rx="18" fill="#e3efed"/>` + text([
    'videos/first-video/',
    '  video.yaml                  editable scenes and timings',
    '  brief.md                    the story and review status',
    '  output/first-video.mp4       the rendered video',
    '  output/review/index.html    the review page',
  ], 92, 294, 28, '#1d3242', true),
  ['The MP4 is ready to watch. The YAML is ready to revise.', 'Keep recordings and project artwork beside the video.'], 10);
panel('benefits', 3, 'Why revisions take less repeated work',
  [
    { title: 'LESS CONTEXT', lines: ['Inspect the scene', 'being changed.'] },
    { title: 'REUSE CODE + ART', lines: ['Use one renderer', 'and bundled assets.'] },
    { title: 'REUSE RENDERS', lines: ['One scene changed:', '1 rendered, 1 reused.'] },
  ].map((item, i) => `<rect x="${64 + i * 392}" y="260" width="368" height="288" rx="18" fill="#e3efed"/>${text([item.title], 88 + i * 392, 319, 24, '#126e70')}${text(item.lines, 88 + i * 392, 386, 27)}`).join(''),
  ['Focused context and reuse can reduce agent token use.', 'Savings depend on the task and agent; no token benchmark yet.'], 10);
call('contact-sheet', video, '--frames', '3');
call('review', video, '--note', 'Demo; playback and listening review pending.');
assert.match(readFileSync(join(video, 'output/review/index.html'), 'utf8'), /Current: rendered inputs/);
panel('review', 3, 'Review the draft, then share it', terminal([
  'npm exec -- explainer review videos/first-video',
  '',
  '# Open this file:',
  'videos/first-video/output/review/index.html',
]), ['Watch the video and check each scene before approval.', 'Share the review folder. Keep the YAML for the next revision.'], 9);
writeFileSync(join(guide, 'brief.md'), '# Motion getting-started tutorial\n\nThree chapters: install, use with an agent, and outputs/benefits.\nOne action per screen, 8–12 second holds, large text. Prompts are illustrative;\nthe example edits, cache reuse and review freshness are verified with the CLI.\nSilent video and GIF; a real six-second export follows the tutorial.\nProduction status: visual/playback review pending. Token savings are not benchmarked.\n');
save();
call('validate', guide);
call('contact-sheet', guide, '--frames', '3');
call('render', guide);
// Keep the tutorial silent throughout; viewers can pause and copy the written steps.
run('ffmpeg', ['-v', 'error', '-i', join(guide, 'output/walkthrough.mp4'), '-i', join(video, 'output/first-video.mp4'),
  '-filter_complex', '[0:v]setsar=1[v0];[1:v]scale=1280:720,fps=20,setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
  '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', join(root, 'workflow.mp4')]);
run('ffmpeg', ['-v', 'error', '-i', join(root, 'workflow.mp4'), '-filter_complex',
  'fps=6,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
  '-an', '-loop', '0', '-map_metadata', '-1', join(root, 'workflow.gif')]);
console.log(`Tutorial ready: ${join(root, 'workflow.mp4')}\nGIF: ${join(root, 'workflow.gif')}`);
