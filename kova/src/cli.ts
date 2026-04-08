import path from "node:path";
import { fileURLToPath } from "node:url";
import { diffCommand } from "./commands/diff.js";
import { listCommand } from "./commands/list.js";
import { reportCommand } from "./commands/report.js";
import { runCommand } from "./commands/run.js";
import {
  badge,
  block,
  bulletList,
  joinBlocks,
  keyValueBlock,
  pageHeader,
  table,
} from "./console/format.js";

function printHelp() {
  const blocks = [
    pageHeader(
      "Kova",
      "OpenClaw verification platform",
      "Run verification workflows, inspect artifacts, compare baselines, and track history.",
    ),
    block(
      "Commands",
      table(
        ["command", "description"],
        [
          ["run", "execute a verification run"],
          ["report", "inspect a recorded run artifact"],
          ["diff", "compare a candidate against a baseline"],
          ["list", "browse catalog, backends, capabilities, and history"],
        ],
      ),
    ),
    block(
      "Common Flows",
      bulletList([
        "kova run qa --scenario channel-chat-baseline",
        "kova report latest",
        "kova diff",
        "kova list runs",
      ]),
    ),
    block(
      "Run",
      keyValueBlock([
        ["--backend", "host | multipass"],
        ["--provider-mode", "mock-openai | live-frontier"],
        ["--scenario", "qa scenario id, repeatable"],
        ["--json", "machine-readable output"],
      ]),
    ),
    block(
      "Backend Notes",
      bulletList(["multipass without --scenario runs the curated QA core subset"]),
    ),
    block(
      "Diff Baselines",
      keyValueBlock([
        ["auto", "smart baseline policy"],
        ["previous", "previous comparable baseline"],
        ["latest-pass", "latest comparable passing baseline"],
        ["latest", "latest recorded run"],
        ["<run-id>", "explicit run selection"],
      ]),
    ),
    block(
      "Diff",
      keyValueBlock([
        ["--baseline", "baseline selector override"],
        ["--candidate", "candidate selector override"],
        [
          "--fail-on",
          "regression | mixed-change | compatibility-delta | informational-drift | any-delta",
        ],
        ["--json", "machine-readable output"],
      ]),
    ),
    block(
      "List Subjects",
      bulletList([
        "runs",
        "targets",
        "backends [qa]",
        "scenarios [qa]",
        "surfaces [qa]",
        "capabilities",
      ]),
    ),
    block(
      "Exit Codes",
      keyValueBlock([
        ["0", "pass or skipped"],
        ["2", "degraded"],
        ["3", "fail"],
        ["4", "flaky"],
        ["5", "blocked"],
        ["6", "diff fail-on triggered"],
      ]),
    ),
  ];
  process.stdout.write(joinBlocks(blocks));
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const [, , command, ...args] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "run") {
    await runCommand(repoRoot, args);
    return;
  }

  if (command === "list") {
    await listCommand(repoRoot, args);
    return;
  }

  if (command === "report") {
    await reportCommand(repoRoot, args);
    return;
  }

  if (command === "diff") {
    await diffCommand(repoRoot, args);
    return;
  }

  throw new Error(
    `unknown Kova command: ${command}. Use 'kova --help' to inspect the command surface.`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${badge("ERROR", "danger")} ${message}\n`);
  process.exitCode = 1;
});
