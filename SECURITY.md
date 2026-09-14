# Repository privacy

Keep client work, recordings, credentials and assistant sessions outside this
repository. `.gitignore` covers common local artifacts. Git can bypass ignore
rules with `add -f`, so hooks also reject ignored paths in the index and history.

After cloning, run `npm run security:setup` before making commits. It downloads
Gitleaks 8.30.1 from its official release, verifies the release checksum, installs
repository-local hooks, and sets a neutral author name and reserved example
email in this repository only. It does not change global Git settings.
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
GitHub noreply addresses are permitted in text; commits use the neutral identity.
Source symlinks are limited to the two shared skill links. Unreviewed binary or
oversized files are rejected. Existing generated WAV files are pinned by SHA-256
in `scripts/reviewed-media.json`; inspect provenance, metadata and audio before
intentionally changing that manifest. Public upstream author/license attribution
is retained and is not private contributor information.

CI runs the same full-history check on pushes and pull requests. Require the
`security` job in GitHub branch rules, restrict direct pushes, and enable GitHub
secret scanning/push protection where available. CI runs after upload, so it
cannot prevent the initial upload. Local hooks are bypassable with Git options;
no pattern scanner can guarantee detection of arbitrary personal prose or secrets.
Review staged changes, new media, security configuration and release contents.
Do not add findings, raw scanner reports or chat transcripts to the repository.

Before publishing, audit all remote refs and the exact npm tarball. Rewriting
local history does not remove old commits from a remote, other clones, forks,
pull requests, caches or backups. Coordinate any replacement of remote history;
rotate credentials if any are ever found. Keep this project private until the
remaining source/media licensing review is complete.
