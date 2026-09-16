# Browser render diagnostics

The CLI preserves the renderer's underlying error and identifies a missing
executable, unwritable cache, browser launch failure or localhost navigation
failure when the error distinguishes them. Its short summary names the selected
browser and reports its version when `--version` succeeds. It does not replace
an explicitly selected browser or dump environment variables.

First reproduce with the bundled synthetic example, outside the installed package:

```sh
cp -R node_modules/@xyle-labs/motion/examples/minimal /tmp/motion-browser-check
npm exec -- explainer validate /tmp/motion-browser-check
npm exec -- explainer frame /tmp/motion-browser-check --scene idea --time 1.5
```

If an installed full Chrome fails, retry that same fixture with a compatible
installed Chromium headless shell and a writable cache:

```sh
XYLE_MOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell \
XYLE_MOTION_CACHE=/tmp/motion-render-cache \
npm exec -- explainer frame /tmp/motion-browser-check --scene idea --time 1.5
```

Use the actual executable path and check its executable permission. The override
uses that browser; it does not download a substitute. With no override, Remotion
manages its own browser in the writable cache. A cache path must be a directory
you can write, not a file or a read-only package installation.

For an issue, provide the synthetic command, package/Node/browser versions,
diagnostic category and relevant underlying error, after removing personal
paths. Do not include environment dumps, credentials, private media or renderer
props. The intermittent full-Chrome navigation failure has no confirmed general
cause; capture a clean reproduction before proposing an automatic fallback.
