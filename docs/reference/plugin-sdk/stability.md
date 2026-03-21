---
title: "Plugin SDK Stability"
sidebarTitle: "Stability"
summary: "How OpenClaw classifies reviewed Plugin SDK subpaths during the reference rollout"
read_when:
  - You need to know whether a Plugin SDK subpath is stable or unstable
  - You are deciding whether a helper belongs in public docs
  - You are reviewing Plugin SDK surface changes
---

# Plugin SDK stability

OpenClaw should use `stable` as a real compatibility promise, not as a soft
way to say "document this first."

The generated reference rollout uses these stability states:

| State      | Meaning                                                    | Docs behavior                                  |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `stable`   | Explicit compatibility promise for external plugin authors | Use only after deliberate compatibility review |
| `unstable` | Documented surface with no compatibility promise yet       | Warn clearly and avoid implying API freeze     |

## Phase 1 policy

Phase 1 does not try to document every current export. It sets up the docs
structure and the reviewed module set that phase 2 will generate first.

The current reviewed set favors:

- entry surfaces such as `core` and `plugin-entry`
- common channel setup, pairing, and reply helpers
- persistent runtime helpers
- migration-critical legacy surfaces that need clear warnings

Every currently documented subpath in this rollout is marked `unstable`,
including the compatibility surfaces in the legacy category.

## Legacy category

`legacy` remains useful as a docs category for migration-only surfaces, but it
is not a stability tier. These legacy-category surfaces are still `unstable`:

- `openclaw/plugin-sdk`
- `openclaw/plugin-sdk/compat`
- `openclaw/plugin-sdk/channel-runtime`

See [Legacy](/reference/plugin-sdk/legacy) for migration guidance and
[All Modules](/reference/plugin-sdk/all-modules) for the full current unstable set.
