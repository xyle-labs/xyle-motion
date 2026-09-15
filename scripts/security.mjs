import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const identity = 'Jesse <jesse@xyle>';
const legacyIdentity = 'Xyle Motion contributors <contributors@example.invalid>';
const version = '8.30.1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: root, input, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status ?? 'unavailable'}). ${result.stderr?.toString() ?? ''}`);
  return result.stdout;
}
const git = (...args) => run('git', args).toString();

export function checkEntry(path, mode, bytes, reviewed) {
  if (mode === '120000') {
    if (!['.agents/skills/xyle-motion', '.claude/skills/xyle-motion'].includes(path) || bytes.toString() !== '../../skills/xyle-motion')
      throw new Error(`Unreviewed symlink: ${JSON.stringify(path)}`);
    return;
  }
  if (!['100644', '100755'].includes(mode)) throw new Error('Submodules and special file modes require review.');
  if (path.endsWith('.wav')) {
    if (reviewed[path] !== sha256(bytes)) throw new Error(`Unreviewed media: ${JSON.stringify(path)}. Review provenance and audio before updating the manifest.`);
  } else if (bytes.includes(0) || !Buffer.from(bytes.toString('utf8')).equals(bytes) || bytes.length > 1024 * 1024) {
    throw new Error(`Binary or oversized file requires review: ${JSON.stringify(path)}`);
  }
}

export function checkIdentity(value) {
  const githubIdentity = /^[^<>\r\n]+ <(?:[A-Za-z0-9_.+%\[\]-]+@users\.noreply\.github\.com|noreply@github\.com)> \d+ [+-]\d{4}$/;
  if (![identity, legacyIdentity].some(allowed => value.startsWith(`${allowed} `)) && !githubIdentity.test(value))
    throw new Error('Unapproved Git identity blocked. Use your GitHub noreply address or run npm run security:setup for the neutral identity.');
}

