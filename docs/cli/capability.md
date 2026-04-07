---
summary: "Compatibility alias page for `openclaw capability`; use the dedicated `openclaw infer` docs"
read_when:
  - Adding or modifying `openclaw infer` commands
  - Updating compatibility aliases for infer-first automation
title: "Capability CLI Alias"
---

# Capability CLI Alias

`openclaw capability` is a compatibility alias for `openclaw infer`.

Use the dedicated infer page for the current command surface, examples, and JSON output contract:

- [Inference CLI](/cli/infer)

Example:

```bash
openclaw capability model run --prompt "Reply with exactly: smoke-ok" --json
```

`openclaw capability ...` and `openclaw infer ...` accept the same subcommands today, but docs, scripts, and future examples should target `infer`.
