// A local workspace for human takes. Recording and processing are separate
// from the video; only Apply writes narration.audio into the project.
import { spawn, spawnSync } from 'node:child_process';
import { PACKAGE_ROOT, CLI_ENTRY } from './paths.ts';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { decodeRecording, enhanceRecording, wavSeconds, LOCAL_SPEAKERS, neuralVoiceAvailable } from './audio.ts';
import { VideoSpec } from './schema.ts';
import { applyTheme, loadTheme } from './theme.ts';
import { renderRecordingPreview } from './recording-preview.ts';

const Settings = z.strictObject({
  start: z.number().min(0).default(0), end: z.number().positive(),
  lead: z.number().min(0).max(3).default(0.25),
  tone: z.enum(['natural', 'warm', 'bright', 'deep', 'light']).default('natural'),
  noise: z.enum(['gentle', 'isolate', 'lavasr']).default('gentle'),
  speaker: z.enum(LOCAL_SPEAKERS).default('own'),
  pitch: z.number().min(-9).max(9).default(0),
  fit: z.enum(['keep', 'speed', 'extend']).default('keep'),
});
type Settings = z.infer<typeof Settings>;
type Take = {
  id: string; scene: string; text: string; created: string; original: string; raw: string; seconds: number;
  processed?: { file: string; seconds: number; duration: number; speed: number; revision: string; settings: Settings };
};
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const atomic = (path: string, content: string) => {
  writeFileSync(`${path}.tmp`, content);
  renameSync(`${path}.tmp`, path);
};

export const TARGET_WPM = 165;
export const MAX_WPM = 169;

/** Conservative English pacing estimate, including letters and spoken numbers.
 * It is not a transcription or a measurement of the actual performance. */
