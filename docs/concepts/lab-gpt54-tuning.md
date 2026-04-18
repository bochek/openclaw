---
title: "GPT-5.4 Tuning"
summary: "How to tune the shipped GPT-5.4 Lab addendum and what each block actually changes"
read_when:
  - You want to edit `.openclaw/lab/overrides/gpt-5.4/AGENTS.md`
  - You want to understand the XML-style blocks in the GPT-5.4 Lab addendum
  - You want practical tuning guidance that matches what OpenClaw actually ships
---

# Tuning the GPT-5.4 Agent Addendum

The shipped GPT-5.4 Lab addendum is a set of **XML-style behavior contracts**
for Codex/GPT-5.4. Each block is a tuning knob that changes how the agent
behaves: output shape, verbosity, ask-vs-proceed behavior, tool persistence,
completion criteria, progress updates, and persona stability.

In OpenClaw, these blocks live in:

```txt
.openclaw/lab/overrides/gpt-5.4/AGENTS.md
```

When Lab custom overrides are enabled, that file becomes a **prepended**
high-priority addendum above the normal repo `AGENTS.md`.

## Quick operator guide

For most use cases, the shipped default behavior is already well tuned. Reach
for these edits when you want to bias the agent for a narrower operating style.

If you do want the shortest useful customization path:

1. Turn Lab custom overrides on:

```txt
/lab enable custom
```

2. Edit the live GPT-5.4 addendum:

```txt
.openclaw/lab/overrides/gpt-5.4/AGENTS.md
```

3. Change the smallest block that matches the behavior you want.

Quick “if this, tune that” map:

- persona is inconsistent:
  tune `<persona_latch>`
- answers are too long:
  tune `<verbosity_controls>`
- it asks too many questions:
  tune `<default_follow_through_policy>` and `<missing_context_gating>`
- it stops after one weak search:
  tune `<tool_persistence_rules>` and `<empty_result_recovery>`
- it misses one deliverable:
  tune `<completeness_contract>`
- it stops at analysis instead of implementing:
  tune `<autonomy_and_persistence>`
- progress updates are noisy:
  tune `<user_updates_spec>`
- shell behavior feels unsafe:
  tune `<terminal_tool_hygiene>`

Operator defaults:

- keep edits small and targeted
- change one block at a time when possible
- prefer tightening an existing block before adding new prompt text
- treat the repo copy as the source of truth, then sync the live workspace copy
  if needed for testing

The shipped default is meant to work well without mandatory tuning. When you do
customize it, the safest path is still:

1. Keep edits small and targeted.
2. Clarify the split between ask-vs-proceed and implementation-by-default.
3. Keep `IDENTITY.md` as the durable contract and `SOUL.md` as flavor only.

## Prompt-file interplay

The GPT-5.4 Lab addendum does not operate alone. In OpenClaw it sits inside a
larger prompt stack:

- `IDENTITY.md` provides durable decision style, voice, boundaries, and default
  behavioral posture
- `SOUL.md` provides flavor, tone, and project personality texture
- `USER.md` can still matter when a workspace uses it for user-specific
  standing preferences or local operator expectations
- `TOOLS.md` matters whenever tool-use policy, tool boundaries, or available
  workflow patterns are defined there
- the Lab GPT-5.4 addendum acts as a model-family-specific behavior overlay
- `FINAL_REMINDER.md` is appended at the very end of the prompt and restates
  that the operating contract near the top remains the default unless something
  more specific overrides it

A practical way to think about the split:

- use `IDENTITY.md` for durable character and decision style
- use `SOUL.md` for flavor only
- use `USER.md` for workspace- or operator-specific preference shaping
- use `TOOLS.md` for tool behavior and usage constraints
- use the Lab addendum for GPT-5.4-specific execution and writing behavior
- use `FINAL_REMINDER.md` as the tail guard that reinforces the main operating
  contract

That means the GPT-5.4 addendum should usually tune **how the model behaves**,
not replace the responsibilities of the other files.

If you want to tune things like emoji usage, light expressiveness, warmth, or
how playful the assistant sounds, that usually belongs in `SOUL.md`, not in the
GPT-5.4 addendum. The addendum should decide persistence, output shape,
initiative, verification, and tool behavior; `SOUL.md` should decide how much
sparkle or ornamentation is appropriate.

