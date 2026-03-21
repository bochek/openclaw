---
title: "Plugin SDK Legacy"
sidebarTitle: "Legacy"
summary: "Compatibility-only Plugin SDK surfaces that remain documented for migration"
read_when:
  - You are migrating away from deprecated Plugin SDK imports
  - You need to understand why a compatibility surface is still present
---

# Plugin SDK legacy

These surfaces still exist for compatibility, but they are not the recommended
entrypoints for new plugin code. They are also classified as `unstable`.

## Reviewed legacy modules

| Import path                           | Why it remains documented                      | Preferred direction                          |
| ------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| `openclaw/plugin-sdk`                 | Root barrel kept for compatibility             | Use focused `openclaw/plugin-sdk/*` subpaths |
| `openclaw/plugin-sdk/channel-runtime` | Older channel runtime helper shim              | Prefer the dedicated channel subpaths        |
| `openclaw/plugin-sdk/compat`          | Deprecated migration surface for older plugins | Migrate to focused subpaths                  |

## Notes

- Legacy docs stay visible so migration guidance has a consistent target.
- New generated module pages should emphasize migration, not new usage.
