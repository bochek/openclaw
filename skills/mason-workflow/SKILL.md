---
name: mason-workflow
description: Bootstrap isolated git worktrees for OpenClaw development tasks. Use when the user wants to start a bug fix, security patch, or feature in a clean environment based on latest upstream/main, with `my_docs` mounted to the shared oss-docs tree and a dated case folder for tracking findings and progress.
user-invocable: true
---

# Mason Workflow

Use this skill to bootstrap a clean development environment for bug fixes, security patches, or new features.

This skill first fetches the latest `upstream/main`, then creates an isolated git worktree directly from that upstream baseline, mounts `my_docs` in the worktree as a symlink to the shared docs tree at `/data/code/openclaw/oss-docs/openclaw-docs`, and relies on that shared docs tree's `.oxlintrc.json` to keep case notes out of oxlint.

## Goal

Produce a worktree inside the repo's `.worktrees/` directory and a case folder under `my_docs/04-cases/YYYY-MM-DD-<case-slug>/` that captures:

- the latest `main` baseline
- the observed symptom or feature context
- confirmed root cause or design decisions
- a maintainer map for the affected area (bug/security)
- an actionable plan appropriate to the task type
- why the issue or feature matters to maintainers who are not close to the area
- the expected regression risk of the proposed fix or implementation
- concrete maintainer or user verification steps

After the case is set up, the workflow continues into implementation within the worktree.

## Supported workflow types

The bootstrap script accepts a `--type` parameter:

- **bug** — Bug fix workflow. Follows red-test -> green-fix -> validate pattern. Scaffolds fix-plan (three phases), root-cause analysis, and maintainer map.
- **security** — Security patch workflow. Emphasizes isolation and controlled disclosure. Scaffolds fix-plan (patch -> verify -> disclosure), impact assessment, and maintainer map.
- **feat** — Feature development workflow. Scaffolds implementation plan and acceptance criteria.

## When to use

Use this skill when the user wants to:

- start a bug fix in a clean environment
- work on a security patch with isolated testing
- develop a new feature from a fresh main baseline
- document findings and track progress in a case folder
- maintain separation between multiple parallel tasks

## Required workspace setup

Do not run this workflow directly in the current repository checkout.

Bootstrap a dedicated git worktree first, even when the first task is analysis. The analysis baseline must be the new worktree created from the latest `upstream/main`, not the current checkout state.

Bootstrap a dedicated git worktree inside `.worktrees/` by running:

```bash
# Bug fix (default)
python3 skills/mason-workflow/scripts/bootstrap_mason_worktree.py "plugins unsafe install fallback"

# Security patch
python3 skills/mason-workflow/scripts/bootstrap_mason_worktree.py --type security "channel workspace shadow bypass"

# Feature
python3 skills/mason-workflow/scripts/bootstrap_mason_worktree.py --type feat "streaming response support"
```

The script accepts two inputs: an optional `--type` (default: `bug`) and the case name or slug.

It must:

1. resolve the current repository root
2. fetch `upstream/main`
3. create a fresh detached worktree on the data disk at the latest `upstream/main`
4. create `my_docs` inside the new worktree as a symlink to `/data/code/openclaw/oss-docs/openclaw-docs`
5. ensure the shared docs tree has `.oxlintrc.json` so `pnpm lint` / `pnpm check` skip that subtree
6. create the dated case directory and base files appropriate to the workflow type
7. print the worktree path, baseline SHA, case type, and case directory for follow-up steps

A freshly bootstrapped worktree starts clean on the data disk at the latest `upstream/main` baseline.

Do not spend time checking whether that new worktree is dirty before starting analysis.

If the destination worktree path already exists, stop and ask before reusing or deleting anything.

If the destination `my_docs` path already exists inside the new worktree and is not the expected symlink to `/data/code/openclaw/oss-docs/openclaw-docs`, stop and ask before replacing it.

## Required outputs

The bootstrap script scaffolds case artifacts based on type:

### Bug case

```text
my_docs/04-cases/YYYY-MM-DD-<case-slug>/
├── 00-README.md
├── 01-timeline/
│   └── 01-main-baseline-and-findings.md
├── 90-deliverables/
│   ├── 01-fix-plan.md
│   └── 02-maintainer-map.md
└── 99-appendix/
    └── root-cause-analysis.zh.md
```

### Security case

```text
my_docs/04-cases/YYYY-MM-DD-<case-slug>/
├── 00-README.md
├── 01-timeline/
│   └── 01-main-baseline-and-findings.md
├── 90-deliverables/
│   ├── 01-fix-plan.md
│   └── 02-maintainer-map.md
└── 99-appendix/
    └── impact-assessment.zh.md
```

### Feature case

```text
my_docs/04-cases/YYYY-MM-DD-<case-slug>/
├── 00-README.md
├── 01-timeline/
│   └── 01-main-baseline-and-findings.md
└── 90-deliverables/
    ├── 01-implementation-plan.md
    └── 02-acceptance-criteria.md
```

Keep the structure minimal. Do not add extra files unless the task clearly needs them.

Use the date prefix so case folders sort naturally and remain easy to trace as the archive grows.

## Workflow

### 1. Bootstrap the upstream-main worktree and case skeleton

Run `skills/mason-workflow/scripts/bootstrap_mason_worktree.py` first with the appropriate `--type`.

Use the printed `worktree_path`, `baseline_sha`, `case_type`, and `case_dir` values for the rest of the workflow.

