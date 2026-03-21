---
title: "Plugin SDK Runtime"
sidebarTitle: "Runtime"
summary: "Phase 1 runtime-focused Plugin SDK modules for persistent plugin state"
read_when:
  - You need plugin runtime storage helpers
  - You are deciding what belongs in runtime vs utility docs
---

# Plugin SDK runtime

The runtime category covers shared helpers that plugins use to keep durable
runtime state.

## Reviewed phase 1 modules

| Import path                         | Stability  | Use this for                      |
| ----------------------------------- | ---------- | --------------------------------- |
| `openclaw/plugin-sdk/runtime-store` | `unstable` | Persistent plugin runtime storage |

## Notes

- Runtime-heavy or bundled-plugin-only helpers should not be documented here until reviewed.
- Generated module pages land in phase 2.
