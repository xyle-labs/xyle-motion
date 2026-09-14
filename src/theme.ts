// ponytail: a theme is a palette. README §15 also sketches typography and motion
// defaults; nothing needs them yet, and a font stack nobody has chosen is not a
// setting, it is a guess. Add them when a video asks.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

import { PACKAGE_ROOT } from './paths.ts';
export const THEMES = join(PACKAGE_ROOT, 'themes');
export type Palette = Record<string, string>;

export function loadTheme(name: string, root = THEMES): Palette {
  const path = join(root, `${name}.yaml`);
  if (!existsSync(path)) throw new Error(`no theme "${name}" — expected ${path}`);
  return parse(readFileSync(path, 'utf8')).colors ?? {};
}

/** Substitute semantic colour names for their hex, and let the theme supply the
 *  video's ground and ink. Runs on the raw YAML *before* validation, so Zod's
 *  own defaults only apply where the theme said nothing.
 *
 *  Deliberately targets the known colour fields rather than walking everything:
 *  a generic sweep would happily rewrite an element whose `text` is "accent". */
export function applyTheme(raw: any, palette: Palette): any {
  if (!palette || !raw?.video) return raw;
  const hex = (v: unknown) => (typeof v === 'string' && palette[v] ? palette[v] : v);

  raw.video.background = hex(raw.video.background ?? palette.background);
  raw.video.color = hex(raw.video.color ?? palette.text);

  for (const scene of raw.scenes ?? []) {
    const colours = { ...palette, ...scene.palette };
    const hex = (v: unknown) => typeof v === 'string' && colours[v] ? colours[v] : v;
    for (const element of scene.elements ?? []) {
      if (element.color !== undefined) element.color = hex(element.color);
      for (const slot of ['enter', 'animation', 'exit'] as const)
        if (element[slot]?.color !== undefined)
          element[slot].color = hex(element[slot].color);
    }
  }
  return raw;
}