Enter the new worktree before reading code, reproducing the issue, or writing any case artifacts.

Verify that `my_docs` resolves to `/data/code/openclaw/oss-docs/openclaw-docs` and that the shared docs tree contains `.oxlintrc.json` so case notes and scripts do not get linted.

### 2. Confirm the latest `upstream/main` baseline from the bootstrap output

Treat the bootstrap output as the initial source of truth for the baseline.

Do the initial analysis from this worktree. Do not inspect the problem from the original checkout and then retroactively treat the worktree as the same baseline.

Record these values in the case:

- analysis date
- worktree path
- `upstream/main`
- baseline commit SHA
- case type

Judge the current status as one of:

- `still reproducible on latest main` (bug/security)
- `possibly already fixed on latest main` (bug/security)
- `not yet verified`
- `baseline confirmed for feature work` (feat)

### 3. Fill the scaffolded case folder

Choose a short kebab-case slug that names the affected area and symptom or feature.

Folder format:

- `YYYY-MM-DD-<case-slug>`

Examples:

- `2026-04-07-plugins-unsafe-install-fallback`
- `2026-04-07-channel-workspace-shadow-bypass`
- `2026-04-07-streaming-response-support`

Use the date when the case is first opened, not when it is last edited.

Start from `00-README.md`, then fill the remaining scaffolded files.

Make `00-README.md` newcomer-friendly. It must explain:

- why this case is worth caring about
- whether the chosen fix or implementation is likely to regress existing behavior
- how a maintainer or user can verify the result

### 4. Record findings

Fill `01-timeline/01-main-baseline-and-findings.md` with:

- problem statement or feature context
- visible symptom or current state
- reproduction clues or design constraints
- affected files and functions with `file_path:line_number`
- whether latest `main` appears fixed or still affected (bug/security)
- open questions that block implementation

Prefer concrete code references over broad summaries.

### 5. Write analysis document (type-specific)

#### Bug: Root cause analysis

Fill `99-appendix/root-cause-analysis.zh.md`.

Use this structure:

- 分析范围
- 结论
- 现象
- 根因
- 为什么之前没有被挡住
- 当前主线是否已有修复迹象
- 建议的修复方向
- 最终判断

Separate confirmed facts from hypotheses. Label statements as `已确认` or `待验证`.

#### Security: Impact assessment

Fill `99-appendix/impact-assessment.zh.md`.

Use this structure:

- 分析范围
- 漏洞分类
- 影响范围
- 利用条件
- 缓解措施
- 披露时间线

Explain plainly why the finding still matters even when exploitability is limited or partially mitigated.

#### Feature: No appendix required

Feature cases do not have an appendix by default. Add one only if the investigation uncovers non-obvious constraints.

### 6. Produce the plan (type-specific)

#### Bug: Fix plan (red-test -> green-fix -> validate)

Fill `90-deliverables/01-fix-plan.md`.

The plan must contain these three mandatory phases in order:

1. 补回归测试，让测试红，可以稳定复现问题
2. 修复问题，让测试绿
3. 打包到当前环境进行二次验证

For each phase, record objective, expected evidence, target files, risks, and exit criteria.

#### Security: Fix plan (patch -> verify -> disclosure)

Fill `90-deliverables/01-fix-plan.md`.

The plan must contain these three phases:

1. Patch development
2. Internal verification
3. Controlled disclosure

#### Feature: Implementation plan

Fill `90-deliverables/01-implementation-plan.md`.

Include overview, design decisions, implementation phases, and risks.

Fill `90-deliverables/02-acceptance-criteria.md` with functional requirements, non-functional requirements, and testing checklist.

### 7. Produce the maintainer map (bug/security only)

Fill `90-deliverables/02-maintainer-map.md`.

Focus on the files and subsystems implicated by the case.

Include:

- recent maintainers touching the area
- which files they changed
- the topic of those changes
- suggested contact order

Prefer recent commit history over guesswork.

### 8. Implement

After the case documentation is filled, proceed to implementation within the same worktree.

For bug fixes, follow the red-test -> green-fix sequence documented in the fix plan.

For security patches, work in isolation and follow the controlled disclosure timeline.

For features, follow the implementation plan phases.

## Resources

- Worktree bootstrap script: `skills/mason-workflow/scripts/bootstrap_mason_worktree.py`
- Default worktree root: `.worktrees/` (repo-local, gitignored)
- Worktree naming: `<type>-<slug>`
- Case folder and file templates: `skills/mason-workflow/references/mason_worktree_templates.md`

## Guardrails

- Do not post GitHub comments, PR comments, or external messages unless the user explicitly asks.
- Do not claim a root cause without code evidence.
- Do not hide uncertainty. Write `待验证` when the conclusion is not fully proven.
- 除非用户明确要求其他语言，case 产出文档默认全部使用中文（包括 `00-README.md`、timeline、plans、maintainer map、appendix）。
- Do not skip the latest `upstream/main` baseline check.
- Do not skip the worktree bootstrap.
- Do not read, reproduce, or write case files from the original checkout once the worktree has been prepared.
- `my_docs` should symlink only to `/data/code/openclaw/oss-docs/openclaw-docs`.
- For bug fixes, follow the red-test -> green-fix pattern unless explicitly waived by the user.
- For security patches, do not disclose vulnerability details in public channels until the fix is merged.
- Keep work isolated in the worktree; do not mix changes with the main checkout.