function spokenUnits(word: string): number {
  return (word.match(/[\p{L}\d]+(?:[’'][\p{L}]+)?/gu) ?? []).reduce((count, part) => {
    if (/^[A-Z]{2,5}$/.test(part)) return count + part.length;
    if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (n < 20) return count + 1;
      if (n < 100) return count + (n % 10 ? 2 : 1);
      if (n < 1000) return count + 2 + (n % 100 ? 1 + spokenUnits(String(n % 100)) : 0);
      return count + part.length; // Longer numbers: allow time for each digit.
    }
    return count + 1;
  }, 0);
}
export const spokenWordCount = (text: string) => text.split(/\s+/).reduce((sum, word) => sum + spokenUnits(word), 0);

export function readingPlan(text: string, duration: number, lead = 0.25) {
  // Punctuation gets a small pause. This guides a human; it isn't speech tracking.
  const words = text.trim().split(/\s+/).filter(Boolean);
  const count = spokenWordCount(text);
  const weights = words.map((word) => spokenUnits(word) + (/[.!?]$/.test(word) ? 0.65 : /[,;:—]$/.test(word) ? 0.3 : 0));
  const minimumWindow = Math.max(0.5, Math.ceil(count * 60 / MAX_WPM * 100) / 100);
  const window = Math.max(0.5, duration - lead - 0.2, Math.ceil(count * 60 / TARGET_WPM * 100) / 100);
  const sum = weights.reduce((a, b) => a + b, 0);
  let time = lead;
  return {
    wpm: Math.round(count * 60 / window), window, minimumWindow, wordCount: count,
    cues: words.map((word, i) => {
      const at = time;
      time += weights[i] / sum * window;
      return { word, at };
    }),
  };
}

export function planVoice(seconds: number, duration: number, input: unknown, text = '') {
  const settings = Settings.parse(input);
  if (settings.end > seconds + 0.01 || settings.start >= settings.end)
    throw new Error('Trim must select a non-empty part of the original take.');
  const length = settings.end - settings.start;
  const available = duration - settings.lead - 0.2;
  if (settings.fit !== 'extend' && available <= 0) throw new Error('The lead-in leaves no reading time.');
  const speed = settings.fit === 'speed' ? Math.max(1, length / Math.max(0.01, available - 0.08)) : 1;
  if (speed > 1.2) throw new Error('This take needs more than 20% speed-up. Trim pauses, retake, or choose Extend scene.');
  if (settings.fit === 'speed' && spokenWordCount(text) * 60 / (length / speed) > MAX_WPM)
    throw new Error('Speed-up would exceed the 169 WPM limit. Keep your pace or extend the scene.');
  if (settings.fit === 'keep' && length > available + 0.01)
    throw new Error('This take is longer than the clip. Trim pauses, choose Gentle speed-up, or Extend scene.');
  const pitch = 2 ** (settings.pitch / 12);
  const tone = { natural: '', warm: 'equalizer=f=180:t=q:w=0.8:g=3', bright: 'equalizer=f=3000:t=q:w=0.8:g=2.5', deep: 'equalizer=f=180:t=q:w=0.8:g=3,lowpass=f=6500', light: 'highpass=f=120,equalizer=f=2800:t=q:w=0.8:g=3' }[settings.tone];
  const filters = [
    `atrim=start=${settings.start}:end=${settings.end}`, 'asetpts=PTS-STARTPTS', 'aresample=48000',
    // Change pitch, then compensate duration independently with atempo.
    `asetrate=${48000 * pitch}`, 'aresample=48000', `atempo=${speed / pitch}`,
    tone, `adelay=${Math.round(settings.lead * 1000)}:all=1`,
  ].filter(Boolean).join(',');
  return { settings, speed, filters };
}

export async function startRecordingStudio(directory: string, port = 4318) {
  const yaml = join(directory, 'video.yaml');
  const takesDir = join(directory, 'recordings', 'takes');
  const token = randomUUID();
  const web = join(PACKAGE_ROOT, 'studio');
  let render: { running: boolean; message: string } = { running: false, message: '' };
  let previewing = false;
  const readProject = () => {
    const source = readFileSync(yaml, 'utf8');
    const document = parseDocument(source);
    if (document.errors.length) throw new Error(document.errors[0].message);
    const raw = document.toJS();
    const palette = raw.video?.theme ? loadTheme(raw.video.theme) : {};
    return { document, spec: VideoSpec.parse(applyTheme(raw, palette)), revision: hash(source) };
  };
  const takePath = (id: string) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid take ID');
    return join(takesDir, `${id}.json`);
  };
  const readTake = (id: string): Take => JSON.parse(readFileSync(takePath(id), 'utf8'));
  const saveTake = (take: Take) => atomic(takePath(take.id), JSON.stringify(take, null, 2));
  const listTakes = (): Take[] => existsSync(takesDir)
    ? readdirSync(takesDir).filter((f) => f.endsWith('.json')).map((f) => readTake(f.slice(0, -5))).sort((a, b) => b.created.localeCompare(a.created)) : [];
  const videoFile = () => {
    const output = join(directory, 'output');
    const canonical = join(output, `${basename(directory)}.mp4`);
    if (existsSync(canonical) || !existsSync(output)) return canonical;
    // A manually renamed export remains usable when it is unambiguous.
    const exports = readdirSync(output).filter((file) => file.endsWith('.mp4'));
    return exports.length === 1 ? join(output, exports[0]) : canonical;
  };
  const state = () => {
    const { spec, revision } = readProject();
    let offset = 0;
    const scenes = spec.scenes.map((scene) => {
      const entry = { id: scene.id, duration: scene.duration, offset, text: scene.narration?.text ?? '', audio: scene.narration?.audio, ...readingPlan(scene.narration?.text ?? '', scene.duration) };
      offset += scene.duration;
      return entry;
    });
    // Successful renders retain their timeline, even if a later render fails.
    const manifest = join(directory, 'output', 'render-manifest.json');
    const props = existsSync(manifest) ? manifest : join(directory, 'output', 'props.json');
    let previewScenes: { id: string; duration: number; offset: number }[] = [];
    let previewCurrent = false;
    if (existsSync(videoFile()) && existsSync(props) && (props === manifest || statSync(props).mtimeMs <= statSync(videoFile()).mtimeMs)) {
      const rendered = JSON.parse(readFileSync(props, 'utf8')).spec;
      let start = 0;
      previewScenes = rendered.scenes.map((s: { id: string; duration: number }) => {
        const entry = { id: s.id, duration: s.duration, offset: start };
        start += s.duration;
        return entry;
      });
      previewCurrent = hash(JSON.stringify(rendered)) === hash(JSON.stringify(spec)) && statSync(videoFile()).mtimeMs >= statSync(yaml).mtimeMs;
    }
    return { project: spec.video.id, revision, neuralAvailable: neuralVoiceAvailable(), maxWpm: MAX_WPM, scenes, takes: listTakes(), video: existsSync(videoFile()), videoVersion: existsSync(videoFile()) ? statSync(videoFile()).mtimeMs : 0, previewScenes, previewCurrent, render };
  };
  let origin = '';
  const server = createServer(async (req, res) => {
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      if (req.headers.host !== new URL(origin).host) return send(403, { error: 'Use the local studio address.' });
      if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Cross-origin requests are blocked.' });
      const url = new URL(req.url!, origin);
      if (req.method === 'GET') {
        if (url.pathname === '/api/state') return send(200, state());
        if (url.pathname === '/api/script') {
          const { scenes, project } = state();
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="reading-script.txt"' });
          return res.end([project, 'Local recording · target 165 spoken words/min or slower', '', ...scenes.filter((s) => s.text).flatMap((s) => [`${s.id} · ${s.duration.toFixed(2)}s clip · ${s.window.toFixed(2)}s reading · approximately ${s.wpm} words/min`, s.text, ''])].join('\n'));
        }
        if (url.pathname === '/media/video') return serveFile(res, videoFile(), 'video/mp4', req.headers.range);
        if (url.pathname === '/media/preview') {
          const key = url.searchParams.get('key') ?? '';
          if (!/^[a-f0-9]{24}$/.test(key)) throw new Error('Invalid preview key');
          return serveFile(res, join(directory, 'recordings', 'previews', `${key}.mp4`), 'video/mp4', req.headers.range);
        }
        if (url.pathname === '/media/take') {
          const take = readTake(url.searchParams.get('id') ?? '');
          const file = url.searchParams.get('version') === 'processed' ? take.processed?.file : take.raw;
          if (!file) throw new Error('Create a voice preview first.');
          return serveFile(res, join(directory, file), 'audio/wav', req.headers.range);
        }
        if (url.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
          return res.end(readFileSync(join(web, 'index.html'), 'utf8').replace('__TOKEN__', token));
        }
        const files: Record<string, string> = { '/studio.js': 'text/javascript', '/studio.css': 'text/css' };
        if (files[url.pathname]) return serveFile(res, join(web, url.pathname.slice(1)), files[url.pathname]);
        return send(404, { error: 'Not found' });
      }
      if (req.method !== 'POST' || req.headers['x-studio-token'] !== token) return send(403, { error: 'Refresh the studio before making changes.' });
      const chunks: Buffer[] = [];
      let size = 0;
      const limit = url.pathname === '/api/take' ? 100 * 1024 * 1024 : 16 * 1024;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) { send(413, { error: 'Recording is too large (maximum 100 MB).' }); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (render.running) return send(409, { error: 'Wait for the video render to finish.' });
      if (previewing) return send(409, { error: 'Wait for the scene preview to finish.' });
      if (url.pathname === '/api/take') {
        const { spec } = readProject();
        const scene = spec.scenes.find((s) => s.id === url.searchParams.get('scene'));
        if (!scene?.narration) throw new Error('Choose a scene with a script.');
        if (url.searchParams.get('script') !== hash(scene.narration.text)) throw new Error('The script changed. Refresh before recording again.');
        if (!body.length) throw new Error('The recording is empty.');
        const id = randomUUID();
        mkdirSync(takesDir, { recursive: true });
        const extensions: Record<string, string> = { 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/x-m4a': 'm4a' };
        const ext = extensions[(req.headers['content-type'] ?? '').split(';')[0]];
        if (!ext) throw new Error('Import WAV, MP3, M4A, OGG or WebM audio.');
        const original = join(takesDir, `${id}.${ext}`);
        const raw = join(takesDir, `${id}-raw.wav`);
        writeFileSync(original, body, { flag: 'wx' });
        const seconds = decodeRecording(original, raw, 600);
        const take: Take = { id, scene: scene.id, text: scene.narration.text, created: new Date().toISOString(), original: relative(directory, original), raw: relative(directory, raw), seconds };
        saveTake(take);
        return send(201, take);
      }
      const data = body.length ? JSON.parse(body.toString()) : {};
      if (url.pathname === '/api/preview') {
        const take = readTake(data.id);
        const { spec, revision } = readProject();
        if (!take.processed || take.processed.revision !== revision) throw new Error('The project changed. Create a fresh voice preview first.');
        if (spec.scenes.find((s) => s.id === take.scene)?.narration?.text !== take.text) throw new Error('This take uses an older script. Record the current line.');
        previewing = true;
        try {
          const result = await renderRecordingPreview(directory, spec, take.scene, take.processed);
          if (readProject().revision !== revision) throw new Error('The project changed during preview. Refresh and try again.');
          return send(200, { url: `/media/preview?key=${result.key}`, duration: result.duration });
        } finally { previewing = false; }
      }
      if (url.pathname === '/api/process') {
        const take = readTake(data.id);
        const { spec, revision } = readProject();
        const scene = spec.scenes.find((s) => s.id === take.scene);
        if (!scene || scene.narration?.text !== take.text) throw new Error('This take uses an older script. Record the current line.');
        const { settings, speed, filters } = planVoice(take.seconds, scene.duration, data.settings, take.text);
        const file = enhanceRecording(join(directory, take.raw), join(directory, 'recordings', 'enhanced'), filters, settings.noise, settings.speaker);
        const seconds = wavSeconds(file)!;
        if (settings.fit !== 'extend' && seconds > scene.duration + 0.01) throw new Error('The processed take still runs long. Trim a pause or extend the scene.');
        const duration = settings.fit === 'extend' ? Math.max(scene.duration, Math.ceil((seconds + 0.2) * spec.video.fps) / spec.video.fps) : scene.duration;
        take.processed = { file: relative(directory, file), seconds, duration, speed, revision, settings };
        saveTake(take);
        return send(200, take);
      }
      if (url.pathname === '/api/apply') {
        const take = readTake(data.id);
        const { document, spec, revision } = readProject();
        if (!take.processed || take.processed.revision !== revision) throw new Error('The project changed. Create a fresh voice preview before applying.');
        const index = spec.scenes.findIndex((s) => s.id === take.scene);
        if (index < 0 || spec.scenes[index].narration?.text !== take.text) throw new Error('The script changed. Record the current line.');
        if (!existsSync(join(directory, take.processed.file))) throw new Error('The processed take is missing. Create a fresh preview.');
        document.setIn(['scenes', index, 'narration', 'audio'], take.processed.file);
        document.setIn(['scenes', index, 'duration'], take.processed.duration);
        const updated = document.toString({ lineWidth: 0 });
        atomic(yaml, updated);
        take.processed.revision = hash(updated);
        saveTake(take);
        return send(200, state());
      }
      if (url.pathname === '/api/render') {
        render = { running: true, message: 'Rendering scenes and mixing your voice with music…' };
        const child = spawn(process.execPath, [CLI_ENTRY, 'render', directory], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
        let log = '';
        const collect = (chunk: Buffer) => { log = (log + chunk.toString()).slice(-4000); };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.on('error', (e) => { render = { running: false, message: e.message }; });
        child.on('close', (code) => { render = { running: false, message: code === 0 ? 'Video ready. Your attached takes are in the mix.' : `Render failed: ${log.slice(-1000)}` }; });
        return send(202, render);
      }
      return send(404, { error: 'Not found' });
    } catch (error) {
      if (!res.headersSent) send(400, { error: (error as Error).message });
      else res.end();
    }
  });
  server.requestTimeout = 120_000;
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      done();
    });
  });
  return { server, url: origin };
}

function serveFile(res: ServerResponse, path: string, type: string, range?: string) {
  if (!existsSync(path)) { res.writeHead(404); res.end('No media yet'); return; }
  const size = statSync(path).size;
  let start = 0, end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) { res.writeHead(416); res.end(); return; }
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
  }
  res.writeHead(range ? 206 : 200, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  createReadStream(path, { start, end }).on('error', () => res.destroy()).pipe(res);
}
