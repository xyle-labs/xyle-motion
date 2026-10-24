import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, win32 } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const Config = z.strictObject({
  assetRoots: z.array(z.string().min(1)).default([]),
  themeRoots: z.array(z.string().min(1)).default([]),
  context: z.array(z.string().min(1)).default([]),
  defaults: z.strictObject({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    fps: z.number().int().positive().optional(),
    theme: z.string().min(1).optional(),
    background: z.string().optional(),
    color: z.string().optional(),
    music: z.strictObject({ file: z.string().min(1), volume: z.number().min(0).max(1).optional() }).optional(),
  }).default({}),
});

export type ProjectConfig = z.infer<typeof Config> & { path?: string };

/** Only the video directory and its parent are searched. Other layouts use --config. */
export function loadConfig(video: string, explicit?: string): ProjectConfig {
  const path = explicit ? resolve(explicit) : [join(video, 'explainer.yaml'), join(dirname(video), 'explainer.yaml')].find(existsSync);
  if (!path) return { assetRoots: [], themeRoots: [], context: [], defaults: {} };
  if (!existsSync(path)) throw new Error(`no configuration file: ${path}`);
  let config: z.infer<typeof Config>;
  try { config = Config.parse(parse(readFileSync(path, 'utf8')) ?? {}); }
  catch (error) { throw new Error(`invalid configuration ${path}: ${(error as Error).message}`); }
  const fromFile = (name: string, directory: boolean) => {
    if (isAbsolute(name) || win32.isAbsolute(name) || /^[a-z][a-z0-9+.-]*:/i.test(name))
      throw new Error(`configuration ${path}: path must be relative to this file: ${name}`);
    const target = resolve(dirname(path), name);
    if (!existsSync(target) || directory !== statSync(target).isDirectory())
      throw new Error(`configuration ${path}: ${directory ? 'directory' : 'file'} not found: ${target}`);
    return target;
  };
  return {
    ...config, path,
    assetRoots: config.assetRoots.map(name => fromFile(name, true)),
    themeRoots: config.themeRoots.map(name => fromFile(name, true)),
    context: config.context.map(name => fromFile(name, false)),
  };
}
