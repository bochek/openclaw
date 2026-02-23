---
summary: "CLI reference for `openclaw sessions` (list stored sessions + usage)"
read_when:
  - You want to list stored sessions and see recent activity
title: "sessions"
---

# `openclaw sessions`

List stored conversation sessions.

```bash
openclaw sessions
openclaw sessions --active 120
openclaw sessions --json
```

## Cleanup maintenance

Run maintenance now (instead of waiting for the next write cycle):

```bash
openclaw sessions cleanup --dry-run
openclaw sessions cleanup --enforce
openclaw sessions cleanup --enforce --active-key "agent:main:telegram:dm:123"
openclaw sessions cleanup --json
```

`openclaw sessions cleanup` uses `session.maintenance` settings from config:

- `--dry-run`: preview how many entries would be pruned/capped without writing.
- `--enforce`: apply maintenance even when `session.maintenance.mode` is `warn`.
- `--active-key <key>`: protect a specific active key from disk-budget eviction.
- `--store <path>`: run against a specific `sessions.json` file.
- `--json`: print one JSON summary object. Dry-run output includes projected `diskBudget` impact (`totalBytesBefore/After`, `removedFiles`, `removedEntries`) when disk budgeting is enabled.

Related:

- Session config: [Configuration reference](/gateway/configuration-reference#session)
