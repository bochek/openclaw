---
title: "Plugin SDK Stability"
sidebarTitle: "Stability"
summary: "How OpenClaw classifies reviewed Plugin SDK subpaths during the reference rollout"
read_when:
  - You need to know whether a Plugin SDK subpath is stable or legacy
  - You are deciding whether a helper belongs in public docs
  - You are reviewing Plugin SDK surface changes
---

# Plugin SDK stability

Not every exported helper should be treated as equally stable.

The generated reference rollout uses these tiers:

| Tier       | Meaning                                                     | Docs behavior                                 |
| ---------- | ----------------------------------------------------------- | --------------------------------------------- |
| `stable`   | Recommended public contract for plugin authors              | Document first and link from guides           |
| `advanced` | Public but niche or low-level                               | Document after the core stable set is solid   |
| `legacy`   | Compatibility-only or deprecated                            | Document with warnings and migration guidance |
| `hidden`   | Exported today but intentionally omitted from the reference | Do not publish until reviewed                 |

## Phase 1 policy

Phase 1 does not try to document every current export. It sets up the docs
structure and the reviewed module set that phase 2 will generate first.

The current reviewed set favors:

- entry surfaces such as `core` and `plugin-entry`
- common channel setup, pairing, and reply helpers
- persistent runtime helpers
- migration-critical legacy surfaces that need clear warnings

## Legacy surfaces

The following surfaces are treated as legacy in the current rollout:

- `openclaw/plugin-sdk`
- `openclaw/plugin-sdk/compat`
- `openclaw/plugin-sdk/channel-runtime`

See [Legacy](/reference/plugin-sdk/legacy) for details.
