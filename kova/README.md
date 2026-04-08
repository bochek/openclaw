# Kova

Kova is the OpenClaw verification platform. It runs verification workflows, records canonical run artifacts, compares results across backends, and exposes the catalog and history that those runs produce.

## Command Surface

```bash
pnpm kova --help
pnpm kova run qa --scenario channel-chat-baseline
pnpm kova run parallels --guest macos --mode fresh
pnpm kova report latest
pnpm kova diff
pnpm kova list runs
```

## Core Concepts

- `run`: execute a verification workload and record a canonical Kova artifact
- `report`: inspect one recorded run artifact
- `diff`: compare a candidate run against a baseline policy or explicit run id
- `list`: browse catalog, history, backends, scenarios, and capabilities through explicit subjects

## Current Scope

- QA is the first Kova lane.
- Host runtime and Multipass are the first backend surfaces.
- Parallels is available as a guest-smoke target over the existing smoke scripts.
- Multipass defaults to a curated QA core subset when `--scenario` is omitted.
- Artifacts are written under `.artifacts/kova/runs/`.
