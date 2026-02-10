# Config Builder (WIP)

This workspace package will host the standalone OpenClaw config builder app.

## Stack

Use the same front-end stack as the existing OpenClaw web UI (`ui/`):

- Vite
- Lit
- Plain CSS (no Next.js/Tailwind)

## Current status

Phase 0, Phase 1, Phase 2, and Phase 3 are in place:

- app boots with Vite + Lit
- `OpenClawSchema.toJSONSchema()` runs in browser bundle
- `buildConfigSchema()` UI hints load in browser bundle
- Explorer scaffold renders grouped sections + field metadata
- Sparse draft state persists to localStorage and renders to JSON5 preview
- Typed field renderer covers:
  - strings, numbers, integers, booleans, enums
  - primitive arrays with add/remove
  - record-like objects (key/value editor)
  - JSON fallback editor for complex array/object shapes
- Live JSON5 preview supports copy/download/reset

To run locally:

```bash
pnpm --filter @openclaw/config-builder dev
```

## Notes

Implementation details are tracked in `.local/config-builder-spec.md`.

For the spike, Vite aliases lightweight browser shims for:

- `src/version.ts`
- `src/channels/registry.ts`

This keeps schema imports browser-safe while preserving the existing Node runtime modules.
