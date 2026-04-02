---
summary: "CLI reference for `openclaw flows` (list, inspect, cancel)"
read_when:
  - You want to inspect or cancel a TaskFlow
  - You want to see how background tasks roll up into a higher-level job
title: "flows"
---

# `openclaw flows`

Inspect and manage [TaskFlow](/automation/taskflow) jobs.

```bash
openclaw flows list
openclaw flows show <lookup>
openclaw flows cancel <lookup>
```

## Commands

### `flows list`

List tracked flows and their task counts.

```bash
openclaw flows list
openclaw flows list --status blocked
openclaw flows list --json
```

Accepted `--status` values are:

- `queued`
- `running`
- `waiting`
- `blocked`
- `succeeded`
- `failed`
- `cancelled`
- `lost`

### `flows show`

Show one flow by flow id or owner session key.

```bash
openclaw flows show <lookup>
openclaw flows show <lookup> --json
```

The output includes the flow status, current step, wait state, cancel-requested state, controller id, and linked tasks.

### `flows cancel`

Cancel a flow and any active child tasks.

```bash
openclaw flows cancel <lookup>
```

## Recovery tip

If a flow looks stuck or orphaned, run:

```bash
openclaw doctor
```

The doctor note points you back at `openclaw flows show` and `openclaw flows cancel` for obvious broken linkage cases.

## Related

- [TaskFlow](/automation/taskflow) — job-level orchestration above tasks
- [Background Tasks](/automation/tasks) — detached work ledger
- [CLI reference](/cli/index) — full command tree
