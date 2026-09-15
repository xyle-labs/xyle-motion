# Repository privacy

Report vulnerabilities privately through
[GitHub's vulnerability reporting form](https://github.com/xyle-labs/xyle-motion/security/advisories/new).
Include affected versions and reproduction steps, but no real credentials or
personal recordings. Do not disclose security issues in public issue reports.
This development preview has no supported stable release yet; fixes target main.

Keep client work, recordings, credentials and assistant sessions outside this
repository. `.gitignore` covers common local artifacts. Git can bypass ignore
rules with `add -f`, so hooks also reject ignored paths in the index and history.

After cloning, run `npm run security:setup` before making commits. It downloads
Gitleaks 8.30.1 from its official release, verifies the release checksum, installs
repository-local hooks, and preserves an approved Git identity. Otherwise it
sets the neutral identity in this repository only. It does not change global
Git settings. Maintainer commits use `Jesse <no-reply@xyle.de>`; public contributors
can configure their own GitHub noreply identity without impersonating a maintainer.
Supported development hosts: macOS/Linux on arm64/x64.

The pre-commit hook scans the complete staged snapshot, including unchanged
staged content, and checks author/committer identities. The commit-msg hook
scans the message. The pre-push hook and `npm run security:check` scan every
locally reachable commit and reflog, messages, identities and historical paths.
Missing scanners and scan errors block the operation. Scanner output is redacted;
temporary scan copies are removed after each run. Inline scanner suppression
comments and local ignore lists are disabled.

Gitleaks' standard secret rules are extended to catch home-directory paths,
personal email addresses and common chat-export structure. Example-domain and
GitHub noreply addresses, `jesse@xyle` and the exact public address
`no-reply@xyle.de` are permitted in text. Maintainer commits use
`Jesse <no-reply@xyle.de>`; explicitly select this address for GitHub squash
merges. `Jesse <jesse@xyle>`, neutral, contributor noreply and GitHub bot identities
are also allowed, including GitHub's merge committer address. Other addresses
at the same domain remain blocked.
Project and studio references, including Waray and Fallen Coconut, are acceptable.
These approved details in retained older commits do not require further removal.
Confidential client content, credentials and assistant sessions remain excluded.
Source symlinks are limited to the two shared skill links. Unreviewed binary or
oversized files are rejected. Existing generated WAV files are pinned by SHA-256
in `scripts/reviewed-media.json`; inspect provenance, metadata and audio before
intentionally changing that manifest. Public upstream author/license attribution
is retained and is not private contributor information.

CI runs the same full-history check on pushes and pull requests. Main requires
a pull request, the up-to-date `security` check from GitHub Actions, resolved
review discussions and linear history. Force-pushes and deletion are blocked;
there are no configured bypass actors. A second person's approval is not required
while the repository has one maintainer; add that requirement when another joins.
GitHub secret scanning, push protection, CodeQL and Dependabot supplement these
checks. Private vulnerability reporting is enabled. CI runs after upload, so it
cannot prevent the initial upload. Local hooks are bypassable with Git options;
no pattern scanner can guarantee detection of arbitrary personal prose or secrets.
Review staged changes, new media, security configuration and release contents.
Do not add findings, raw scanner reports or chat transcripts to the repository.

Before publishing, audit all remote refs and the exact npm tarball. Rewriting
local history does not remove old commits from a remote, other clones, forks,
pull requests, caches or backups. Coordinate any replacement of remote history;
rotate credentials if any are ever found. The owner approved public visibility
and the retained identity/project references. The historical author exception
is restricted to commit `006e010cb8b61c2718630f4a73374cfe9ca1ac28`; it does not
allow that address in new commits or files. Original source and assets use MIT,
with third-party terms documented in NOTICE.md. Npm publication remains disabled
until a release is separately approved.
