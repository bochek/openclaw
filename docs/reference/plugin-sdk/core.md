---
title: "Plugin SDK Core"
sidebarTitle: "Core"
summary: "Phase 1 core entry surfaces for the Plugin SDK reference"
read_when:
  - You are looking for plugin entry helpers
  - You need the main plugin-facing types and entry surfaces
---

# Plugin SDK core

The core category covers the main entry surfaces plugin authors reach for first.

## Reviewed phase 1 modules

| Import path                        | Stability  | Use this for                                           |
| ---------------------------------- | ---------- | ------------------------------------------------------ |
| `openclaw/plugin-sdk/core`         | `unstable` | Main plugin entry helpers and base plugin-facing types |
| `openclaw/plugin-sdk/plugin-entry` | `unstable` | Small entry helper for provider and command plugins    |

## Notes

- Start with these surfaces before reaching for lower-level helpers, but do not
  treat them as frozen API yet.
- Generated module pages for these subpaths land in phase 2.
