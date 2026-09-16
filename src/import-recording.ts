import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative } from 'node:path';
import { parseDocument } from 'yaml';
import { decodeRecording } from './audio.ts';
import { VideoSpec } from './schema.ts';

export function importRecording(directory: string, sceneId: string, input: string) {
  const path = join(directory, 'video.yaml');
  const source = readFileSync(path, 'utf8');
  const document = parseDocument(source);
  const spec = VideoSpec.parse(document.toJS());
  const index = spec.scenes.findIndex(scene => scene.id === sceneId);
  if (index < 0) throw new Error(`No scene "${sceneId}"`);
  const scene = spec.scenes[index];
  if (!scene.narration) throw new Error(`Scene "${sceneId}" needs narration.text first`);
  const original = readFileSync(input);
  const temporary = mkdtempSync(join(tmpdir(), 'motion-import-'));
  try {
    const extension = extname(input).toLowerCase();
    const name = `original${/^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.audio'}`;
    writeFileSync(join(temporary, name), original);
    const wav = join(temporary, 'narration.wav');
    const seconds = decodeRecording(join(temporary, name), wav);
    if (seconds > scene.duration + 0.05)
      throw new Error(`Recording is ${seconds.toFixed(2)}s; scene "${sceneId}" is ${scene.duration}s. YAML unchanged; shorten the take or lengthen the scene.`);
    if (readFileSync(path, 'utf8') !== source) throw new Error('Project changed during import. Retry with the current YAML.');
    const imports = join(directory, 'recordings', 'imports');
    mkdirSync(imports, { recursive: true });
    const destination = mkdtempSync(join(imports, `${sceneId}-`));
    copyFileSync(join(temporary, name), join(destination, name));
    copyFileSync(wav, join(destination, 'narration.wav'));
    const file = relative(directory, join(destination, 'narration.wav'));
    document.setIn(['scenes', index, 'narration', 'audio'], file);
    writeFileSync(`${path}.tmp`, document.toString({ lineWidth: 0 }));
    renameSync(`${path}.tmp`, path);
    return { file, seconds };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
