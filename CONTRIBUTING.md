# Contributing

This is a public development preview under the [MIT license](LICENSE), with
third-party exceptions in [NOTICE.md](NOTICE.md). Contributions of original code
and assets use the same MIT terms. Only contribute material you have the right
to license, and retain third-party notices. Discuss substantial work in an issue first.

Use Node.js 24, Git and full FFmpeg. Clone your fork, create a branch, then run:

```sh
npm ci
npm run security:setup
npm run check
npm run build
npm run security:check
```

Use your GitHub noreply email or the neutral identity installed by setup.
Maintainer commits may use the approved identity documented in SECURITY.md.
Keep client content, secrets, recordings and agent sessions outside the repository.
Project names and public upstream attribution are acceptable. New media needs
provenance and content review before its checksum is added to the media manifest.

Open a pull request against main explaining the change and how you tested it.
Main requires passing CI, an up-to-date branch and resolved review conversations.
Squash merges keep its history linear; direct pushes, force-pushes and deletion
are blocked. There is currently one maintainer, so no second approval is required.
Maintainers must review workflow/security changes and media manifests explicitly:
a passing check is not a substitute for reviewing changes to the check itself.

Packaging changes must also pass the installed tarball check:

```sh
npm pack
node scripts/smoke.mjs /absolute/path/to/package.tgz
```

Report vulnerabilities privately using the link in SECURITY.md. Public issues
should contain only a minimal synthetic reproduction, never confidential data.
