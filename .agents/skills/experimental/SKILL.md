name: experimental
description: Experimental repo workflows and guided operator flows. Use only when the user explicitly asks for experimental handling. Do not use for general OpenClaw work.
---

# Experimental Skills

Use this skill only for explicitly requested experimental work.

If the user does not explicitly request experimental handling, stop and use the normal repo workflow instead.

When this skill does apply, behave like a menu first.

Start by asking:

`What would you like to do?`

Offer a short numbered menu of currently available experimental flows. Keep the menu flat and concise. Only load the relevant reference after the user chooses a flow.

Preferred first response shape:

```text
What would you like to do?

1. qa-lab release compare
```

After the user picks a flow, run an LLM-guided workflow for that selected flow:
- Ask only the next necessary question.
- Load only the matching reference.
- Drive the workflow step by step.
- Interpret results and propose the next action.

For `qa-lab release compare`, the preferred first guided follow-up is:

```text
Which two refs should I compare?
For example: previous stable vs beta, previous stable vs candidate stable, or a custom pair.
```

Current menu:
1. `qa-lab release compare`
   Read [references/qa-lab-release-compare.md](references/qa-lab-release-compare.md) only when this option is chosen.

Operating rules:
- Prefer the established repo workflow for the selected flow over generic alternatives.
- Keep changes narrow and pragmatic.
- Do not eagerly load references before the user picks a menu option.
- Do not expand the menu with guessed workflows. Add new options only when experimental flows are actually established.
