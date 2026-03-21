---
title: "Plugin SDK Modules"
sidebarTitle: "All Modules"
summary: "Reviewed phase 1 Plugin SDK modules grouped by category and stability"
read_when:
  - You want the reviewed module set for the Plugin SDK docs rollout
  - You need a quick index before generated module pages exist
---

# Plugin SDK modules

This page tracks the reviewed phase 1 module set for the Plugin SDK reference.
Generated per-module pages land in the next phase.

## Stable

| Import path                                  | Category  | Primary use                                |
| -------------------------------------------- | --------- | ------------------------------------------ |
| `openclaw/plugin-sdk/allow-from`             | Utilities | Allowlist formatting and normalization     |
| `openclaw/plugin-sdk/channel-actions`        | Channel   | Shared action and reaction helpers         |
| `openclaw/plugin-sdk/channel-config-schema`  | Channel   | Channel config schema builders             |
| `openclaw/plugin-sdk/channel-contract`       | Channel   | Channel contract types                     |
| `openclaw/plugin-sdk/channel-pairing`        | Channel   | Pairing and approval flows                 |
| `openclaw/plugin-sdk/channel-reply-pipeline` | Channel   | Reply and typing orchestration             |
| `openclaw/plugin-sdk/channel-setup`          | Channel   | Channel setup adapters                     |
| `openclaw/plugin-sdk/command-auth`           | Channel   | Shared command authorization helpers       |
| `openclaw/plugin-sdk/core`                   | Core      | Main plugin entry surface                  |
| `openclaw/plugin-sdk/plugin-entry`           | Core      | Small entry helper for non-channel plugins |
| `openclaw/plugin-sdk/provider-onboard`       | Provider  | Provider onboarding config helpers         |
| `openclaw/plugin-sdk/reply-payload`          | Utilities | Reply payload and outbound media helpers   |
| `openclaw/plugin-sdk/runtime-store`          | Runtime   | Persistent plugin runtime storage          |
| `openclaw/plugin-sdk/secret-input`           | Channel   | Secret input parsing and normalization     |
| `openclaw/plugin-sdk/testing`                | Utilities | Plugin test helpers and fixtures           |
| `openclaw/plugin-sdk/webhook-ingress`        | Channel   | Webhook validation and target registration |

## Legacy

| Import path                           | Why it stays documented                            |
| ------------------------------------- | -------------------------------------------------- |
| `openclaw/plugin-sdk`                 | Root barrel kept for compatibility                 |
| `openclaw/plugin-sdk/channel-runtime` | Older channel runtime helper shim                  |
| `openclaw/plugin-sdk/compat`          | Deprecated compatibility surface for older plugins |

## Next phase

The next phase adds generated module pages for the stable set under
`/reference/plugin-sdk/modules/*`.
