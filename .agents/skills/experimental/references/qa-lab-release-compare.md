# QA-Lab Release Compare

Use this reference when the selected flow is `qa-lab release compare`.

Purpose:
- Compare two OpenClaw releases or a release versus the current checkout in isolated installs.
- Surface plugin/bootstrap regressions, especially bundled channel regressions.

Current command surface:

```bash
openclaw qa release-compare <old> <new> \
  --scenario bundled-channels \
  --output-dir .artifacts/qa/release-compare
```

Current bundled-channels scenario:
- Seed isolated homes with enabled `telegram`, `slack`, and `matrix` plugin entries.
- Run:

```text
plugins smoke --json
doctor --non-interactive
status
health
models status
```

Current smoke signal:
- `plugins smoke --json` is the primary structured plugin/bootstrap detector.
- Expected classifications:
  - `ok`
  - `packaged_entry_missing`
  - `plugin_validation_error`
  - `load_error`

Historical litmus test:

```text
2026.4.7 -> 2026.4.8
```

Expected behavior:
- `2026.4.7` should surface a packaged entry failure such as missing `dist/extensions/telegram/src/channel.setup.js`.
- `2026.4.8` should clear that specific packaged-entry failure, even if unconfigured plugins still report validation errors.

Useful compare pairs:
1. Previous stable vs beta
2. Previous stable vs candidate stable
3. Beta vs stable

Notes:
- The qa-lab wrapper writes Markdown and JSON artifacts under the chosen output directory.
- The stronger signal is the native `plugins smoke --json` output; qa-lab should compare that rather than scrape generic stderr.
