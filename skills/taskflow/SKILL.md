---
name: taskflow
description: Use when work should span one or more detached tasks but still behave like one job with a single owner context. TaskFlow is the runtime substrate under authoring layers like Lobster, acpx, or plain code. Keep conditional logic in the caller; use TaskFlow for flow identity, waiting, cancellation, and user-facing emergence.
metadata: { "openclaw": { "emoji": "🪝" } }
---

# TaskFlow

Use TaskFlow when a job needs to outlive one prompt or one detached run, but you still want one owner session, one thread context, and one place to inspect or resume the work.

## When to use it

- Multi-step background work with one owner
- Work that waits on detached ACP or subagent tasks
- Jobs that may need to emit one clear update back to the owner
- Jobs that need a small persisted output bag between steps

## What TaskFlow owns

- flow identity
- owner session and return context
- waiting state
- cancel-requested state
- finish, fail, cancel, and blocked state

It does **not** own branching or business logic. Put that in Lobster, acpx, or the calling code.

## Runtime pattern

1. Bind `api.runtime.taskFlow` from trusted OpenClaw context.
2. `createManaged(...)`
3. `runTask(...)`
4. `setWaiting(...)` or `resume(...)`
5. `finish(...)`, `fail(...)`, or `requestCancel(...)`

## Example shape

```ts
const taskFlow = api.runtime.taskFlow.fromToolContext(ctx);

const flow = taskFlow.createManaged({
  goal: "triage inbox",
  controllerId: "my-plugin/inbox",
});

const classify = taskFlow.runTask({
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

## Keep conditionals above the runtime

Use the flow runtime for state and task linkage. Keep decisions in the authoring layer:

- `business` → post to Slack and wait
- `personal` → notify the owner now
- `later` → append to an end-of-day summary bucket

## Examples

- See `skills/taskflow/examples/inbox-triage.lobster`
- See `skills/taskflow/examples/pr-intake.lobster`
- See `skills/taskflow-inbox-triage/SKILL.md` for a concrete routing pattern
