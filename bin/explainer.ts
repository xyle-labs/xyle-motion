#!/usr/bin/env node
// ponytail: README §27 also lists `research` and `story`. Those are not
// software — they are the agent writing research.md and story.md, which it can
// already do with a text editor. A CLI command that shells out to a model would
// bolt a provider dependency onto a toolkit whose whole point (§46 Rule 10) is
// not to have one. The Skill drives them in Phase 5.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { remotionArgs as renderArgs, remotionCwd, runRemotion } from '../src/remotion.ts';
import { PACKAGE_ROOT } from '../src/paths.ts';
import { parseArgs } from 'node:util';
import { parse, parseDocument } from 'yaml';
import { z } from 'zod';
import {
  enhanceRecording, musicPath, musicMixFilter, resolveAudio, wavSeconds,
} from '../src/audio.ts';
import { prune, rendererFingerprint, sceneKey } from '../src/cache.ts';
import { resolveAssets, scan } from '../src/library.ts';
import { VideoSpec } from '../src/schema.ts';
import { applyTheme, loadTheme, type Palette } from '../src/theme.ts';
import { startRecordingStudio } from '../src/recording.ts';
import { importRecording } from '../src/import-recording.ts';
import { renderRecordingPreview } from '../src/recording-preview.ts';
import { createReview, renderIdentity, saveRenderManifest } from '../src/review.ts';

const USAGE = `usage:
  explainer new           <video-directory>
  explainer inspect       <video-directory> [--scene id]
  explainer validate      <video-directory>
  explainer assets        <video-directory>              library contents, * = used here
  explainer enhance       <video-directory> --scene id --input recording.m4a
  explainer import        <video-directory> --scene id --input take.mp3  decode only
  explainer mix           <video-directory> --scene id   final timeline music + voice/effects
  explainer record        <video-directory> [--port 4318] teleprompter and voice studio
  explainer review        <video-directory> [--note text] portable review bundle
  explainer preview       <video-directory> [--scene id]
  explainer frame         <video-directory> [--scene id] [--time seconds]
  explainer contact-sheet <video-directory> [--frames n] every scene on one page
  explainer render        <video-directory> [--scene id]  unchanged scenes are reused

--help, -h prints this help. --scene times are relative to the selected scene.
preview and render --scene omit the music bed; use mix for scene audio review.`;

function argumentsFromCli() {
  try { return parseArgs({
  allowPositionals: true,
  options: {
    help: { type: 'boolean', short: 'h' },
    scene: { type: 'string' },
    time: { type: 'string' },
    frames: { type: 'string' },
    input: { type: 'string' },
    port: { type: 'string' },
    note: { type: 'string' },
  },
  }); } catch (error) { return die(`${(error as Error).message}\n${USAGE}`); }
}
const { values, positionals } = argumentsFromCli();
if (values.help) { console.log(USAGE); process.exit(0); }
const [command, target] = positionals;
const project = target ? basename(resolve(target)) : '';
if (!command || !target) die(USAGE);
if (!['new', 'inspect', 'validate', 'assets', 'enhance', 'import', 'mix', 'review', 'record', 'preview', 'frame', 'contact-sheet', 'render'].includes(command)) die(USAGE);