## Reference

The rest of this page is the detailed reference for the shipped GPT-5.4 addendum.

## What OpenClaw actually ships

The current GPT-5.4 Lab addendum in this repo includes these blocks:

```txt
<persona_latch>
<output_contract>
<verbosity_controls>
<default_follow_through_policy>
<instruction_priority>
<tool_persistence_rules>
<dependency_checks>
<parallel_tool_calling>
<completeness_contract>
<empty_result_recovery>
<verification_loop>
<missing_context_gating>
<action_safety>
<user_updates_spec>
<autonomy_and_persistence>
<terminal_tool_hygiene>
```

The current shipped addendum keeps progress-update behavior in a single
`<user_updates_spec>` block. If you publish or share this pattern more broadly,
keeping that guidance merged is the cleanest structure.

## Quick tuning map

| If you want…                        | Tune this block                                                | Main change                                                   |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| Stronger persona consistency        | `<persona_latch>`                                              | Strengthen persistence and drift checks                       |
| Less roleplay, more precision       | `<persona_latch>`                                              | Emphasize correctness before flavor                           |
| Exact output sections               | `<output_contract>`                                            | Require exact section order and no extras                     |
| Shorter answers                     | `<verbosity_controls>`                                         | Tighten concision rules                                       |
| Fewer clarifying questions          | `<default_follow_through_policy>` + `<missing_context_gating>` | Allow reversible assumptions                                  |
| More confirmation before actions    | `<default_follow_through_policy>` + `<action_safety>`          | Ask before writes or external side effects                    |
| More exhaustive tool use            | `<tool_persistence_rules>`                                     | Retry and verify before stopping                              |
| Faster / lighter tool use           | `<tool_persistence_rules>`                                     | Restrict tools to high-value cases                            |
| Fewer missed requirements           | `<completeness_contract>`                                      | Require explicit deliverable coverage                         |
| Better recovery after empty lookups | `<empty_result_recovery>`                                      | Add fallback lookup strategies                                |
| More reliable final answers         | `<verification_loop>`                                          | Require correctness, grounding, formatting, and safety checks |
| More implementation by default      | `<autonomy_and_persistence>`                                   | Bias toward making changes when intent is clear               |
| More review-only behavior           | `<autonomy_and_persistence>`                                   | Avoid edits unless explicitly asked                           |
| Less noisy progress updates         | `<user_updates_spec>`                                          | Reduce update triggers                                        |
| Safer terminal usage                | `<terminal_tool_hygiene>`                                      | Prefer direct edit tools and lightweight verification         |

## How to think about the blocks

### 1. Persona persistence

Block:

```txt
<persona_latch>
...
</persona_latch>
```

What it controls:

- durable character and voice behavior across the session
- how strongly `IDENTITY.md` and `SOUL.md` influence the answer
- when persona should yield to correctness and exact formatting

OpenClaw-specific note:

- this block assumes `IDENTITY.md` and `SOUL.md` are already present in the
  wider system prompt
- `IDENTITY.md` is treated as the durable contract
- `SOUL.md` is treated as flavor only
- `USER.md` and `TOOLS.md` can still shape the run outside this block; this
  block should not try to absorb their job
- `FINAL_REMINDER.md` lands at the end of the prompt and reinforces the main
  operating contract after all other prompt files have been assembled

Good default:

- keep persona as a **latch**, not a costume
- let the project voice persist without turning technical work into roleplay
- if you want more or fewer emojis, tune that in `SOUL.md` rather than stuffing
  emoji rules into the addendum

### 2. Output contract

Block:

```txt
<output_contract>
...
</output_contract>
```

What it controls:

- exact output shape
- whether extra sections are allowed
- whether strict formats like JSON or XML must be emitted alone

This is the highest-leverage block for predictable structure.

### 3. Verbosity

Block:

```txt
<verbosity_controls>
...
</verbosity_controls>
```

What it controls:

- answer length
- density
- whether background context is included by default

This is about **how much** the agent says, not **what format** it uses.

### 4. Ask-vs-proceed behavior

Block:

```txt
<default_follow_through_policy>
...
</default_follow_through_policy>
```

What it controls:

- whether the agent acts or asks first
- when reversible low-risk assumptions are acceptable
- when missing context or side effects should force confirmation

