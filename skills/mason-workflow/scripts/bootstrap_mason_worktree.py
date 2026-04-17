#!/usr/bin/env python3

import argparse
import re
import subprocess
from datetime import date
from pathlib import Path


DATA_WORKTREES_ROOT = Path(".worktrees")
MY_DOCS_RELATIVE_ROOT = Path("my_docs")
MY_DOCS_CASES_RELATIVE_ROOT = MY_DOCS_RELATIVE_ROOT / "04-cases"
MY_DOCS_OXLINT_CONFIG_NAME = ".oxlintrc.json"
MY_DOCS_OXLINT_CONFIG_CONTENT = """{
  "ignorePatterns": ["**/*"]
}
"""
SHARED_MY_DOCS_ROOT = Path("/data/code/openclaw/oss-docs/openclaw-docs")

VALID_TYPES = ("bug", "security", "feat")
TYPE_LABELS = {"bug": "Bug Fix", "security": "Security Patch", "feat": "Feature"}

# ---------------------------------------------------------------------------
# 共用模板
# ---------------------------------------------------------------------------

TIMELINE_TEMPLATE = """# Main Baseline and Findings

## 基线信息

- 分析日期：`{case_date}`
- worktree：`{worktree_path}`
- 基线路径：`upstream/main`
- 基线 commit：`{baseline_sha}`
- case 目录：`{case_dir_relative}`
- 类型：`{case_type}`

## 问题描述

- 待补充。

## 现象

- 待补充。

## 复现线索

- 待补充。

## 相关代码位置

- 待补充，使用 `file_path:line_number`。

## 最新 main 判断

- 状态：`not yet verified`
- 说明：待补充。

## 阻塞问题

- 待补充。
"""

MAINTAINER_MAP_TEMPLATE = """# {case_title} Maintainer Map

## 最近关注该区域的 maintainer

- 待补充。

## 文件与变更主题

- 待补充。

## 建议联系顺序

1. 待补充。
"""

# ---------------------------------------------------------------------------
# Bug 模板
# ---------------------------------------------------------------------------

BUG_README_TEMPLATE = """# {case_title}

一句话描述问题和分析范围。

## 建议阅读顺序

1. `01-timeline/01-main-baseline-and-findings.md`
2. `99-appendix/root-cause-analysis.zh.md`
3. `90-deliverables/01-fix-plan.md`
4. `90-deliverables/02-maintainer-map.md`

## 目录结构

- `01-timeline/01-main-baseline-and-findings.md`: 最新 main 基线、现象、发现
- `90-deliverables/01-fix-plan.md`: 红测 -> 绿测 -> 打包验证计划
- `90-deliverables/02-maintainer-map.md`: 近期维护者和联系顺序
- `99-appendix/root-cause-analysis.zh.md`: 根因分析正文

## 当前结论

- 待补充。

## 当前状态

- 已创建 case 骨架。
- 已建立独立 worktree。
- 已固定分析基线。

## 为什么这个 case 值得关注

- 待补充，说明为什么这个问题值得投入，以及不处理的后果。

## 回归风险判断

- 待补充，说明修复是否可能影响现有行为，以及主要风险点。

## 如何验证

- 待补充，给出维护者或用户可执行的验证步骤。

## 下一步

- 补充现象和发现。
- 判断最新 main 是否仍受影响。
- 完成根因分析、修复计划和 maintainer map。
"""

BUG_FIX_PLAN_TEMPLATE = """# {case_title} Fix Plan

## Phase 1: Regression test goes red

### Objective

- 待补充。

### Expected evidence

- 待补充。

### Target files or subsystems

- 待补充。

### Risks or unknowns

- 待补充。

### Exit criteria

- 待补充。

## Phase 2: Fix makes tests green

### Objective

- 待补充。

### Expected evidence

- 待补充。

### Target files or subsystems

- 待补充。

### Risks or unknowns

- 待补充。

### Exit criteria

- 待补充。

## Phase 3: Package and validate in current environment

### Objective

- 待补充。

### Expected evidence

- 待补充。

### Target files or subsystems

- 待补充。

### Risks or unknowns

- 待补充。

### Exit criteria

- 待补充。

## Risks and open questions

- 待补充。
"""

