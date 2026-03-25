---
summary: "Create, inspect, import, clone, doctor, and delete managed OpenClaw profiles"
read_when:
  - Working with multiple isolated OpenClaw setups on one machine
  - Migrating from legacy ~/.openclaw-<name> profile directories
title: "profile"
---

# `openclaw profile`

Use `openclaw profile` to manage first-class OpenClaw profiles.

Managed profiles live under:

```text
~/.openclaw/profiles/<id>/
  profile.json
  config/openclaw.json
  state/
  workspace/
```

`--profile <id>` selects a profile at runtime. `--dev` is an alias for the `dev` profile.

## Commands

- `openclaw profile list`
- `openclaw profile get <id>`
- `openclaw profile paths <id>`
- `openclaw profile create <id>`
- `openclaw profile clone <source> <id>`
- `openclaw profile import <id>`
- `openclaw profile doctor <id>`
- `openclaw profile delete <id> --yes`

## Common flows

Create an empty managed profile:

```bash
openclaw profile create rescue
openclaw --profile rescue setup
```

Adopt an existing legacy profile without changing its config/state/workspace behavior:

```bash
openclaw profile import rescue
```

Clone a profile into a fresh isolated instance:

```bash
openclaw profile clone main rescue
```

Clone preserves durable config and credentials, allocates a fresh workspace and runtime identity, and excludes ephemeral runtime artifacts by default.

## Notes

- `profile import` is for behavior-preserving legacy adoption.
- `profile clone` is for creating a new isolated runtime instance.
- `profile delete` only removes managed profile roots and refuses live profiles unless you pass `--force`.
- For multi-gateway deployment guidance, see [Multiple Gateways](/gateway/multiple-gateways).
