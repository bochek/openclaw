---
name: session-memory
description: "Save session context to memory when /new or /reset command is issued"
homepage: https://docs.openclaw.ai/automation/hooks#session-memory
metadata:
  {
    "openclaw":
      {
        "emoji": "💾",
        "events": ["command:new", "command:reset"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Session Memory Hook

Automatically saves session context to your workspace memory when you issue `/new` or `/reset`.

## What It Does

When you run `/new` or `/reset` to start a fresh session:

1. **Finds the previous session** - Uses the pre-reset session entry to locate the correct transcript
2. **Extracts conversation** - Reads the last N user/assistant messages from the session (default: 15, configurable)
3. **Saves to memory** - Creates a new file at `<workspace>/memory/YYYY-MM-DD-HHMMSSmmm.md`

## Output Format

Memory files are created with the following format:

```markdown
# Session: 2026-01-16 14:30:00 UTC

- **Session Key**: agent:main:main
- **Session ID**: abc123def456
- **Source**: telegram
```

## Filename Examples

Memory files use the UTC timestamp from when the hook runs:

- `2026-01-16-143000123.md`
- `2026-01-16-231530045.md`

## Requirements

- **Config**: `workspace.dir` must be set (automatically configured during setup)

## Configuration

The hook supports optional configuration:

| Option     | Type   | Default | Description                                                     |
| ---------- | ------ | ------- | --------------------------------------------------------------- |
| `messages` | number | 15      | Number of user/assistant messages to include in the memory file |

Example configuration:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "session-memory": {
          "enabled": true,
          "messages": 25
        }
      }
    }
  }
}
```

The hook automatically:

- Uses your workspace directory (`~/.openclaw/workspace` by default)
- Uses timestamp-based filenames to avoid rename and reindex timing issues

## Disabling

To disable this hook:

```bash
openclaw hooks disable session-memory
```

Or remove it from your config:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "session-memory": { "enabled": false }
      }
    }
  }
}
```
