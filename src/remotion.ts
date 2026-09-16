import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { PACKAGE_ROOT, RENDERER_ENTRY } from './paths.ts';

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('@remotion/cli/package.json')), 'remotion-cli.js');
// Keep browser and bundler writes away from both the installed package and host config.
export function remotionCwd() {
  const base = process.env.XYLE_MOTION_CACHE ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'xyle-motion');
  const directory = join(base, createHash('sha256').update(PACKAGE_ROOT).digest('hex').slice(0, 12));
  try {
    mkdirSync(directory, { recursive: true });
    const marker = join(directory, 'package.json');
    if (!existsSync(marker)) writeFileSync(marker, '{"name":"xyle-motion-runtime","private":true}\n');
    accessSync(directory, constants.W_OK);
  } catch (error) {
    throw new Error(`Renderer cache is not writable. Set XYLE_MOTION_CACHE to a writable directory. ${(error as Error).message}`);
  }
  return directory;
}
export function remotionArgs(args: string[]) {
  if (!['render', 'still', 'studio'].includes(args[0])) return [cli, ...args];
  const browser = process.env.XYLE_MOTION_BROWSER_EXECUTABLE;
  if (browser) {
    try { accessSync(browser, constants.X_OK); }
    catch { throw new Error(`Selected browser is missing or not executable: ${basename(browser)}. Set XYLE_MOTION_BROWSER_EXECUTABLE to an installed compatible browser.`); }
  }
  return [cli, args[0], RENDERER_ENTRY, ...args.slice(1),
    '--config', join(PACKAGE_ROOT, 'remotion.config.js'),
    ...(browser ? ['--browser-executable', browser] : [])];
}

/** Keep the underlying failure, adding only browser/cache recovery context. */
export function rendererDiagnostic(log: string) {
  const browser = process.env.XYLE_MOTION_BROWSER_EXECUTABLE;
  let version = '';
  if (browser && existsSync(browser)) {
    const result = spawnSync(browser, ['--version'], { encoding: 'utf8', timeout: 2000 });
    if (result.status === 0) version = result.stdout.trim().split('\n')[0].slice(0, 160);
  }
  const kind = /cache is not writable/i.test(log) ? 'Cache failure'
    : /missing or not executable|ENOENT/i.test(log) ? 'Missing executable'
    : /ERR_CONNECTION|ERR_ADDRESS|ERR_EMPTY_RESPONSE|net::ERR_|navigation.*(?:fail|timeout)|localhost.*(?:fail|refused)/i.test(log) ? 'Local browser navigation failure'
    : /launch|browser.*(?:closed|exited)|spawn/i.test(log) ? 'Browser launch failure' : 'Renderer failure';
  return `${kind}. Browser: ${browser ? basename(browser) : 'Remotion-managed browser'}${version ? ` (${version})` : ''}.\n` +
    'Set XYLE_MOTION_BROWSER_EXECUTABLE to an installed compatible headless shell and XYLE_MOTION_CACHE to a writable directory; retry the bundled example. No browser override was replaced.\n' + log;
}

export function runRemotion(args: string[]): number {
  try {
    if (args[0] === 'studio') {
      const result = spawnSync(process.execPath, remotionArgs(args), { cwd: remotionCwd(), stdio: 'inherit' });
      if (result.status !== 0) console.error(rendererDiagnostic(result.error?.message ?? `Studio exited with status ${result.status}`));
      return result.status ?? 1;
    }
    const result = spawnSync(process.execPath, remotionArgs(args), {
      cwd: remotionCwd(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.status === 0) {
      if (result.stderr) process.stderr.write(result.stderr);
      return 0;
    }
    console.error(rendererDiagnostic(result.error?.message ?? `${result.stderr}\n${result.stdout.slice(-3000)}`));
  } catch (error) { console.error(rendererDiagnostic((error as Error).message)); }
  return 1;
}
