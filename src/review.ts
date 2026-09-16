import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { musicPath } from './audio.ts';
import { rendererFingerprint } from './cache.ts';
import { CLI_ENTRY, COMPILED, SOURCE_ROOT } from './paths.ts';
import { VideoSpec } from './schema.ts';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderIdentity(spec: VideoSpec, directory: string, assets: object, palette: object, audio: object) {
  return hash(JSON.stringify([spec, assets, palette, audio, rendererFingerprint(),
    hash(readFileSync(CLI_ENTRY)), hash(readFileSync(join(SOURCE_ROOT, COMPILED ? 'audio.js' : 'audio.ts'))),
    spec.video.music ? hash(readFileSync(musicPath(spec.video.music.file, directory))) : null]));
}

export function saveRenderManifest(directory: string, spec: VideoSpec, output: string, identity: string) {
  writeFileSync(join(directory, 'output', 'render-manifest.json'), JSON.stringify({
    spec, identity, output: basename(output), outputHash: hash(readFileSync(output)), renderedAt: new Date().toISOString(),
  }));
}

/** Copy only delivery artifacts; never props, original takes or source-machine paths. */
export function createReview(directory: string, spec: VideoSpec, identity: string | undefined, note = '') {
  const output = join(directory, 'output');
  let manifest: { spec?: unknown; identity?: string; output?: string; outputHash?: string } = {};
  try { manifest = JSON.parse(readFileSync(join(output, 'render-manifest.json'), 'utf8')); } catch { /* No verified render yet. */ }
  const name = manifest.output ?? `${basename(directory)}.mp4`;
  const safe = typeof name === 'string' && basename(name) === name && name.endsWith('.mp4');
  const video = safe ? join(output, name) : '';
  const present = Boolean(video && existsSync(video));
  const status = !present ? 'Missing video: render this project first.'
    : !identity || !manifest.identity || !manifest.outputHash ? 'Unverified output: input or render identity is unavailable.'
    : manifest.identity === identity && manifest.outputHash === hash(readFileSync(video)) ? 'Current: rendered inputs and output match.'
    : 'Stale output: render again to include the current inputs.';
  const rendered = VideoSpec.safeParse(manifest.spec);
  // Chapters must always describe the displayed render, including a stale one.
  const timeline = rendered.success ? rendered.data : undefined;
  let start = 0;
  const chapters = timeline?.scenes.map(scene => {
    const at = start;
    start += Math.round(scene.duration * timeline.video.fps) / timeline.video.fps;
    return `<button type="button" data-time="${at}">${escape(scene.id)} · ${at.toFixed(2)}s</button>`;
  }).join('\n') ?? '';
  const bundle = join(output, 'review');
  mkdirSync(bundle, { recursive: true });
  if (present) copyFileSync(video, join(bundle, 'video.mp4'));
  else rmSync(join(bundle, 'video.mp4'), { force: true });
  const sheet = existsSync(join(output, 'contact-sheet.png'));
  if (sheet) copyFileSync(join(output, 'contact-sheet.png'), join(bundle, 'contact-sheet.png'));
  else rmSync(join(bundle, 'contact-sheet.png'), { force: true });
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(spec.video.id)} — review</title>
<style>body{font:16px system-ui;margin:0 auto;padding:20px;max-width:960px;background:#15181d;color:#f4f4f4}video{width:100%;max-height:70vh}nav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}button{font:inherit;padding:10px;cursor:pointer}a{color:#a8d4ff}code{overflow-wrap:anywhere}p{line-height:1.5}.note{white-space:pre-wrap}</style>
<h1>${escape(spec.video.id)}</h1><p>${escape(status)}</p>
${present ? '<video id="video" controls preload="metadata" src="video.mp4"></video>' : ''}
<nav aria-label="Rendered scenes">${present ? chapters : ''}</nav>
<p>Rendered input identity: <code>${escape(manifest.identity ?? 'unknown')}</code></p>
<p>Current input identity: <code>${escape(identity ?? 'unavailable')}</code></p>
<p>Automated checks: file presence and input/output identity only. Human listening and approval are not inferred.</p>
<h2>Review note</h2><p class="note">${escape(note || 'No human review status supplied.')}</p>
${sheet ? '<p><a href="contact-sheet.png">Existing contact sheet</a> — its revision is not verified.</p>' : '<p>No contact sheet available.</p>'}
<script>const video=document.getElementById('video');document.querySelectorAll('button[data-time]').forEach(button=>button.addEventListener('click',()=>{video.currentTime=Number(button.dataset.time);video.play();}));</script></html>`;
  const path = join(bundle, 'index.html');
  writeFileSync(path, page);
  return path;
}
