---
title: "Plugin SDK Utilities"
sidebarTitle: "Utilities"
summary: "Phase 1 utility-focused Plugin SDK modules for allowlists, reply payloads, and testing"
read_when:
  - You need shared utility helpers from the Plugin SDK
  - You are looking for testing or reply payload helpers
---

# Plugin SDK utilities

The utilities category groups reviewed helpers that are broadly useful but do
not define the main plugin entry flow on their own.

## Reviewed phase 1 modules

| Import path                         | Stability  | Use this for                                           |
| ----------------------------------- | ---------- | ------------------------------------------------------ |
| `openclaw/plugin-sdk/allow-from`    | `unstable` | Allowlist formatting and normalization                 |
| `openclaw/plugin-sdk/reply-payload` | `unstable` | Reply payload normalization and outbound media helpers |
| `openclaw/plugin-sdk/testing`       | `unstable` | Plugin test helpers and runtime fixtures               |

## Notes

- These utilities support the current phase 1 plugin author workflow, but they
  are still marked unstable.
- Generated module pages land in phase 2.