ROOT_CAUSE_TEMPLATE = """# {case_title} 根因分析

## 分析范围

- 分析日期：`{case_date}`
- 基线 commit：`{baseline_sha}`

## 结论

- 待补充。

## 现象

- 待补充。

## 根因

- 状态：`待验证`
- 说明：待补充。

## 为什么之前没有被挡住

- 待补充。

## 当前主线是否已有修复迹象

- 待补充。

## 建议的修复方向

- 待补充。

## 最终判断

- 待补充。
"""

# ---------------------------------------------------------------------------
# Security 模板
# ---------------------------------------------------------------------------

SECURITY_README_TEMPLATE = """# {case_title}

一句话描述漏洞和影响范围。

## 建议阅读顺序

1. `01-timeline/01-main-baseline-and-findings.md`
2. `99-appendix/impact-assessment.zh.md`
3. `90-deliverables/01-fix-plan.md`
4. `90-deliverables/02-maintainer-map.md`

## 目录结构

- `01-timeline/01-main-baseline-and-findings.md`: 最新 main 基线、现象、发现
- `90-deliverables/01-fix-plan.md`: Patch -> 验证 -> 披露计划
- `90-deliverables/02-maintainer-map.md`: 近期维护者和联系顺序
- `99-appendix/impact-assessment.zh.md`: 安全影响评估

## 当前结论

- 待补充。

## 当前状态

- 已创建 case 骨架。
- 已建立独立 worktree。
- 已固定分析基线。

## 为什么这个 case 值得关注

- 待补充，说明为什么这个安全问题值得优先处理，以及不修复的风险。

## 回归风险判断

- 待补充，说明当前补丁是否可能影响现有行为，以及主要风险点。

## 如何验证

- 待补充，给出维护者或用户可执行的验证步骤。

## 下一步

- 确认漏洞影响范围。
- 完成影响评估和修复计划。
- 确定披露时间线。
"""

SECURITY_FIX_PLAN_TEMPLATE = """# {case_title} Fix Plan

## Phase 1: Patch development

### Objective

- 待补充。

### Target files or subsystems

- 待补充。

### Verification approach

- 待补充。

### Risks or unknowns

- 待补充。

### Exit criteria

- 待补充。

## Phase 2: Internal verification

### Objective

- 待补充。

### Test scenarios

- 待补充。

### Exit criteria

- 待补充。

## Phase 3: Controlled disclosure

### Timeline

- 待补充。

### Communication plan

- 待补充。

### Exit criteria

- 待补充。

## Risks and open questions

- 待补充。
"""

IMPACT_ASSESSMENT_TEMPLATE = """# {case_title} 安全影响评估

## 分析范围

- 分析日期：`{case_date}`
- 基线 commit：`{baseline_sha}`

## 漏洞分类

- CVE/CWE 编号（如有）：待确认
- 漏洞类型：待补充
- 严重程度：待评估（Critical / High / Medium / Low）

## 影响范围

- 受影响版本：待补充
- 受影响功能：待补充
- 攻击向量：待补充

## 利用条件

- 前置条件：待补充
- 攻击复杂度：待补充

## 缓解措施

- 临时缓解：待补充
- 永久修复：待补充

## 披露时间线

- 发现日期：`{case_date}`
- 内部修复目标：待定
- 公开披露计划：待定
"""

# ---------------------------------------------------------------------------
# Feature 模板
# ---------------------------------------------------------------------------

