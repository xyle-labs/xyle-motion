import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Works in the source checkout and in the compiled npm package.
const adjacent = fileURLToPath(new URL('../', import.meta.url));
export const PACKAGE_ROOT = existsSync(join(adjacent, 'package.json')) ? adjacent : resolve(adjacent, '..');
export const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
export const COMPILED = import.meta.url.endsWith('.js');
export const CLI_ENTRY = join(PACKAGE_ROOT, COMPILED ? 'dist/bin/explainer.js' : 'bin/explainer.ts');
export const RENDERER_ENTRY = join(SOURCE_ROOT, COMPILED ? 'index.js' : 'index.ts');
