// README §33. Measured before building: a render invocation costs ~3.6s fixed
// plus ~0.017s/frame, so splitting a 60s video into 8 scene renders costs about
// 30% more on a cold cache and roughly 5x less on every render after that. The
// second render is the common one — you render, watch, fix one scene, render.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { VideoSpec } from './schema.ts';

const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

/** Files whose contents change what a scene looks like. Hashing the sources
 *  beats a hand-bumped RENDERER_VERSION constant, which nobody remembers. */
import { PACKAGE_ROOT, SOURCE_ROOT, COMPILED } from './paths.ts';
const RENDERER = COMPILED
  ? ['Root.js', 'animations.js', 'layout.js', 'schema.js']
  : ['Root.tsx', 'animations.ts', 'layout.ts', 'schema.ts'];

export function rendererFingerprint(root = SOURCE_ROOT): string {
  const sources = RENDERER.map((f) => readFileSync(join(root, f), 'utf8'));
  const remotion = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'))
    .dependencies?.remotion;
  return sha([sources, remotion]);
}

/** Everything that can change this scene's pixels — and nothing else, so an
 *  edit to scene 3 does not invalidate scene 5. */
export function sceneKey(
  scene: VideoSpec['scenes'][number],
  video: VideoSpec['video'],
  assets: Record<string, string>,
  palette: Record<string, string>,
  fingerprint: string,
  audio: Record<string, string> = {},
): string {
  const used = scene.elements
    .filter((e) => e.type === 'asset' && e.asset)
    .map((e) => [e.asset, assets[e.asset!]]);
  const heard = [
    ...scene.elements.filter((e) => e.sound).map((e) => audio[`sound:${e.sound!.id}`]),
    audio[`narration:${scene.id}`],
  ];
  // `music` is mixed at the stitch and is in no scene's pixels or audio, so it
  // must not invalidate every scene when someone swaps the track.
  const { music, ...pixels } = video;
  return sha([scene, pixels, used, heard, palette, fingerprint]);
}

/** Drop this scene's earlier renders, so the cache does not grow forever. */
export function prune(dir: string, sceneId: string, keep: string, ext = '.mp4') {
  for (const file of readdirSync(dir))
    if (file.startsWith(`${sceneId}-`) && file.endsWith(ext) && file !== `${sceneId}-${keep}${ext}`)
      unlinkSync(join(dir, file));
}
