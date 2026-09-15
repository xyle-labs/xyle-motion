// ponytail: the filesystem IS the registry. README §11 specifies a hand-written
// registry/assets.yaml carrying source, tags, states and versions; every one of
// those is either derivable (source from the path, states from the SVG) or
// unused so far (tags, @version pins). A second file listing what the directory
// already says is a file that can only ever be wrong. Add it when something
// needs a field that cannot be derived.
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import type { VideoSpec } from './schema.ts';

import { PACKAGE_ROOT } from './paths.ts';
export const LIBRARY = join(PACKAGE_ROOT, 'library');

/** `energy/coal-powerplant.svg` → `energy.coal_powerplant` (README §11). */
export function assetId(relPath: string): string {
  return relPath.replace(/\.svg$/, '').split(/[\\/]/).join('.').replace(/-/g, '_');
}

/** The states an asset offers, read off the art itself. */
export function statesOf(svg: string): string[] {
  return [...new Set([...svg.matchAll(/data-state="([^"]+)"/g)].map((m) => m[1]))];
}

export function scan(root = LIBRARY): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.svg')) found.set(assetId(relative(root, path)), path);
    }
  };
  walk(root);
  return new Map([...found].sort());
}

/** Levenshtein — the boring choice, correct on transpositions and length
 *  differences alike, which a shared-prefix heuristic is not. */
export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/** Nearest known id, if it is near enough to be worth suggesting. */
export function suggest(id: string, known: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of known) {
    const d = distance(id, candidate);
    if (d < bestDistance) [best, bestDistance] = [candidate, d];
  }
  return bestDistance <= Math.max(3, Math.round(id.length * 0.4)) ? best : undefined;
}

/** Embed bundled SVGs and local images, and report anything wrong with
 *  the references. The renderer never touches the filesystem, so the sources
 *  travel to it as input props. */
export function resolveAssets(spec: VideoSpec, root = LIBRARY, project?: string) {
  const library = scan(root);
  const assets: Record<string, string> = {};
  const errors: string[] = [];

  for (const scene of spec.scenes) {
    for (const element of scene.elements) {
      if (element.type !== 'asset') continue;
      const where = `element "${element.id}" in scene "${scene.id}"`;
      if (element.file) {
        try {
          if (!project) throw new Error('local artwork needs a video directory');
          const file = element.file;
          if (isAbsolute(file) || win32.isAbsolute(file) || file.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(file))
            throw new Error('artwork path must be video-relative');
          const inside = (base: string, path: string) => {
            const rel = relative(base, path);
            if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
              throw new Error('artwork path must stay inside the video directory');
          };
          const base = realpathSync(project);
          const path = resolve(base, file);
          inside(base, path);
          const mime = { '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[extname(file).toLowerCase()];
          if (!mime) throw new Error('artwork must be PNG, WebP or SVG');
          const real = realpathSync(path);
          inside(base, real);
          if (!statSync(real).isFile()) throw new Error('artwork must be a regular file');
          // Image data travels with props, like bundled SVGs; no server or package writes.
          assets[`file:${file}`] ??= `data:${mime};base64,${readFileSync(real).toString('base64')}`;
        } catch (error) {
          const message = (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'artwork file not found' : (error as Error).message;
          errors.push(`${where}: ${element.file}: ${message}`);
        }
        continue;
      }
      if (!element.asset) continue;
      const path = library.get(element.asset);

      if (!path) {
        const near = suggest(element.asset, library.keys());
        errors.push(
          `${where}: unknown asset "${element.asset}"` +
            (near ? `\n  did you mean: ${near}` : ''),
        );
        continue;
      }

      const svg = (assets[element.asset] ??= readFileSync(path, 'utf8'));
      const states = statesOf(svg);
      if (states.length && !element.state)
        errors.push(`${where}: asset "${element.asset}" needs a state — one of ${states.join(', ')}`);
      else if (element.state && !states.includes(element.state))
        errors.push(
          `${where}: asset "${element.asset}" has no state "${element.state}"` +
            `\n  available: ${states.join(', ') || 'none'}`,
        );
    }
  }

  return { assets, errors };
}
