---
name: taskflow.authoring
description: Use when you need to author or modify a TaskFlow job in plain code or plugin logic without inventing a new DSL. Bind `api.runtime.taskFlow` from trusted OpenClaw context, keep branching in the caller, and use TaskFlow for identity, task linkage, waiting, cancellation, and owner-facing emergence.
metadata: { "openclaw": { "emoji": "🪝" } }
---

# TaskFlow authoring

Use this skill when work should span one or more detached tasks but still behave like one job with one owner session and one return context.

## Use the bound runtime, not raw record mutation

Prefer the bound runtime surface:

- `api.runtime.taskFlow.bindSession(...)`
- `api.runtime.taskFlow.fromToolContext(...)`

That handle exposes the runtime verbs already scoped to one owner:

- `createManaged(...)`
- `runTask(...)`
- `setWaiting(...)`
- `resume(...)`
- `finish(...)`
- `fail(...)`
- `requestCancel(...)`
- `cancel(...)`

## Keep TaskFlow small

TaskFlow owns:

- flow identity
- owner session and return context
- waiting state
- blocked, finish, fail, and cancel state

Do **not** put branching semantics into core TaskFlow calls. Keep decisions in the caller, skill logic, or a higher authoring layer like Lobster, acpx, or webhook-driven orchestration.

## Authoring pattern

1. Bind one TaskFlow runtime from trusted context.
2. Create one managed flow.
3. Spawn one detached task under that flow.
4. Wait on the child task or outside event.
5. Resume in the caller.
6. Route to the next task, update, or finish.

## Example

```ts
const taskFlow = api.runtime.taskFlow.fromToolContext(ctx);

const flow = taskFlow.createManaged({
  controllerId: "my-plugin/inbox",
  goal: "triage inbox",
  currentStep: "classify",
});

const started = taskFlow.runTask({
  flowId: flow.flowId,
  runtime: "acp",
  task: "Classify inbox messages",
});

taskFlow.setWaiting({
  flowId: flow.flowId,
  expectedRevision: flow.revision,
  currentStep: "wait_for_classification",
});
```

## Good fit

- Telegram or Slack agents that need background work to return to the same thread
- multi-step detached work that should still look like one job
- flows that may block, retry, or wait on outside answers

## Not the right layer

- full branching DSLs
- graph editors
- business-specific routing logic

Those should sit above TaskFlow and call the runtime surface.
