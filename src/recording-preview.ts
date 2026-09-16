// Render an unapplied take through the normal scene renderer, then add the bed.
import { spawn } from 'node:child_process';
import { remotionArgs, remotionCwd, rendererDiagnostic } from './remotion.ts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { musicMixFilter, musicPath, narrationRanges, resolveAudio } from './audio.ts';
import { rendererFingerprint } from './cache.ts';
import { resolveAssets } from './library.ts';
import { loadTheme } from './theme.ts';
import type { VideoSpec } from './schema.ts';

async function run(command: string, args: string[]) {
  await new Promise<void>((done, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000, cwd: remotionCwd() });
    let log = '';
    const collect = (chunk: Buffer) => { log = (log + chunk).slice(-3000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? done() : reject(new Error(command === process.execPath ? rendererDiagnostic(log) : `Scene mix failed: ${log}`)));
  });
}

export async function renderRecordingPreview(directory: string, spec: VideoSpec, sceneId: string, processed?: { file: string; duration: number }) {
  const index = spec.scenes.findIndex((s) => s.id === sceneId);
  if (index < 0) throw new Error('Preview scene is missing.');
  const original = spec.scenes[index];
  const scene = processed ? { ...original, duration: processed.duration, narration: { ...original.narration!, audio: processed.file } } : original;
  const previewSpec = { ...spec, scenes: [scene] };
  const project = directory;
  const { assets, errors } = resolveAssets(previewSpec, undefined, project);
  const { audio, errors: audioErrors } = resolveAudio(previewSpec, project);
  if (errors.length || audioErrors.length) throw new Error([...errors, ...audioErrors].join('\n'));
  const palette = spec.video.theme ? loadTheme(spec.video.theme) : {};
  const props = JSON.stringify({ spec: previewSpec, assets, palette, audio });
  const offset = spec.scenes.slice(0, index).reduce((sum, s) => sum + s.duration, 0);
  const duration = spec.scenes.reduce((sum, s) => sum + s.duration, 0) + scene.duration - original.duration;
  const music = spec.video.music;
  const track = music ? musicPath(music.file, project) : undefined;
  const ranges = music?.ducking ? narrationRanges({ ...spec, scenes: spec.scenes.map((s, i) => i === index ? scene : s) }, project) : [];
  const filter = musicMixFilter(music?.volume ?? 0, duration, offset, ranges);
  const key = createHash('sha256').update(props).update(rendererFingerprint())
    .update(readFileSync(new URL(import.meta.url)))
    .update(filter)
    .update(track ? readFileSync(track) : '').digest('hex').slice(0, 24);
  const cache = join(directory, processed ? 'recordings' : 'output', 'previews');
  const output = join(cache, `${key}.mp4`);
  if (existsSync(output)) return { key, duration: scene.duration, output };
  mkdirSync(cache, { recursive: true });
  const propsFile = join(cache, `${key}.json`);
  const rendered = join(cache, `${key}.scene.mp4`);
  const mixed = join(cache, `${key}.tmp.mp4`);
  try {
    writeFileSync(propsFile, props);
    await run(process.execPath, remotionArgs(['render', 'Video', rendered, `--props=${propsFile}`, '--enforce-audio-track', '--scale=0.5']));
    if (music && track) {
      await run('ffmpeg', ['-v', 'error', '-nostdin', '-i', rendered,
        '-stream_loop', '-1', '-ss', String(offset), '-i', track,
        '-filter_complex', filter,
        '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac',
        '-t', String(scene.duration), '-movflags', '+faststart', '-y', mixed]);
      renameSync(mixed, output);
    } else renameSync(rendered, output);
    return { key, duration: scene.duration, output };
  } finally {
    for (const file of [propsFile, rendered, mixed]) rmSync(file, { force: true });
  }
}
