---
title: "Plugin SDK Modules"
sidebarTitle: "All Modules"
summary: "Generated index of the current curated Plugin SDK module set"
---

# Plugin SDK modules

This page is auto-generated from the current curated Plugin SDK metadata and
the TypeScript export surface. Every listed module is currently classified as
`unstable`.

## Current module set

| Import path                                                                                          | Category  | Stability  | Summary                                                                        |
| ---------------------------------------------------------------------------------------------------- | --------- | ---------- | ------------------------------------------------------------------------------ |
| [`openclaw/plugin-sdk`](/reference/plugin-sdk/modules/root-barrel)                                   | Legacy    | `unstable` | Root barrel kept for compatibility; new docs should point to focused subpaths. |
| [`openclaw/plugin-sdk/channel-runtime`](/reference/plugin-sdk/modules/channel-runtime)               | Legacy    | `unstable` | Legacy runtime helper shim for older channel helpers.                          |
| [`openclaw/plugin-sdk/core`](/reference/plugin-sdk/modules/core)                                     | Core      | `unstable` | Primary entry surface for plugin definitions and base plugin-facing types.     |
| [`openclaw/plugin-sdk/plugin-entry`](/reference/plugin-sdk/modules/plugin-entry)                     | Core      | `unstable` | Small entry helper for provider and command plugins.                           |
| [`openclaw/plugin-sdk/channel-actions`](/reference/plugin-sdk/modules/channel-actions)               | Channel   | `unstable` | Shared action and reaction helpers for channel plugins.                        |
| [`openclaw/plugin-sdk/channel-config-schema`](/reference/plugin-sdk/modules/channel-config-schema)   | Channel   | `unstable` | Channel config schema builders and shared schema primitives.                   |
| [`openclaw/plugin-sdk/channel-contract`](/reference/plugin-sdk/modules/channel-contract)             | Channel   | `unstable` | Core channel contract types for channel plugins.                               |
| [`openclaw/plugin-sdk/channel-pairing`](/reference/plugin-sdk/modules/channel-pairing)               | Channel   | `unstable` | Pairing controllers and DM approval flows.                                     |
| [`openclaw/plugin-sdk/channel-reply-pipeline`](/reference/plugin-sdk/modules/channel-reply-pipeline) | Channel   | `unstable` | Common reply and typing orchestration for channel plugins.                     |
| [`openclaw/plugin-sdk/channel-setup`](/reference/plugin-sdk/modules/channel-setup)                   | Channel   | `unstable` | Setup adapter surfaces for channel onboarding.                                 |
| [`openclaw/plugin-sdk/command-auth`](/reference/plugin-sdk/modules/command-auth)                     | Channel   | `unstable` | Shared command authorization helpers.                                          |
| [`openclaw/plugin-sdk/secret-input`](/reference/plugin-sdk/modules/secret-input)                     | Channel   | `unstable` | Secret input parsing and normalization helpers.                                |
| [`openclaw/plugin-sdk/webhook-ingress`](/reference/plugin-sdk/modules/webhook-ingress)               | Channel   | `unstable` | Webhook request validation, target registration, and routing helpers.          |
| [`openclaw/plugin-sdk/provider-onboard`](/reference/plugin-sdk/modules/provider-onboard)             | Provider  | `unstable` | Provider onboarding config patch helpers.                                      |
| [`openclaw/plugin-sdk/runtime-store`](/reference/plugin-sdk/modules/runtime-store)                   | Runtime   | `unstable` | Persistent runtime storage helpers for plugins.                                |
| [`openclaw/plugin-sdk/allow-from`](/reference/plugin-sdk/modules/allow-from)                         | Utilities | `unstable` | Allowlist formatting and normalization helpers.                                |
| [`openclaw/plugin-sdk/reply-payload`](/reference/plugin-sdk/modules/reply-payload)                   | Utilities | `unstable` | Reply payload normalization and outbound media helpers.                        |
| [`openclaw/plugin-sdk/testing`](/reference/plugin-sdk/modules/testing)                               | Utilities | `unstable` | Plugin test helpers, mocks, and runtime fixtures.                              |

## Generated from

- `scripts/lib/plugin-sdk-doc-metadata.ts`
- `scripts/generate-plugin-sdk-docs.ts`
