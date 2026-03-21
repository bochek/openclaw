---
title: "Plugin SDK Import Model"
sidebarTitle: "Import Model"
summary: "How to import the public Plugin SDK safely and how to avoid bundled-only internals"
read_when:
  - You are choosing a Plugin SDK import path
  - You are migrating away from compatibility barrels
  - You are deciding what stays local to a bundled plugin
---

# Plugin SDK import model

OpenClaw wants plugin authors to import focused SDK subpaths instead of broad
barrels.

## Use focused subpaths

Prefer:

```ts
import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
```

Avoid:

```ts
import { ... } from "openclaw/plugin-sdk";
import { ... } from "openclaw/plugin-sdk/compat";
```

## Treat the root barrel as legacy

The root `openclaw/plugin-sdk` barrel exists for compatibility. New docs and new
plugin code should point to focused subpaths first.

See [Stability](/reference/plugin-sdk/stability) for how compatibility-only
surfaces are classified.

## Use local barrels for plugin internals

Within a bundled plugin, keep plugin-only helpers behind local files such as:

- `./api.ts`
- `./runtime-api.ts`

Do not route internal plugin imports back through the published SDK path.

## Public boundary

Use the public SDK contract for cross-package plugin imports:

- `openclaw/plugin-sdk/*`

Do not treat these as public plugin contracts:

- repo `src/**` internals
- bundled extension `src/**` internals
- accidental helper exports that have not been reviewed and classified

## Current rollout state

Phase 1 establishes the curated import model and reviewed module set. Generated
module pages arrive in phase 2 under `/reference/plugin-sdk/modules/*`.