This is distinct from autonomy: it is about **ask vs proceed**, not
**analysis vs implementation**.

### 5. Instruction priority

Block:

```txt
<instruction_priority>
...
</instruction_priority>
```

What it controls:

- how conflicts are resolved
- how user instructions interact with style defaults
- how persona yields to correctness and permissions

In the shipped addendum there are two priority concepts:

- `<persona_latch>` explains persona-vs-usefulness behavior
- `<instruction_priority>` explains general instruction conflict behavior

That split is okay as long as the docs say so explicitly.

### 6. Tool persistence

Block:

```txt
<tool_persistence_rules>
...
</tool_persistence_rules>
```

What it controls:

- how early the agent gives up after a failed retrieval
- whether it retries with better queries or tools
- whether it stops after “good enough” or verifies properly

This is one of the most important blocks for long-running agentic work.

### 7. Dependency checks

Block:

```txt
<dependency_checks>
...
</dependency_checks>
```

What it controls:

- whether prerequisite discovery happens before implementation
- whether the agent skips lookup steps and relies on assumptions

Use this to stop the model from jumping straight into code changes without
checking the actual file, branch, config, or command output first.

### 8. Parallel tool calling

Block:

```txt
<parallel_tool_calling>
...
</parallel_tool_calling>
```

What it controls:

- whether independent retrieval happens in parallel
- whether the agent waits to synthesize before making more calls

This is useful for keeping GPT-5.4 fast without making tool use chaotic.

### 9. Completeness

Block:

```txt
<completeness_contract>
...
</completeness_contract>
```

What it controls:

- what “done” means
- whether the agent tracks deliverables internally
- whether blocked items are marked explicitly

If the agent tends to miss one requested item in a multi-part ask, this is the
block to strengthen first.

### 10. Empty-result recovery

Block:

```txt
<empty_result_recovery>
...
</empty_result_recovery>
```

What it controls:

- whether the agent concludes “not found” too quickly
- whether it tries alternate queries, broader filters, or adjacent files first

This is especially valuable in repo exploration and debugging.

### 11. Verification loop

Block:

```txt
<verification_loop>
...
</verification_loop>
```

What it controls:

- final self-checks before answering
- correctness, grounding, formatting, and safety review

For code work, this is the right place to say “run the smallest useful
verification step before claiming success.”

### 12. Missing context gating

Block:

```txt
<missing_context_gating>
...
</missing_context_gating>
```

What it controls:

- when the agent is allowed to guess
- when it should fetch missing context
- when it should ask a clarifying question

This overlaps with follow-through, but the distinction is:

- `default_follow_through_policy` = ask vs proceed
- `missing_context_gating` = guess vs retrieve vs ask

### 13. Action safety

Block:

```txt
<action_safety>
...
</action_safety>
```

What it controls:

- pre-flight confirmation behavior
- post-flight reporting
- whether local reversible edits proceed smoothly while high-risk actions still ask

### 14. User updates

Block:

```txt
<user_updates_spec>
...
</user_updates_spec>
```

What it controls:

- how often the agent sends progress updates
- whether it narrates routine tool calls
- whether it goes silent during long work

Important OpenClaw-specific note:

- the shipped GPT-5.4 addendum keeps progress-update rules in a single
  `<user_updates_spec>` block
- keep that guidance in one place if you publish or adapt this pattern

Current shipped version:

```txt
<user_updates_spec>
Before exploring or doing substantial work, send a short update explaining your understanding of the request and your first step.
Only update again when starting a new major phase, before file edits, when something changes the plan, when a blocker appears, or roughly every 30 seconds during long work.
Each update should be 1-2 sentences.
Do not narrate routine tool calls.
Keep updates informative, varied, concise, and consistent with the assistant's personality.
</user_updates_spec>
```

### 15. Autonomy and persistence

Block:

```txt
<autonomy_and_persistence>
...
</autonomy_and_persistence>
```

What it controls:

- whether the agent stops at a plan or actually does the work
- whether implementation is the default when intent is clear
- whether review-only or brainstorm requests stay read-only

This is the strongest “do the work” knob in the addendum.

### 16. Terminal tool hygiene

Block:

```txt
<terminal_tool_hygiene>
...
</terminal_tool_hygiene>
```

What it controls:

