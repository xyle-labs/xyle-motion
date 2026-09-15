import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkEntry, checkIdentity } from './security.mjs';

test('privacy guard rejects unapproved identities, arbitrary binaries, changed media and unsafe links', () => {
  const bytes = Buffer.from([0, 1, 2]);
  const path = 'library/music/test.wav';
  const reviewed = { [path]: createHash('sha256').update(bytes).digest('hex') };
  checkEntry(path, '100644', bytes, reviewed);
  assert.throws(() => checkEntry(path, '100644', Buffer.from([0, 1, 3]), reviewed), /Unreviewed media/);
  assert.throws(() => checkEntry('source.txt', '100644', bytes, {}), /Binary/);
  assert.throws(() => checkEntry('source.txt', '100644', Buffer.alloc(1024 * 1024 + 1, 65), {}), /oversized/);
  assert.throws(() => checkEntry('source.txt', '160000', Buffer.from('submodule'), {}), /Submodules/);
  assert.throws(() => checkEntry('link', '120000', Buffer.from('../../private'), {}), /symlink/);
  checkEntry('.agents/skills/xyle-motion', '120000', Buffer.from('../../skills/xyle-motion'), {});
  checkIdentity('Xyle Motion contributors <contributors@example.invalid> 123 +0000');
  checkIdentity('Jesse <jesse@xyle> 123 +0000');
  checkIdentity('Public Contributor <123+contributor@users.noreply.github.com> 123 +0000');
  checkIdentity('dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com> 123 +0000');
  checkIdentity('GitHub <noreply@github.com> 123 +0000');
  assert.throws(() => checkIdentity('Contributor <123+contributor' + '@' + 'users.noreply.github.com.invalid> 123 +0000'), /identity blocked/);
  assert.throws(() => checkIdentity('Private Author <jesse@xyle> 123 +0000'), /identity blocked/);
  assert.throws(() => checkIdentity('Jesse <author@example.com> 123 +0000'), /identity blocked/);
  assert.throws(() => checkIdentity('Private Author <author@example.com> 123 +0000'), /identity blocked/);
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scanner = join(root, '.git/security-tools/gitleaks');
test('real hooks block forced artifacts, staged secrets, messages and history', {
  skip: !existsSync(scanner) && 'Run npm run security:setup to exercise Gitleaks integration',
}, () => {
  const cwd = mkdtempSync(join(tmpdir(), 'xyle-security-test-'));
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Xyle Motion contributors', GIT_AUTHOR_EMAIL: 'contributors@example.invalid', GIT_COMMITTER_NAME: 'Xyle Motion contributors', GIT_COMMITTER_EMAIL: 'contributors@example.invalid' };
  const call = (command, args) => spawnSync(command, args, { cwd, env, encoding: 'utf8' });
  const git = (...args) => {
    const result = call('git', args);
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const check = (mode, passes) => {
    const result = call(process.execPath, ['scripts/security.mjs', mode]);
    assert.equal(result.status === 0, passes, `${result.stdout}\n${result.stderr}`);
  };
  const reset = () => git('reset', '--hard', 'HEAD');
  try {
    git('init', '-b', 'main');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.hooksPath', '.githooks');
    for (const file of ['.gitignore', '.gitleaks.toml', '.githooks', 'scripts/security.mjs', 'scripts/reviewed-media.json']) {
      mkdirSync(dirname(join(cwd, file)), { recursive: true });
      cpSync(join(root, file), join(cwd, file), { recursive: true });
    }
    mkdirSync(join(cwd, '.git/security-tools'));
    cpSync(scanner, join(cwd, '.git/security-tools/gitleaks'));
    writeFileSync(join(cwd, 'safe.txt'), 'Public example\n');
    git('add', '.');
    git('commit', '-m', 'Public example');
    check('history', true);

    Object.assign(env, { GIT_AUTHOR_NAME: 'Jesse', GIT_AUTHOR_EMAIL: 'jesse@xyle', GIT_COMMITTER_NAME: 'Jesse', GIT_COMMITTER_EMAIL: 'jesse@xyle' });
    writeFileSync(join(cwd, 'safe.txt'), 'Project references: Waray and Fallen Coconut.\n');
    git('add', 'safe.txt');
    git('commit', '-m', 'Allow approved identity and project references');
    Object.assign(env, { GIT_AUTHOR_NAME: 'Public Contributor', GIT_AUTHOR_EMAIL: '123+contributor@users.noreply.github.com', GIT_COMMITTER_NAME: 'GitHub', GIT_COMMITTER_EMAIL: 'noreply@github.com' });
    git('commit', '--allow-empty', '-m', 'Accept public contribution metadata');
    check('history', true);

    for (const path of ['.env', '.claude/history.jsonl', 'recordings/take.wav', 'docs/archive.zip']) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), 'fixture');
      git('add', '-f', path);
      assert.notEqual(call('git', ['commit', '-m', 'Blocked artifact']).status, 0, path);
      reset();
    }

    const secret = ['ghp', randomBytes(18).toString('hex')].join('_');
    writeFileSync(join(cwd, 'safe.txt'), secret);
    git('add', 'safe.txt');
    writeFileSync(join(cwd, 'safe.txt'), 'Working copy is clean; index is not.');
    check('staged', false);
    reset();
    for (const content of [['person', 'private.invalid'].join('@'), '/' + 'Users/private/example', JSON.stringify({ role: 'assistant', content: 'private' })]) {
      writeFileSync(join(cwd, 'safe.txt'), content);
      git('add', 'safe.txt');
      check('staged', false);
      reset();
    }
    assert.notEqual(call('git', ['commit', '--allow-empty', '-m', secret]).status, 0);

    writeFileSync(join(cwd, 'safe.txt'), secret);
    git('add', 'safe.txt');
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'Deliberate bypass fixture');
    writeFileSync(join(cwd, 'safe.txt'), 'Clean latest tree');
    git('add', 'safe.txt');
    git('commit', '-m', 'Remove fixture');
    check('history', false);
    assert.notEqual(call('sh', ['.githooks/pre-push']).status, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
