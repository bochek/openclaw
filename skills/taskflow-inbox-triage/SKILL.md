---
name: taskflow-inbox-triage
description: Example TaskFlow authoring pattern for inbox triage. Use when messages need different treatment based on intent, with some routes notifying immediately, some waiting on outside answers, and others rolling into a later summary.
metadata: { "openclaw": { "emoji": "📥" } }
---

# TaskFlow inbox triage

This is a concrete example of how to think about TaskFlow without turning the core runtime into a DSL.

## Goal

Triage inbox items with one owner flow:

- business → post to Slack and wait for reply
- personal → notify the owner now
- everything else → keep for end-of-day summary

## Pattern

1. Create one flow for the inbox batch.
2. Run one detached task to classify new items.
3. Resume the flow when classification completes.
4. Route each item in the calling logic.
5. Persist only the summary bucket and the current wait target.

## Minimal runtime calls

```ts
const taskFlow = api.runtime.taskFlow.fromToolContext(ctx);

const flow = taskFlow.createManaged({
  goal: "triage inbox",
  controllerId: "my-plugin/inbox",
});

taskFlow.runTask({
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

## Related example

- `skills/taskflow/examples/inbox-triage.lobster`