- whether shell commands go through the terminal tool
- whether edit tools are preferred over bash mutations
- whether lightweight verification runs after edits

Use this block to make the agent safer around local command execution without
crippling normal development work.

## Recommended guidance if you publish this pattern

### 1. Keep the progress-update contract merged

The shipped addendum already keeps the update rules in one place. Preserve that
structure if you reuse the pattern elsewhere.

### 2. Clarify follow-through vs autonomy

Document this distinction directly:

- `default_follow_through_policy` = ask vs proceed
- `autonomy_and_persistence` = analysis/plan vs implementation

### 3. Clarify persona precedence

The intended model is:

- `IDENTITY.md` controls durable character and decision style
- `SOUL.md` controls entertainment flavor
- correctness, safety, permissions, and exact output format beat both

## Recommended presets

Most users should not have to tune every block manually because the shipped
default is already well tuned for most use cases. If you publish this surface
more widely, presets are still easier to reason about than fifteen separate
edits.

### Preset A: Fast and quiet

Use when you want the agent to move quickly and keep updates minimal.

```txt
<verbosity_controls>
Prefer concise, information-dense writing.
Avoid background unless it changes the decision.
</verbosity_controls>

<tool_persistence_rules>
Use tools only when they materially improve correctness or are required by the task.
Avoid speculative or redundant tool calls.
</tool_persistence_rules>

<user_updates_spec>
Only update the user when starting a major phase, before file edits, when blocked, or when the plan changes.
Do not narrate routine tool calls.
</user_updates_spec>
```

### Preset B: Careful and exhaustive

Use for migrations, security-sensitive review, debugging, or multi-file work.

```txt
<tool_persistence_rules>
Use tools whenever they materially improve correctness, completeness, or grounding.
If a result is empty or partial, retry with a different strategy.
Continue until the task is complete or a blocker is explicit.
</tool_persistence_rules>

<completeness_contract>
Treat the task as incomplete until every requested item is covered or explicitly marked [blocked].
Keep an internal checklist of deliverables.
</completeness_contract>

<verification_loop>
Before finalizing, check correctness, grounding, formatting, safety, and verification.
For code changes, run the smallest useful validation step.
</verification_loop>
```

### Preset C: Review-only

Use when the agent should critique without editing.

```txt
<autonomy_and_persistence>
For review, audit, explanation, research, or brainstorm tasks, do not modify files unless explicitly asked.
Produce findings and recommendations only.
</autonomy_and_persistence>

<output_contract>
Return exactly the requested review sections.
Do not include patches unless asked.
</output_contract>

<action_safety>
Ask before making any file changes.
</action_safety>
```

### Preset D: Agentic implementation

Use when you want the agent to complete clear tasks end-to-end.

```txt
<autonomy_and_persistence>
Persist until the task is handled end-to-end within the current turn whenever feasible.
Unless the user explicitly asks for a plan, explanation, brainstorm, or review-only answer, assume they want implementation.
Carry work through implementation, verification, and final summary.
</autonomy_and_persistence>

<verification_loop>
After changes, run the smallest useful verification step before declaring success.
If verification cannot be run, explain why.
</verification_loop>
```

### Preset E: Strong persona, low cringe

Use when the project should keep a voice without turning into costume play.

```txt
<persona_latch>
Stay in the established persona by default.
Use IDENTITY.md as the hard persona contract.
Use SOUL.md as flavor only.
Do not over-perform the character when the task needs precision.
If persona and usefulness conflict, reduce persona and complete the task correctly.
Before final output, silently check identity, usefulness, output shape, and drift.
</persona_latch>
```

## Knobs outside the addendum

Not all tuning lives in the XML-style addendum.

Other relevant knobs in OpenClaw include:

- agent model and provider selection
- session model overrides
- queue behavior
- reasoning visibility
- sandbox / exec policy
- per-session directives like `/model`, `/think`, `/verbose`, `/trace`, `/reasoning`

For the current Lab feature itself, the addendum is only active when:

```txt
/lab enable custom
```

and the workspace contains the matching override path for the active model and
agent.

## Best publishing default

If you want a cleaner public documentation version of the shipped GPT-5.4
addendum, the strongest first improvement is still the simplest one:

- keep the progress-update contract in one merged `<user_updates_spec>` block

Everything else can remain modular knobs.
