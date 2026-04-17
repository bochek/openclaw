# Mason Worktree Templates

## Bootstrap script

Use `skills/mason-workflow/scripts/bootstrap_mason_worktree.py` to prepare the workspace and scaffold the case.

### Purpose

Given a workflow type and case name, the script:

1. resolves the current repository root
2. fetches `upstream/main`
3. creates a new detached git worktree under `/data/worktrees/<repo-name>/` at the latest `upstream/main`
4. creates `my_docs` inside the new worktree as a symlink to `/data/code/openclaw/oss-docs/openclaw-docs`
5. ensures the shared docs tree has `.oxlintrc.json` so local notes and scripts in that mounted docs area stay out of oxlint
6. creates a dated case directory and type-appropriate base files under `my_docs/04-cases/`
7. prints the worktree path, baseline SHA, case type, and case directory

### Usage

```bash
# Bug fix (default)
python3 skills/mason-workflow/scripts/bootstrap_mason_worktree.py "plugins unsafe install fallback"
python3 skills/mason-workflow/scripts/bootstrap_mason_worktree.py --type bug "plugins unsafe install fallback"

# Security patch
python3 skills/mason-workflow/scripts/bootstrap_mason_worktree.py --type security "channel workspace shadow bypass"

# Feature development
python3 skills/mason-workflow/scripts/bootstrap_mason_worktree.py --type feat "streaming response support"
```

### Expected output fields

```text
repo_root=<absolute-path>
worktree_path=<absolute-path>
my_docs_target=<absolute-path>
worktree_root=/data/worktrees/<repo-name>
baseline_ref=upstream/main
baseline_sha=<commit-sha>
case_type=bug|security|feat
case_slug=<slug>
case_date=YYYY-MM-DD
case_dir=my_docs/04-cases/YYYY-MM-DD-<case-slug>
case_dir_abs=<absolute-path>
```

### Worktree naming

- Bug: `openclaw-bug-<slug>`
- Security: `openclaw-security-<slug>`
- Feature: `openclaw-feat-<slug>`

### Safety rules

- Stop if the data disk mount is unavailable.
- Stop if the target worktree path already exists.
- Stop if the target case directory already exists.
- Stop if `my_docs` already exists inside the new worktree but is not the expected symlink to `/data/code/openclaw/oss-docs/openclaw-docs`.
- Keep local notes and helper scripts inside `my_docs/` and rely on the shared docs tree's `.oxlintrc.json` to keep that mounted docs area out of oxlint.

### Why no dirty check is needed initially

The script creates a fresh dedicated worktree on the data disk from the latest `upstream/main`.

That new worktree starts clean by construction, so the workflow does not need an extra initial dirty-state check before work begins.

Initial analysis also starts from that worktree. Do not treat the current checkout as the analysis baseline.

## Scaffolded case folders by type

### Bug case

```text
my_docs/04-cases/YYYY-MM-DD-<case-slug>/
├── 00-README.md
├── 01-timeline/
│   └── 01-main-baseline-and-findings.md
├── 90-deliverables/
│   ├── 01-fix-plan.md          # 红测 → 绿测 → 打包验证
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
│   ├── 01-fix-plan.md          # Patch → 验证 → 披露
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

## Template details

### Shared: `01-timeline/01-main-baseline-and-findings.md`

Pre-filled with:

- analysis date, worktree path, baseline ref, baseline commit SHA, case type
- placeholders for problem description, symptoms, reproduction clues, code references, status

### Bug-specific

#### `00-README.md`

Reading order: timeline → root-cause → fix-plan → maintainer-map.

README should also explain why the bug matters, what regression risk the fix carries, and how maintainers or users can verify the result.

#### `90-deliverables/01-fix-plan.md`

Three mandatory phases:

1. **Regression test goes red** — 补回归测试，稳定复现问题
2. **Fix makes tests green** — 修复代码，让测试通过
3. **Package and validate** — 打包到当前环境进行二次验证

Each phase: objective, expected evidence, target files, risks, exit criteria.

#### `90-deliverables/02-maintainer-map.md`

Recent maintainers, changed files and themes, suggested contact order.

#### `99-appendix/root-cause-analysis.zh.md`

分析范围、结论、现象、根因、为什么之前没有被挡住、修复方向、最终判断。

### Security-specific

#### `00-README.md`

Reading order: timeline → impact-assessment → fix-plan → maintainer-map.

README should also explain why the issue is still concerning even if exploitability is constrained, what regression risk the patch carries, and how maintainers or users can verify the result.

#### `90-deliverables/01-fix-plan.md`

Three phases:

1. **Patch development** — 开发修复补丁
2. **Internal verification** — 内部验证测试场景
3. **Controlled disclosure** — 受控披露时间线和沟通计划

#### `99-appendix/impact-assessment.zh.md`

分析范围、漏洞分类（CVE/CWE/严重程度）、影响范围、利用条件、缓解措施、披露时间线。

### Feature-specific

#### `00-README.md`

Reading order: timeline → implementation-plan → acceptance-criteria.

README should also explain why the feature matters, what regression or rollout risk it carries, and how maintainers or users can verify the result.

#### `90-deliverables/01-implementation-plan.md`

Overview, design decisions, implementation phases (core → integration → polish), risks and mitigations.

#### `90-deliverables/02-acceptance-criteria.md`

Functional requirements, non-functional requirements, testing checklist, documentation checklist. Uses checkbox format.
