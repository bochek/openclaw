---
summary: "Run multiple OpenClaw Gateways on one host (isolation, ports, and profiles)"
read_when:
  - Running more than one Gateway on the same machine
  - You need isolated config/state/ports per Gateway
title: "Multiple Gateways"
---

# Multiple Gateways (same host)

Most setups should use one Gateway because a single Gateway can handle multiple messaging connections and agents. If you need stronger isolation or redundancy (e.g., a rescue bot), run separate Gateways with isolated profiles/ports.

## Isolation checklist (required)

- `OPENCLAW_CONFIG_PATH` — per-instance config file
- `OPENCLAW_STATE_DIR` — per-instance sessions, creds, caches
- `agents.defaults.workspace` — per-instance workspace root
- `gateway.port` (or `--port`) — unique per instance
- Derived ports (browser/canvas) must not overlap

If these are shared, you will hit config races and port conflicts.

## Recommended: profiles (`--profile`)

Profiles are now first-class managed objects. A managed profile owns its config, state, workspace, and default gateway port under:

```text
~/.openclaw/profiles/<id>/
```

Use `openclaw profile create <id>` for a fresh profile, `openclaw profile import <id>` to adopt an existing legacy `~/.openclaw-<id>` layout without changing behavior, and `openclaw profile clone <source> <id>` for a new isolated copy.

```bash
# main
openclaw profile create main
openclaw --profile main setup
openclaw --profile main gateway --port 18789

# rescue
openclaw profile create rescue
openclaw --profile rescue setup
openclaw --profile rescue gateway --port 19001
```

Per-profile services:

```bash
openclaw --profile main gateway install
openclaw --profile rescue gateway install
```

## Rescue-bot guide

Run a second Gateway on the same host with its own:

- profile config
- state dir
- workspace
- base port (plus derived ports)

This keeps the rescue bot isolated from the main bot so it can debug or apply config changes if the primary bot is down.

Port spacing: leave at least 20 ports between base ports so the derived browser/canvas/CDP ports never collide.

### How to install (rescue bot)

```bash
# Main bot (existing or fresh, without --profile param)
# Runs on port 18789 + Chrome CDC/Canvas/... Ports
openclaw onboard
openclaw gateway install

# Rescue bot (isolated profile + ports)
openclaw profile create rescue
openclaw --profile rescue onboard
# Notes:
# - workspace is isolated under the rescue profile root by default
# - choose a base port with at least 20 ports of spacing from the main instance
# - the rest of onboarding is the same as normal

# To install the service (if not happened automatically during setup)
openclaw --profile rescue gateway install
```

## Port mapping (derived)

Base port = `gateway.port` (or `OPENCLAW_GATEWAY_PORT` / `--port`).

- browser control service port = base + 2 (loopback only)
- canvas host is served on the Gateway HTTP server (same port as `gateway.port`)
- Browser profile CDP ports auto-allocate from `browser.controlPort + 9 .. + 108`

If you override any of these in config or env, you must keep them unique per instance.

## Browser/CDP notes (common footgun)

- Do **not** pin `browser.cdpUrl` to the same values on multiple instances.
- Each instance needs its own browser control port and CDP range (derived from its gateway port).
- If you need explicit CDP ports, set `browser.profiles.<name>.cdpPort` per instance.
- Remote Chrome: use `browser.profiles.<name>.cdpUrl` (per profile, per instance).

## Manual env example

Manual env isolation still works, but profiles are the preferred product surface because they keep config/state/workspace/runtime metadata together.

```bash
OPENCLAW_CONFIG_PATH=~/.openclaw/main.json \
OPENCLAW_STATE_DIR=~/.openclaw-main \
openclaw gateway --port 18789

OPENCLAW_CONFIG_PATH=~/.openclaw/rescue.json \
OPENCLAW_STATE_DIR=~/.openclaw-rescue \
openclaw gateway --port 19001
```

## Quick checks

```bash
openclaw --profile main status
openclaw --profile rescue status
openclaw --profile rescue browser status
```
