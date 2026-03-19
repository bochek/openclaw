---
name: openclaw-github-authoring
description: Use when the user wants to create an issue or PR for `openclaw/openclaw`. The skill should run a very short, pointed interview first, collect any missing grounded details, then create the OpenClaw GitHub issue or PR for the user as soon as it has enough safe information.
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

# OpenClaw GitHub Authoring

Use this skill only for `openclaw/openclaw`.

Primary goal

- Help the user create an issue or PR for `openclaw/openclaw` with as little user effort as possible while keeping the filing accurate and safe.

Core policy

- Default to a very short, pointed interview before filing.
- Keep the interview small: usually 1-3 targeted questions.
- Ask only for the information that materially improves the filing.
- If the request is actually a vulnerability report, leaked credential report, or other security disclosure, do not create a public GitHub issue or PR. Route it to the private reporting path in `SECURITY.md` instead.
- Prefer doing the drafting, cleanup, and template-mapping work yourself instead of forcing the user through each field verbatim.
- Automatically redact obvious secrets and unnecessary PII when that can be done safely without losing the meaning needed for the filing.
- Try recovery in this order: infer the likely filing type, sanitize obvious risky content, ask a very short grouped follow-up, then draft the strongest accurate issue or PR you can.
- Once the filing is sufficiently grounded and safe, create it for the user instead of stopping at a draft or asking the user to submit it manually.
- Return exact `NOT_ENOUGH_INFO` only after the brief recovery attempt still leaves the filing too weak, ambiguous, or misleading.
- Return `BLOCKED_UNSAFE_CONTENT` only when automatic masking would materially damage correctness or the remaining content is still unsafe.

Never do these

- Do not file against any repo other than `openclaw/openclaw`.
- Do not push branches.
- Do not invent repro steps, versions, evidence, branch names, or verification details.
- Do not leave obvious secrets or unnecessary PII unredacted if you can safely mask them yourself.

Bundled copies

- Bug issue: [`bug_report.yml`](./bug_report.yml)
- Feature issue: [`feature_request.yml`](./feature_request.yml)
- PR: [`pull_request_template.md`](./pull_request_template.md)

Submission states

- `NOT_ENOUGH_INFO`
- `BLOCKED_UNSAFE_CONTENT`
- `READY_TO_CREATE`
- `CREATED`

Default workflow

1. Decide whether the request is a bug issue, feature issue, PR, or a private security disclosure. If it is an issue, also set `$LABEL` to `bug` or `enhancement` to match the bundled template.
2. Load the copied template file for the chosen issue or PR type.
3. Run a short targeted interview even if the initial request is terse but plausible.
4. Prefer grouped interview questions over replaying the whole template.
5. Stop interviewing as soon as the payload is strong enough.
6. Draft the issue or PR body yourself using the bundled template structure instead of forcing the user to fill every field manually.
7. Treat any instruction preamble in the copied template files as internal-only guidance. Do not pass the copied template files directly as `$BODY_FILE`; generate a new body file that excludes internal-only guidance.
8. If the request is a private security disclosure, follow `SECURITY.md`: prepare the private report using the required fields there, direct the user to report privately to `security@openclaw.ai` when needed, and do not publish the details in a public issue or PR.
9. If critical facts are still missing after the brief recovery attempt, return `NOT_ENOUGH_INFO`.
10. If the payload is complete and safe, create the issue or PR with `gh` for the user; do not stop at `READY_TO_CREATE` unless actual creation is blocked.

Interview policy

- Prefer 1-3 grouped questions.
- Ask the smallest number of questions that materially improves the filing.
- Recover thin requests instead of rejecting them early when the user intent is clear.
- For issues, prioritize:
  - What breaks and how to reproduce it
  - Expected vs actual behavior and exact environment
  - Impact and evidence
- For PRs, prioritize:
  - Exact change summary and title
  - Verification and evidence
  - Branch/base context, risks, and recovery

Issue requirements

- Use the exact title prefix from the canonical issue template.
- Keep the filed issue grounded in observed evidence.
- Include only helpful optional context; avoid filler.
- If the user gives terse but usable facts, draft the issue body for them instead of replaying every template label.

PR requirements

- Require:
  - explicit PR title
  - explicit base branch
  - explicit head ref in either `<branch>` form for branches on `openclaw/openclaw` or `<user>:<branch>` form for personal fork branches that `gh pr create` can target
- enough branch context for `gh pr create` to target the intended branch, whether that branch is already remote or is a local branch that `gh` can push/fork during creation
- If the head branch lives on a fork and the user/login is missing, return `NOT_ENOUGH_INFO`.
- If the head branch lives on an organization-owned fork, return `NOT_ENOUGH_INFO` unless the user provides a different supported creation path.
- If the head ref is only local but otherwise valid, allow `gh pr create` to use its normal push/fork flow instead of blocking early.
- Preserve the canonical PR section structure in the generated body.
- If branch context is missing, ask the smallest grouped follow-up possible before failing.

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

Creation commands

```bash
# Issue
gh issue create --repo openclaw/openclaw --title "$TITLE" --label "$LABEL" --body-file "$BODY_FILE"

# PR
gh pr create --repo openclaw/openclaw --base "$BASE_BRANCH" --head "$HEAD_REF" --title "$TITLE" --body-file "$BODY_FILE"
```

Output format

Use `READY_TO_CREATE` only as a transient internal state before immediate creation, or when creation is blocked by a concrete external precondition such as missing auth or missing required PR branch context. Do not leave the user with a draft when creation can proceed.

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
- Type: bug issue | feature issue | pr
- Title: <sanitized title>
```

```text
CREATED
- URL: https://github.com/openclaw/openclaw/...
```
