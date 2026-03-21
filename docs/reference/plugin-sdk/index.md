---
title: "Plugin SDK Reference"
sidebarTitle: "Plugin SDK"
summary: "Curated reference scaffold for the public OpenClaw Plugin SDK"
read_when:
  - You need the curated public Plugin SDK surface
  - You want import guidance for `openclaw/plugin-sdk/*`
  - You need stability guidance before using a Plugin SDK helper
---

# Plugin SDK reference

This section is the curated reference scaffold for the public OpenClaw Plugin
SDK.

Use it alongside the hand-written plugin guides:

- [Building Plugins](/plugins/building-plugins)
- [Plugin SDK Migration](/plugins/sdk-migration)
- [Plugin Internals](/plugins/architecture)

## What this section covers

- the import model for `openclaw/plugin-sdk/*`
- the stability policy for reviewed SDK subpaths
- the initial category layout for the generated reference
- the reviewed phase 1 module set that will get generated module pages first

## What this section does not do yet

Phase 1 adds the information architecture and stability policy, not the
generated per-module pages. The current rollout also keeps every documented
surface marked `unstable`. Generated pages land in the next phase under
`/reference/plugin-sdk/modules/*`.

## Start here

- [Import Model](/reference/plugin-sdk/import-model)
- [Stability](/reference/plugin-sdk/stability)
- [All Modules](/reference/plugin-sdk/all-modules)

## Categories

- [Core](/reference/plugin-sdk/core)
- [Channel](/reference/plugin-sdk/channel)
- [Provider](/reference/plugin-sdk/provider)
- [Runtime](/reference/plugin-sdk/runtime)
- [Utilities](/reference/plugin-sdk/utilities)
- [Legacy](/reference/plugin-sdk/legacy)
