# Contributing to NeuroPilot

Please refer to our [contributor docs](https://vsc-neuropilot.github.io/docs/meta/contributors) in addition to this page.

## Contributing

If you have an idea or want to contribute a feature, please first [create an issue](https://github.com/VSC-NeuroPilot/neuropilot/issues) or send a message to `@Pasu4` in the project's [post on the Neuro Discord](https://discord.com/channels/574720535888396288/1350968830230396938).
If you make a pull request that contributes code, please run `npm run lint src` and resolve any errors that did not get auto-fixed, preferrably before each commit.

PRs should generally target the `dev` branch (or another feature branch) unless there is a specific reason to do otherwise (if so, please explain it in your PR).

## Debugging

- Clone the repository
- Run `pnpm install` in terminal to install dependencies
- Run either the `Run Desktop Extension` or `Run Web Extension` target in the Debug View. This will:
  - Start the build tasks using `tsc` and `esbuild` to compile the code.
  - Run the extension in a new VS Code window.
  - Display extra extension logs (often from dependencies) in the main window's `Debug Console`.

## Tests

We have both unit tests and integration tests. Integration tests spin up a VS Code host (desktop Electron or the browser-hosted workbench) and exercise the extension.

Folder layout:

- `src/test/unit-test/` — unit tests that validate prompt text generation logic only
- `src/test/suite/desktop/` and `src/test/suite/web/` — integration test harnesses and suites

Unit tests:

- Purpose: verify prompt text formatting and related pure logic (e.g., line counts, pluralization, escaping)
- Scope: they DO NOT execute action handlers or use VS Code APIs; they only cover prompt-generation logic
- Examples: `rewrite_all.simple.test.ts`, `find_text.simple.test.ts`, etc. under `src/test/unit-test/`
- Execution: unit tests are imported into both the desktop and web test runners, so `pnpm test` (and CI) runs them alongside integration tests; no separate Node/Mocha job is required

Integration tests:

- Purpose: verify actual action functionality and end-to-end extension behavior
- Scope: these use VS Code APIs (open/save files, edits, decorations, terminal/tasks, git, etc.) and assert the real effects
- Environments:
  - Desktop integration runs in the Electron host
  - Web integration runs either under the Electron host with the web bundle or in a real browser via `@vscode/test-web`

Prerequisites (web tests):

- Install Playwright browsers (required for Firefox/WebKit; Chromium usually works out-of-the-box but we recommend installing all):
  - `pnpm dlx playwright install --with-deps`

Commands:

- Desktop (Electron host):
  - Run desktop tests: `pnpm run test:desktop`

- Web (true browser via `@vscode/test-web`):
  - Quick (Chromium default, build + run): `pnpm run test:web`
  - Per-browser shortcuts (build + run):
    - Chromium: `pnpm run test:web:browser:chromium`
    - Firefox: `pnpm run test:web:browser:firefox`
    - WebKit: `pnpm run test:web:browser:webkit`
  - Manual steps (if you need them):
    - Build browser test bundle: `pnpm run test:web:browser:esbuild`
    - Run with explicit browser flag: `pnpm run test:web:browser:vscode -- --browser=chromium`

Notes:

- Web tests run in a real browser using the web extension bundle; they do not use the Electron (desktop) harness.
- The browser test workspace is mounted under a virtual scheme; the workspace name may appear as `mount` instead of `test-playground`.
- File operations in browser mode use the VS Code virtual FS, so ‘trash’ is disabled and deletes are immediate.
- Headless web runs may log warnings like "Output channel not initialized", "[NeuroClient] WebSocket is not open", or 404s for dev assets. These are expected in the test harness; assertions still validate real side effects (file edits/opens/renames/deletes, document text, active editor) and verify `sendContext` via a mocked client.
