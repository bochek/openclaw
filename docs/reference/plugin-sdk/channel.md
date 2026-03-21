---
title: "Plugin SDK Channel"
sidebarTitle: "Channel"
summary: "Phase 1 channel-focused Plugin SDK modules for setup, pairing, reply, auth, and webhooks"
read_when:
  - You are building or migrating a channel plugin
  - You need setup, pairing, reply, auth, or webhook helpers
---

# Plugin SDK channel

The channel category covers the shared setup and messaging helpers used by
channel plugins.

## Reviewed phase 1 modules

| Import path                                  | Stability | Use this for                                         |
| -------------------------------------------- | --------- | ---------------------------------------------------- |
| `openclaw/plugin-sdk/channel-actions`        | `stable`  | Shared message action and reaction helpers           |
| `openclaw/plugin-sdk/channel-config-schema`  | `stable`  | Channel config schema builders                       |
| `openclaw/plugin-sdk/channel-contract`       | `stable`  | Channel contract types                               |
| `openclaw/plugin-sdk/channel-pairing`        | `stable`  | Pairing and DM approval flows                        |
| `openclaw/plugin-sdk/channel-reply-pipeline` | `stable`  | Reply prefix, typing, and reply orchestration        |
| `openclaw/plugin-sdk/channel-setup`          | `stable`  | Setup adapters and setup surfaces                    |
| `openclaw/plugin-sdk/command-auth`           | `stable`  | Shared command authorization helpers                 |
| `openclaw/plugin-sdk/secret-input`           | `stable`  | Secret input parsing and normalization               |
| `openclaw/plugin-sdk/webhook-ingress`        | `stable`  | Webhook validation, target registration, and routing |

## Notes

- These are the reviewed shared channel primitives for the first generated reference pass.
- Generated module pages land in phase 2.
