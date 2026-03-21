---
title: "Plugin SDK Channel"
sidebarTitle: "Channel"
summary: "Generated index for the current channel-focused Plugin SDK modules used for setup, pairing, reply, auth, and webhook flows."
---

# Plugin SDK channel

Generated index for the current channel-focused Plugin SDK modules used for setup, pairing, reply, auth, and webhook flows.

> Every module listed here is currently unstable until OpenClaw makes an explicit compatibility promise.

## Modules

| Import path                                                                                          | Stability  | Summary                                                               |
| ---------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| [`openclaw/plugin-sdk/channel-actions`](/reference/plugin-sdk/modules/channel-actions)               | `unstable` | Shared action and reaction helpers for channel plugins.               |
| [`openclaw/plugin-sdk/channel-config-schema`](/reference/plugin-sdk/modules/channel-config-schema)   | `unstable` | Channel config schema builders and shared schema primitives.          |
| [`openclaw/plugin-sdk/channel-contract`](/reference/plugin-sdk/modules/channel-contract)             | `unstable` | Core channel contract types for channel plugins.                      |
| [`openclaw/plugin-sdk/channel-pairing`](/reference/plugin-sdk/modules/channel-pairing)               | `unstable` | Pairing controllers and DM approval flows.                            |
| [`openclaw/plugin-sdk/channel-reply-pipeline`](/reference/plugin-sdk/modules/channel-reply-pipeline) | `unstable` | Common reply and typing orchestration for channel plugins.            |
| [`openclaw/plugin-sdk/channel-setup`](/reference/plugin-sdk/modules/channel-setup)                   | `unstable` | Setup adapter surfaces for channel onboarding.                        |
| [`openclaw/plugin-sdk/command-auth`](/reference/plugin-sdk/modules/command-auth)                     | `unstable` | Shared command authorization helpers.                                 |
| [`openclaw/plugin-sdk/secret-input`](/reference/plugin-sdk/modules/secret-input)                     | `unstable` | Secret input parsing and normalization helpers.                       |
| [`openclaw/plugin-sdk/webhook-ingress`](/reference/plugin-sdk/modules/webhook-ingress)               | `unstable` | Webhook request validation, target registration, and routing helpers. |

## Generated from

- `scripts/lib/plugin-sdk-doc-metadata.ts`
- `scripts/generate-plugin-sdk-docs.ts`
