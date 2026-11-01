# Roadmap

Xyle Motion remains a public development preview. Implemented behavior and
acceptance boundaries are tracked in [development status](docs/STATUS.md).

| Priority | Outcome | Acceptance |
| --- | --- | --- |
| Now | A discoverable first result | Installed `demo`, first-edit guide, reproducible workflow GIF, external-package smoke checks |
| Next | A real client project pilot ([#36](https://github.com/xyle-labs/xyle-motion/issues/36)) | Create and revise from the installed package; preserve originals; inspect frames; watch motion and listen to the final mix |
| Before release | Exact release review ([#38](https://github.com/xyle-labs/xyle-motion/issues/38)) | Approve the exact tree/tarball, dependency licenses, reviewed media and supported-host results |
| Tracked | Nested Zod advisory ([#53](https://github.com/xyle-labs/xyle-motion/issues/53)) | Verify the installed dependency graph after an upstream fix; retain a clear record until resolved |

Npm publication stays disabled until release contents are approved. The package
keeps one CLI, one skill and a shared deterministic renderer. Hosted rendering,
accounts, a second editor and per-video React are outside the current scope.

## Repository patterns adopted

These are reference projects, not endorsements or compatibility claims:

- [Remotion](https://github.com/remotion-dev/remotion): a visible product result,
  a short start command and task-oriented documentation links. Motion uses its
  existing engine and keeps an explicit development-preview installation path.
- [Motion Canvas](https://github.com/motion-canvas/motion-canvas): a clear split
  between using the tool and developing it, with a dedicated first project.
  Motion's quickstart lives separately from contributor setup.
- [VHS](https://github.com/charmbracelet/vhs): a rendered demonstration with its
  reproducible source next to it. Motion's walkthrough runs real installed CLI
  commands and labels its condensed presentation.

Reviewed on 1 November 2026. Original prose and demo assets are used here;
upstream artwork, recordings and documentation are not copied.
