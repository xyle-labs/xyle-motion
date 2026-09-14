import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { PACKAGE_ROOT, RENDERER_ENTRY } from './paths.ts';

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('@remotion/cli/package.json')), 'remotion-cli.js');
// Keep browser and bundler writes away from both the installed package and host config.
export function remotionCwd() {
  const base = process.env.XYLE_MOTION_CACHE ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'xyle-motion');
  const directory = join(base, createHash('sha256').update(PACKAGE_ROOT).digest('hex').slice(0, 12));
  mkdirSync(directory, { recursive: true });
  const marker = join(directory, 'package.json');
  if (!existsSync(marker)) writeFileSync(marker, '{"name":"xyle-motion-runtime","private":true}\n');
  return directory;
}
export function remotionArgs(args: string[]) {
  if (!['render', 'still', 'studio'].includes(args[0])) return [cli, ...args];
  const browser = process.env.XYLE_MOTION_BROWSER_EXECUTABLE;
  return [cli, args[0], RENDERER_ENTRY, ...args.slice(1),
    '--config', join(PACKAGE_ROOT, 'remotion.config.js'),
    ...(browser ? ['--browser-executable', browser] : [])];
}