FEAT_README_TEMPLATE = """# {case_title}

一句话描述功能目标。

## 建议阅读顺序

1. `01-timeline/01-main-baseline-and-findings.md`
2. `90-deliverables/01-implementation-plan.md`
3. `90-deliverables/02-acceptance-criteria.md`

## 目录结构

- `01-timeline/01-main-baseline-and-findings.md`: 最新 main 基线、现状调研
- `90-deliverables/01-implementation-plan.md`: 实现计划
- `90-deliverables/02-acceptance-criteria.md`: 验收标准

## 当前结论

- 待补充。

## 当前状态

- 已创建 case 骨架。
- 已建立独立 worktree。
- 已固定分析基线。

## 为什么这个 case 值得关注

- 待补充，说明为什么这个功能值得做，以及目标收益。

## 回归风险判断

- 待补充，说明实现是否可能影响现有行为，以及主要风险点。

## 如何验证

- 待补充，给出维护者或用户可执行的验证步骤。

## 下一步

- 调研现有实现。
- 完成实现计划和验收标准。
"""

FEAT_IMPLEMENTATION_PLAN_TEMPLATE = """# {case_title} Implementation Plan

## Overview

- 待补充。

## Design decisions

- 待补充。

## Implementation phases

### Phase 1: Core implementation

- 待补充。

### Phase 2: Integration and testing

- 待补充。

### Phase 3: Documentation and polish

- 待补充。

## Risks and mitigations

- 待补充。
"""

FEAT_ACCEPTANCE_CRITERIA_TEMPLATE = """# {case_title} Acceptance Criteria

## Functional requirements

- [ ] 待补充

## Non-functional requirements

- [ ] 待补充

## Testing checklist

- [ ] 待补充

## Documentation checklist

- [ ] 待补充
"""

# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------


def run_git(*args: str, cwd: Path | None = None) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd else None,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    if not slug:
        raise SystemExit("Case name must contain at least one letter or number")
    return slug


def title_from_slug(slug: str, case_type: str) -> str:
    label = TYPE_LABELS[case_type]
    words = " ".join(part.capitalize() for part in slug.split("-"))
    return f"OpenClaw {label}: {words}"


def ensure_shared_my_docs_link(link_path: Path, target_path: Path) -> None:
    if not target_path.is_dir():
        raise SystemExit(f"Expected shared my_docs root to exist: {target_path}")

    if link_path.is_symlink():
        current_target = link_path.resolve(strict=True)
        if current_target != target_path.resolve():
            raise SystemExit(
                f"Refusing to replace my_docs symlink pointing elsewhere: {link_path} -> {current_target}"
            )
        return

    if link_path.exists():
        raise SystemExit(f"Refusing to replace existing non-symlink my_docs path: {link_path}")

    link_path.parent.mkdir(parents=True, exist_ok=True)
    link_path.symlink_to(target_path)


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------------------
# Scaffold 函数（按类型差异化）
# ---------------------------------------------------------------------------


