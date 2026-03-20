---
name: openclaw-feedback
description: Use when the user wants to report a problem, give feedback, or file an issue for `openclaw/openclaw`. The skill should run a very short, pointed interview first, collect any missing grounded details, then create the OpenClaw GitHub issue for the user as soon as it has enough safe information.
user-invocable: true
metadata:
  {
    "openclaw":
      {
        "emoji": "🐙",
        "requires": { "bins": ["gh"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "gh",
              "bins": ["gh"],
              "label": "Install GitHub CLI (brew)",
            },
          ],
      },
  }
---

# OpenClaw Feedback

Use this skill only for `openclaw/openclaw`.

Primary goal

- Help the user create an issue for `openclaw/openclaw` with as little user effort as possible while keeping the filing accurate and safe.

Core policy

- Default to a very short, pointed interview before filing.
- Keep the interview small: usually 1-3 targeted questions.
- Ask only for the information that materially improves the filing.
- If the request is actually a vulnerability report, leaked credential report, or other security disclosure, do not create a public GitHub issue. Route it to the private reporting path in `SECURITY.md` instead.
- Prefer doing the drafting, cleanup, and template-mapping work yourself instead of forcing the user through each field verbatim.
- Automatically redact obvious secrets and unnecessary PII when that can be done safely without losing the meaning needed for the filing.
- Try recovery in this order: infer the likely filing type, sanitize obvious risky content, ask a very short grouped follow-up, then draft the strongest accurate issue you can.
- Once the issue is sufficiently grounded and safe, create it for the user instead of stopping at a draft or asking the user to submit it manually.
- Return exact `NOT_ENOUGH_INFO` only after the brief recovery attempt still leaves the filing too weak, ambiguous, or misleading.
- Return `BLOCKED_UNSAFE_CONTENT` only when automatic masking would materially damage correctness or the remaining content is still unsafe.

Never do these

- Do not file against any repo other than `openclaw/openclaw`.
- Do not push branches.
- Do not invent repro steps, versions, evidence, or verification details.
- Do not leave obvious secrets or unnecessary PII unredacted if you can safely mask them yourself.

Bundled copies

- Bug issue: [`bug_report.yml`](./bug_report.yml)
- Feature issue: [`feature_request.yml`](./feature_request.yml)

Submission states

- `NOT_ENOUGH_INFO`
- `BLOCKED_UNSAFE_CONTENT`
- `READY_TO_CREATE`
- `CREATED`

Default workflow

1. Decide whether the request is a bug issue, feature issue, or a private security disclosure. If it is an issue, also set `$LABEL` to `bug` or `enhancement` to match the bundled template.
2. Load the copied template file for the chosen issue type.
3. Run a short targeted interview even if the initial request is terse but plausible.
4. Prefer grouped interview questions over replaying the whole template.
5. Stop interviewing as soon as the payload is strong enough.
6. Draft the issue body yourself using the bundled template structure instead of forcing the user to fill every field manually.
7. If the request is a private security disclosure, follow `SECURITY.md`: prepare the private report using the required fields there, direct the user to report privately to `security@openclaw.ai` when needed, and do not publish the details in a public issue.
8. If critical facts are still missing after the brief recovery attempt, return `NOT_ENOUGH_INFO`.
9. If the payload is complete and safe, create the issue with `gh` for the user; do not stop at `READY_TO_CREATE` unless actual creation is blocked.

Interview policy

- Prefer 1-3 grouped questions.
- Ask the smallest number of questions that materially improves the filing.
- Recover thin requests instead of rejecting them early when the user intent is clear.
- For bug issues, prioritize:
  - What breaks and how to reproduce it
  - Expected vs actual behavior and exact environment
  - Impact and evidence
- For feature issues, prioritize:
  - Problem to solve
  - Proposed solution and alternatives
  - Impact and evidence

Issue requirements

- Infer bug vs feature when the user intent is clear, otherwise ask the smallest targeted follow-up possible.
- Use the exact title prefix from the chosen issue template.
- Keep the filed issue grounded in observed evidence.
- Include only helpful optional context; avoid filler.
- If the user gives terse but usable facts, draft the issue body for them instead of replaying every template label.
- Preserve the canonical issue label:
  - bug issue -> `bug`
  - feature issue -> `enhancement`

Unsafe content rules

Automatically mask obvious risky strings when the filing can remain accurate, including:

- API keys, tokens, bearer headers, cookies, passwords, or secrets
- email addresses
- phone numbers
- other unnecessary identifying personal details

Use compact placeholders that preserve meaning, such as:

- `[token-redacted]`
- `[cookie-redacted]`
- `[email-redacted]`
- `[phone-redacted]`

Return `BLOCKED_UNSAFE_CONTENT` only if:

- the unsafe content cannot be removed without breaking the technical meaning
- the remaining payload would still expose sensitive information
- the user is trying to file content that should not be published even in redacted form

Creation command

```bash
gh issue create --repo openclaw/openclaw --title "$TITLE" --label "$LABEL" --body-file "$BODY_FILE"
```

Output format

Use `READY_TO_CREATE` only as a transient internal state before immediate creation, or when creation is blocked by a concrete external precondition such as missing auth. Do not leave the user with a draft when creation can proceed.

```text
NOT_ENOUGH_INFO
- Missing: <field label>
- Question: <targeted question>
```

```text
BLOCKED_UNSAFE_CONTENT
- Field: <field label>
- Reason: <brief reason>
```

```text
READY_TO_CREATE
- Type: bug issue | feature issue
- Title: <sanitized title>
```

```text
CREATED
- URL: https://github.com/openclaw/openclaw/...
```
