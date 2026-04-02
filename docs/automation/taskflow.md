---
summary: "TaskFlow orchestration for detached background work"
read_when:
  - You want one job to own one or more detached tasks
  - You want to inspect or cancel a background job as a unit
  - You want to understand how TaskFlow relates to tasks
title: "TaskFlow"
---

# TaskFlow

TaskFlow is the orchestration layer above [Background Tasks](/automation/tasks). Tasks still track detached work. TaskFlow groups those task runs into a single owned job with shared lifecycle, wait/cancel state, and a higher-level operator surface.

Use TaskFlow when the work is more than one detached run, or when the job should keep one owner/session context even as it fans out into child tasks.

## TL;DR

- Tasks are the execution records.
- TaskFlow is the job-level wrapper above tasks.
- A TaskFlow keeps one owner/session context for the whole job.
- Use `openclaw flows list`, `openclaw flows show`, and `openclaw flows cancel` to inspect or manage TaskFlows.
- Plugin and authoring layers should target the bound `api.runtime.taskFlow` seam instead of mutating raw flow records.

## Quick start

```bash
openclaw flows list
openclaw flows show <flow-id-or-owner-session>
openclaw flows cancel <flow-id-or-owner-session>
```

## How it relates to tasks

Background tasks still do the low-level work:

- ACP runs
- subagent runs
- cron executions
- CLI-initiated runs

TaskFlow sits above that ledger:

- it keeps related task runs under one flow id
- it tracks the parent job state separately from the individual task state
- it makes blocked, waiting, or multi-step work easier to inspect from one place

For a single detached run, the flow can be a one-task flow. For more structured work, TaskFlow can keep multiple task runs under the same job.

## Runtime substrate

TaskFlow is the durable runtime substrate, not a workflow language.

It owns:

- the flow id
- the owner session and return context
- waiting and cancel-requested state
- finish, fail, cancel, and blocked state
- task-to-flow linkage for managed child tasks

It does **not** own branching or business logic. Put that in the authoring layer above it:

- Lobster
- vbrief
- Zapier or webhook-driven orchestration
- plugin-owned TypeScript logic
- skills and prompts

## Plugin/runtime seam

For plugin or authoring code, bind the runtime from trusted OpenClaw context and then operate on the bound handle:

- `api.runtime.taskFlow.bindSession(...)`
- `api.runtime.taskFlow.fromToolContext(...)`
- `createManaged(...)`
- `runTask(...)`
- `setWaiting(...)`
- `resume(...)`
- `finish(...)`
- `fail(...)`
- `requestCancel(...)`
- `cancel(...)`

That keeps ownership and return-path behavior in core while leaving orchestration logic outside core.

## CLI surface

The flow CLI is intentionally small:

- `openclaw flows list` shows active and recent flows
- `openclaw flows show <lookup>` shows one flow and its linked tasks
- `openclaw flows cancel <lookup>` requests cancellation and shuts down active child tasks

The lookup token accepts either a flow id or the owner session key.

## Related

- [Background Tasks](/automation/tasks) — detached work ledger
- [CLI: flows](/cli/flows) — flow inspection and control commands
- [Cron Jobs](/automation/cron-jobs) — scheduled jobs that may create tasks
- [Lobster](/tools/lobster) — one authoring layer above the TaskFlow runtime