def scaffold_case(
    case_root: Path,
    case_type: str,
    case_title: str,
    case_date: str,
    worktree_path: Path,
    baseline_sha: str,
) -> None:
    case_dir_relative = MY_DOCS_CASES_RELATIVE_ROOT / case_root.name

    fmt_timeline = dict(
        case_date=case_date,
        worktree_path=worktree_path,
        baseline_sha=baseline_sha,
        case_dir_relative=case_dir_relative,
        case_type=case_type,
    )
    fmt_base = dict(case_title=case_title)
    fmt_dated = dict(case_title=case_title, case_date=case_date, baseline_sha=baseline_sha)

    # 共用：timeline
    write_file(
        case_root / "01-timeline" / "01-main-baseline-and-findings.md",
        TIMELINE_TEMPLATE.format(**fmt_timeline),
    )

    if case_type == "bug":
        write_file(case_root / "00-README.md", BUG_README_TEMPLATE.format(**fmt_base))
        write_file(
            case_root / "90-deliverables" / "01-fix-plan.md",
            BUG_FIX_PLAN_TEMPLATE.format(**fmt_base),
        )
        write_file(
            case_root / "90-deliverables" / "02-maintainer-map.md",
            MAINTAINER_MAP_TEMPLATE.format(**fmt_base),
        )
        write_file(
            case_root / "99-appendix" / "root-cause-analysis.zh.md",
            ROOT_CAUSE_TEMPLATE.format(**fmt_dated),
        )

    elif case_type == "security":
        write_file(case_root / "00-README.md", SECURITY_README_TEMPLATE.format(**fmt_base))
        write_file(
            case_root / "90-deliverables" / "01-fix-plan.md",
            SECURITY_FIX_PLAN_TEMPLATE.format(**fmt_base),
        )
        write_file(
            case_root / "90-deliverables" / "02-maintainer-map.md",
            MAINTAINER_MAP_TEMPLATE.format(**fmt_base),
        )
        write_file(
            case_root / "99-appendix" / "impact-assessment.zh.md",
            IMPACT_ASSESSMENT_TEMPLATE.format(**fmt_dated),
        )

    elif case_type == "feat":
        write_file(case_root / "00-README.md", FEAT_README_TEMPLATE.format(**fmt_base))
        write_file(
            case_root / "90-deliverables" / "01-implementation-plan.md",
            FEAT_IMPLEMENTATION_PLAN_TEMPLATE.format(**fmt_base),
        )
        write_file(
            case_root / "90-deliverables" / "02-acceptance-criteria.md",
            FEAT_ACCEPTANCE_CRITERIA_TEMPLATE.format(**fmt_base),
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a mason worktree on the data disk from upstream/main, link my_docs to the shared docs tree, and scaffold a dated case for analysis and implementation"
    )
    parser.add_argument(
        "--type",
        "-t",
        choices=VALID_TYPES,
        default="bug",
        dest="case_type",
        help="Workflow type: bug, security, or feat (default: bug)",
    )
    parser.add_argument("case_name", help="Case name or slug")
    args = parser.parse_args()

    repo_root = Path(run_git("rev-parse", "--show-toplevel")).resolve()
    slug = slugify(args.case_name)
    case_type = args.case_type
    case_title = title_from_slug(slug, case_type)
    today = date.today().isoformat()

    if not DATA_WORKTREES_ROOT.is_dir():
        DATA_WORKTREES_ROOT.mkdir(parents=True, exist_ok=True)

    worktree_parent = DATA_WORKTREES_ROOT
    worktree_parent.mkdir(parents=True, exist_ok=True)

    worktree_path = worktree_parent / f"{case_type}-{slug}"
    case_dir_name = f"{today}-{slug}"
    case_dir_relative = MY_DOCS_CASES_RELATIVE_ROOT / case_dir_name

    if worktree_path.exists():
        raise SystemExit(f"Refusing to reuse existing path: {worktree_path}")
    run_git("fetch", "upstream", "main", "--prune", cwd=repo_root)
    baseline_sha = run_git("rev-parse", "upstream/main", cwd=repo_root)

    subprocess.run(
        ["git", "worktree", "add", "--detach", str(worktree_path), "upstream/main"],
        cwd=str(repo_root),
        check=True,
    )

    my_docs_target = worktree_path / MY_DOCS_RELATIVE_ROOT
    ensure_shared_my_docs_link(my_docs_target, SHARED_MY_DOCS_ROOT)
    case_root = my_docs_target / "04-cases" / case_dir_name
    if case_root.exists():
        raise SystemExit(f"Refusing to overwrite existing case directory: {case_root}")

    shared_oxlint_path = SHARED_MY_DOCS_ROOT / MY_DOCS_OXLINT_CONFIG_NAME
    if not shared_oxlint_path.exists():
        write_file(shared_oxlint_path, MY_DOCS_OXLINT_CONFIG_CONTENT)
    scaffold_case(case_root, case_type, case_title, today, worktree_path, baseline_sha)

    print(f"repo_root={repo_root}")
    print(f"worktree_path={worktree_path}")
    print(f"my_docs_target={my_docs_target}")
    print(f"my_docs_link_target={SHARED_MY_DOCS_ROOT}")
    print(f"worktree_root={worktree_parent}")
    print(f"baseline_ref=upstream/main")
    print(f"baseline_sha={baseline_sha}")
    print(f"case_type={case_type}")
    print(f"case_slug={slug}")
    print(f"case_date={today}")
    print(f"case_dir={case_dir_relative}")
    print(f"case_dir_abs={case_root}")


if __name__ == "__main__":
    main()