const dir = resolve(target);
const outDir = join(dir, 'output');
if (command === 'inspect') {
  const result = spawnSync(process.execPath, [join(PACKAGE_ROOT, 'skills/xyle-motion/scripts/context.mjs'), dir, ...(values.scene ? [values.scene] : [])], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

if (command === 'new') {
  if (existsSync(dir)) die(`${dir} already exists`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'brief.md'), brief(project));
  writeFileSync(join(dir, 'video.yaml'), starter(project));
  console.log(`created ${dir}/brief.md and ${dir}/video.yaml
next:  explainer validate ${JSON.stringify(dir)}`);
  process.exit(0);
}

let palette: Palette = {};
const loaded = loadSpec(join(dir, 'video.yaml'));

if (command === 'import') {
  if (!values.scene || !values.input) die('import needs --scene id --input recording.wav (or MP3/M4A/OGG/WebM)');
  try {
    const result = importRecording(dir, values.scene, resolve(values.input));
    console.log(`attached ${result.seconds.toFixed(2)}s decoded narration to ${values.scene}: ${result.file}`);
  } catch (error) { die((error as Error).message); }
  process.exit(0);
}

if (command === 'mix') {
  if (!values.scene) die('mix needs --scene id');
  try {
    const result = await renderRecordingPreview(dir, loaded, values.scene);
    const scene = loaded.scenes.find(scene => scene.id === values.scene)!;
    if (scene.narration && !scene.narration.audio)
      console.log(`script awaiting recording (silent): ${scene.id}`);
    console.log(`scene mix (${loaded.video.music ? 'music + attached narration/effects' : 'no music configured; attached narration/effects'}): ${result.output}`);
  } catch (error) { die((error as Error).message); }
  process.exit(0);
}

if (command === 'review') {
  let identity: string | undefined;
  try {
    const resolved = resolveAssets(loaded, undefined, dir);
    const sound = resolveAudio(loaded, dir);
    if (!resolved.errors.length && !sound.errors.length)
      identity = renderIdentity(loaded, dir, resolved.assets, palette, sound.audio);
  } catch { /* The review page labels inputs it cannot verify. */ }
  console.log(createReview(dir, loaded, identity, values.note));
  process.exit(0);
}

if (command === 'record') {
  if (values.scene) die('record opens the whole project; choose a scene in the studio');
  const port = Number(values.port ?? 4318);
  if (!Number.isInteger(port) || port < 0 || port > 65535) die('--port must be 0–65535');
  const { url, server } = await startRecordingStudio(resolve(dir), port);
  console.log(`Narration studio: ${url}\nKeep this command running. Ctrl+C stops the studio.`);
  await new Promise<void>((done) => server.once('close', done));
  process.exit(0);
}

// One scene in isolation (README §24, §64). Narrowing the spec itself means
// preview, frame and render all get this for free.
const spec = values.scene
  ? { ...loaded, scenes: keepScene(loaded, values.scene) }
  : loaded;

if (loaded.video.music && (command === 'preview' || (command === 'render' && values.scene)))
  console.log('Music bed omitted from this preview. Use mix --scene for the final timeline balance.');

// Asset references are checked here rather than in the Zod schema: the schema
// also runs in the browser, where there is no library to look at.
const { assets, errors } = resolveAssets(spec, undefined, dir);
if (errors.length) die(errors.join('\n'));

if (command === 'assets') {
  const library = scan();
  const used = new Set(Object.keys(assets));
  for (const id of used)
    if (id.startsWith('file:')) library.set(id, resolve(dir, id.slice(5)));
  for (const [id, path] of library)
    console.log(`${used.has(id) ? '*' : ' '} ${id.padEnd(30)} ${path}`);
  console.log(`\n${used.size} of ${library.size} used by ${project}  (* = used)`);
  process.exit(0);
}

if (command === 'enhance') {
  if (!values.scene || !values.input) die('enhance needs --scene id --input recording.wav (or m4a/mp3)');
  const scene = spec.scenes[0];
  if (!scene.narration) die(`scene "${scene.id}" needs narration.text first`);
  try {
    const output = enhanceRecording(resolve(values.input), join(dir, 'recordings', 'enhanced'));
    const seconds = wavSeconds(output)!;
    if (seconds > scene.duration + 0.05)
      die(`recording is ${seconds.toFixed(2)}s; scene "${scene.id}" is ${scene.duration}s. Retake or lengthen the scene. YAML unchanged; cleaned take: ${output}`);
    const path = join(dir, 'video.yaml');
    const document = parseDocument(readFileSync(path, 'utf8'));
    const index = loaded.scenes.findIndex((s) => s.id === scene.id);
    document.setIn(['scenes', index, 'narration', 'audio'], relative(dir, output));
    writeFileSync(path, document.toString({ lineWidth: 0 }));
    console.log(`attached ${seconds.toFixed(2)}s recorded voice to ${scene.id}: ${output}`);
  } catch (error) {
    die((error as Error).message);
  }
  process.exit(0);
}

const { audio, errors: audioErrors, unrecorded } = resolveAudio(spec, dir);
if (audioErrors.length) die(audioErrors.join('\n'));
if (unrecorded.length)
  console.log(`scripts awaiting recording (silent): ${unrecorded.join(', ')}`);
if (spec.video.music && !existsSync(musicPath(spec.video.music.file, dir)))
  die(`no music file at ${musicPath(spec.video.music.file, dir)}`);

if (command === 'validate') {
  const seconds = spec.scenes.reduce((sum, s) => sum + s.duration, 0);
  console.log(
    `ok  ${spec.video.id}  ${spec.scenes.length} scenes  ${seconds}s  ` +
      `${spec.video.width}x${spec.video.height}@${spec.video.fps}  ` +
      `${Object.keys(assets).length} assets  ` +
      `${Object.keys(audio).length} audio`,
  );
  process.exit(0);
}

// The renderer is a pure function of its props: it never reads the filesystem,
// so the spec and the SVG sources travel to it as Remotion input props.
mkdirSync(outDir, { recursive: true });
const propsFile = join(outDir, 'props.json');
const perScene = Number(values.frames ?? 1);
if (!Number.isInteger(perScene) || perScene < 1) die('--frames takes a whole number >= 1');
writeFileSync(propsFile, JSON.stringify({ spec, assets, palette, audio, perScene }));

if (command === 'render' && !values.scene) renderByScene();

process.exit(runRemotion(remotionArgs()));

/** Render each scene once, keyed by everything that affects its pixels, then
 *  stitch. ffmpeg comes with Remotion, so this adds no dependency. */
function renderByScene(): never {
  const cacheDir = join(outDir, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  const fingerprint = rendererFingerprint();
  const parts: string[] = [];
  let reused = 0;

  for (const scene of spec.scenes) {
    const key = sceneKey(scene, spec.video, assets, palette, fingerprint, audio);
    const part = join(cacheDir, `${scene.id}-${key}.mp4`);

    if (existsSync(part)) {
      reused++;
    } else {
      const scenePropsFile = join(cacheDir, `${scene.id}.props.json`);
      writeFileSync(
        scenePropsFile,
        JSON.stringify({ spec: { ...spec, scenes: [scene] }, assets, palette, audio }),
      );
      const rendered = runRemotion(
        // Every part needs an audio stream or the concat refuses to splice a
        // silent scene onto a narrated one.
        ['render', 'Video', part, `--props=${scenePropsFile}`, '--enforce-audio-track'],
      );
      if (rendered !== 0) die('Scene render failed; see the renderer diagnostic above.');
    }
    parts.push(part);
    prune(cacheDir, scene.id, key);
  }

  // Each part's container reports ~0.05s more than its frames occupy, and the
  // concat demuxer offsets by that, freezing ~1.5 frames at every join. The
  // spec knows the true duration, so state it.
  const list = join(cacheDir, 'parts.txt');
  writeFileSync(
    list,
    spec.scenes
      .map((scene, i) => `file '${resolve(parts[i]).replaceAll("'", "'\\''")}'\nduration ${scene.duration.toFixed(3)}`)
      .join('\n') + '\n',
  );
  const output = join(outDir, `${project}.mp4`);
  const music = spec.video.music;
  // With music, the concat lands in a temp file and the bed is mixed over the
  // whole timeline. Baking it per scene would restart it at every cut.
  const stitched = music ? join(cacheDir, 'stitched.mp4') : output;

  const joined = spawnSync(
    process.execPath,
    renderArgs(['ffmpeg', '-f', 'concat', '-safe', '0', '-i', list,
      ...parts.flatMap(part => ['-i', part]),
      // AAC parts include encoder padding. Trim decoded audio before joining;
      // stream-copying their packets shifts later narration/effects off the video.
      '-filter_complex', spec.scenes.map((scene, i) =>
        `[${i + 1}:a]atrim=duration=${scene.duration},asetpts=PTS-STARTPTS[a${i}]`).join(';') +
        `;${parts.map((_, i) => `[a${i}]`).join('')}concat=n=${parts.length}:v=0:a=1[voice]`,
      '-map', '0:v', '-map', '[voice]', '-c:v', 'copy', '-c:a', 'aac', '-y', stitched]),
    { stdio: ['inherit', 'inherit', 'inherit'], cwd: remotionCwd() },
  );
  if (joined.status !== 0) die(joined.error?.message ?? `Stitch failed (${joined.status})`);

  if (music) {
    // a bare name resolves in the shared library; a path resolves in the project
    const track = musicPath(music.file, dir);
    const duration = spec.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    const mixed = spawnSync(
      process.execPath,
      renderArgs([
        'ffmpeg',
        '-i', stitched,
        '-stream_loop', '-1', '-i', track,
        '-filter_complex',
        musicMixFilter(music.volume, duration),
        '-map', '0:v', '-map', '[out]',
        '-c:v', 'copy', '-shortest', '-y', output,
      ]),
      { stdio: ['inherit', 'inherit', 'inherit'], cwd: remotionCwd() },
    );
    if (mixed.status !== 0) die(mixed.error?.message ?? `Music mix failed (${mixed.status})`);
  }
  saveRenderManifest(dir, spec, output, renderIdentity(spec, dir, assets, palette, audio));
  console.log(
    `${spec.scenes.length - reused} rendered, ${reused} reused  ->  ${output}`,
  );
  process.exit(0);
}

function remotionArgs(): string[] {
  const props = `--props=${propsFile}`;
  const suffix = values.scene ? `-${values.scene}` : '';
  switch (command) {
    case 'preview':
      return ['studio', props];
    case 'render':
      return [
        'render', 'Video', join(outDir, `${project}${suffix}.mp4`), props,
        '--enforce-audio-track',
      ];
    case 'contact-sheet':
      return ['still', 'ContactSheet', join(outDir, 'contact-sheet.png'), props];
    case 'frame': {
      const seconds = Number(values.time ?? 0);
      if (!Number.isFinite(seconds)) die('--time takes a number of seconds');
      return [
        'still', 'Video', join(outDir, `frame${suffix}-${seconds}s.png`), props,
        `--frame=${Math.round(seconds * spec.video.fps)}`,
      ];
    }
    default:
      return die(USAGE);
  }
}

function keepScene(spec: VideoSpec, id: string) {
  const kept = spec.scenes.filter((s) => s.id === id);
  if (!kept.length)
    die(`no scene "${id}" — this project has: ${spec.scenes.map((s) => s.id).join(', ')}`);
  return kept;
}

function loadSpec(path: string): VideoSpec {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return die(`no such project file: ${path}\n(create it with: explainer new ${project})`);
  }
  const document = parse(raw);
  // The theme is applied to the raw YAML before validation, so Zod's own
  // colour defaults only fill in where the theme said nothing.
  try {
    if (document?.video?.theme) palette = loadTheme(document.video.theme);
  } catch (error) {
    return die(String((error as Error).message));
  }
  const result = VideoSpec.safeParse(applyTheme(document, palette));
  if (result.success) return result.data;
  return die(`${path}\n${z.prettifyError(result.error)}`);
}

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

// ponytail: `new` writes the two files that must exist to render something.
// README §7 also lists research.md, sources.yaml, story.md and storyboard.yaml
// — those get created when they have content, not as empty headings to fill in.
function brief(id: string) {
  return `# Brief

Topic: ${id}

Audience:
General public

Goal:
What should the viewer understand afterwards?

Format:
9:16 vertical

Duration:
60 seconds

Language:
English

Narration:
Recorded human voice + concise on-screen text (silent until recorded)
`;
}

function starter(id: string) {
  return `version: 1

video:
  id: ${JSON.stringify(id)}
  width: 1080
  height: 1920
  fps: 30
  theme: neutral
  music: { file: daybreak, volume: 0.18 }

scenes:
  - id: intro
    duration: 4
    elements:
      - id: title
        type: text
        text: ${JSON.stringify(id)}
        enter: { type: slide-up, duration: 0.7 }
`;
}