async function main() {
  const mode = process.argv[2];
  const tools = resolve(root, git('rev-parse', '--git-path', 'security-tools').trim());
  const scanner = join(tools, 'gitleaks');
  if (mode === 'setup') {
    const platform = { darwin: 'darwin', linux: 'linux' }[process.platform];
    const arch = { arm64: 'arm64', x64: 'x64' }[process.arch];
    if (!platform || !arch) throw new Error('Security setup supports macOS/Linux on arm64/x64.');
    if (!existsSync(scanner)) {
      mkdirSync(tools, { recursive: true });
      const file = `gitleaks_${version}_${platform}_${arch}.tar.gz`;
      const base = `https://github.com/gitleaks/gitleaks/releases/download/v${version}`;
      const download = async name => {
        const response = await fetch(`${base}/${name}`);
        if (!response.ok) throw new Error(`Gitleaks download failed (${response.status}).`);
        return Buffer.from(await response.arrayBuffer());
      };
      const [archive, checksums] = await Promise.all([download(file), download(`gitleaks_${version}_checksums.txt`)]);
      const expected = checksums.toString().split('\n').find(line => line.trim().endsWith(` ${file}`))?.split(/\s+/)[0];
      if (!expected || sha256(archive) !== expected) throw new Error('Gitleaks checksum mismatch.');
      const tarball = join(tools, 'download.tar.gz');
      writeFileSync(tarball, archive);
      try { run('tar', ['-xzf', tarball, '-C', tools, 'gitleaks']); }
      finally { rmSync(tarball, { force: true }); }
    }
    for (const hook of ['pre-commit', 'commit-msg', 'pre-push']) chmodSync(join(root, '.githooks', hook), 0o755);
    git('config', '--local', 'core.hooksPath', '.githooks');
    try { checkIdentity(git('var', 'GIT_AUTHOR_IDENT').trim()); }
    catch {
      git('config', '--local', 'user.name', 'Xyle Motion contributors');
      git('config', '--local', 'user.email', 'contributors@example.invalid');
    }
    console.log('Installed repository hooks and approved Git identity.');
    return;
  }
  if (!['staged', 'history', 'message'].includes(mode)) throw new Error('Usage: node scripts/security.mjs setup|staged|history|message <file>');
  if (!existsSync(scanner)) throw new Error('Gitleaks missing. Run npm run security:setup. Checks fail closed.');
  if (run(scanner, ['version']).toString().trim() !== version) throw new Error(`Expected Gitleaks ${version}; reinstall with security:setup.`);
  const temporary = mkdtempSync(join(tmpdir(), 'xyle-security-'));
  const config = join(root, '.gitleaks.toml');
  const scan = (args, input) => run(scanner, [...args, '--config', config, '--redact', '--no-banner', '--no-color', '--ignore-gitleaks-allow', '--gitleaks-ignore-path', temporary], input);
  try {
    if (mode === 'message') {
      scan(['stdin'], readFileSync(resolve(process.argv[3])));
      return;
    }
    if (mode === 'staged') {
      for (const role of ['AUTHOR', 'COMMITTER']) checkIdentity(git('var', `GIT_${role}_IDENT`).trim());
    }
    const commits = mode === 'history' ? git('rev-list', '--all', '--reflog').trim().split('\n').filter(Boolean) : [];
    const treeEntries = tree => git('ls-tree', '-rz', tree).split('\0').filter(Boolean).map(entry => {
      const [header, ...path] = entry.split('\t');
      const [mode, , oid] = header.split(' ');
      return { mode, oid, path: path.join('\t') };
    });
    const entries = mode === 'staged'
      ? git('ls-files', '--stage', '-z').split('\0').filter(Boolean).map(entry => {
        const [header, ...path] = entry.split('\t');
        const [mode, oid, stage] = header.split(' ');
        if (stage !== '0') throw new Error('Resolve merge conflicts before scanning.');
        return { mode, oid, path: path.join('\t') };
      })
      : commits.flatMap(commit => {
        const metadata = git('cat-file', 'commit', commit);
        for (const role of ['author', 'committer']) {
          const value = metadata.split('\n').find(line => line.startsWith(`${role} `));
          checkIdentity(value?.slice(role.length + 1) ?? '');
        }
        scan(['stdin'], metadata);
        return treeEntries(commit);
      });
    if (mode === 'history') {
      for (const row of git('for-each-ref', '--format=%(objectname) %(objecttype)').trim().split('\n').filter(Boolean)) {
        const [oid, type] = row.split(' ');
        if (type === 'tree') entries.push(...treeEntries(oid));
        if (type === 'blob') throw new Error('Direct blob refs require review.');
        if (type === 'tag') {
          const tag = git('cat-file', 'tag', oid);
          const tagger = tag.split('\n').find(line => line.startsWith('tagger '));
          checkIdentity(tagger?.slice(7) ?? '');
          scan(['stdin'], tag);
        }
      }
    }
    const paths = [...new Set(entries.map(entry => entry.path))];
    scan(['stdin'], paths.join('\n'));
    const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], { cwd: root, input: paths.join('\0') + '\0', encoding: 'utf8' });
    if (ignored.error || ![0, 1].includes(ignored.status)) throw new Error('Could not verify ignore rules.');
    if (ignored.stdout) throw new Error(`Ignored files are tracked or staged: ${JSON.stringify(ignored.stdout.split('\0').filter(Boolean))}`);
    const reviewed = JSON.parse(readFileSync(join(root, 'scripts/reviewed-media.json'), 'utf8'));
    const seen = new Set();
    for (const { mode, oid, path } of entries) {
      const key = `${mode}:${oid}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bytes = run('git', ['cat-file', 'blob', oid]);
      checkEntry(path, mode, bytes, reviewed);
      // Opaque object names keep personal filenames out of scanner reports.
      if (mode !== '120000' && !path.endsWith('.wav')) writeFileSync(join(temporary, oid), bytes);
    }
    scan(['dir', temporary]);
    if (mode === 'history') scan(['git', '--log-opts=--all --reflog', root]);
    console.log(`Security checks passed: ${paths.length} paths; ${commits.length || 'staged'} commits.`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
