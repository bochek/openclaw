import { listKovaBackends, listKovaTargets } from "../backends/registry.js";
import type { KovaRunTarget } from "../backends/types.js";
import { listKovaCapabilities } from "../capabilities/registry.js";
import { listKovaQaScenarios, summarizeKovaQaSurfaces } from "../catalog/qa.js";
import {
  block,
  bulletList,
  displayPath,
  formatDuration,
  formatIsoTimestamp,
  joinBlocks,
  keyValueBlock,
  muted,
  pageHeader,
  table,
} from "../console/format.js";
import { hydrateKovaRunIndex } from "../lib/run-index.js";

const kovaListSubjects = [
  ["runs", "recorded verification runs"],
  ["targets", "registered verification targets"],
  ["backends [target]", "execution backends for a target"],
  ["scenarios [qa]", "scenario catalog entries for a target"],
  ["surfaces [qa]", "scenario coverage surfaces for a target"],
  ["capabilities", "capability registry entries"],
] as const;

function formatTargetLabel(target: string) {
  return target.toLowerCase() === "qa" ? "QA" : target;
}

function formatGroupLabel(value: string) {
  const normalized = value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return normalized
    .replace(/\bQa\b/g, "QA")
    .replace(/\bDm\b/g, "DM")
    .replace(/\bMcp\b/g, "MCP");
}

function parseListArgs(args: string[]) {
  const json = args.includes("--json");
  const all = args.includes("--all");
  const filteredArgs = args.filter((arg) => arg !== "--json" && arg !== "--all");
  const [subject, maybeTarget] = filteredArgs;
  const target = maybeTarget === "qa" || maybeTarget === "parallels" ? maybeTarget : undefined;
  return {
    subject,
    target,
    all,
    json,
  };
}

function groupLines<T>(items: T[], keyOf: (item: T) => string, render: (item: T) => string) {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) ?? [];
    group.push(render(item));
    groups.set(key, group);
  }
  return [...groups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, lines]) => [key, ...lines.map((line) => `  ${line}`)]);
}

function renderTargetLines() {
  return joinBlocks([
    pageHeader("Kova Targets", "Verification targets registered in Kova"),
    block("Available Targets", bulletList(listKovaTargets())),
  ]);
}

function renderBackendLines(target?: KovaRunTarget) {
  const label = target ? `Backends (${target})` : "Backends";
  const rows = listKovaBackends(target).map((backend) => [
    backend.id,
    backend.title,
    backend.binary ?? "",
  ]);
  return joinBlocks([
    pageHeader(
      label,
      target
        ? `Execution backends available for ${target}`
        : "Execution backends available to Kova",
    ),
    block("Catalog", table(["backend", "runtime", "binary"], rows)),
  ]);
}

function renderScenarioLines(target?: KovaRunTarget) {
  const resolvedTarget: "qa" = target ?? "qa";
  const scenarios = listKovaQaScenarios();
  return joinBlocks([
    pageHeader(
      `${resolvedTarget.toUpperCase()} Scenarios`,
      `${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"} loaded from the QA catalog`,
    ),
    block(
      "By Surface",
      groupLines(
        scenarios,
        (scenario) =>
          `${formatGroupLabel(scenario.surface)} ${muted(`(${scenarios.filter((entry) => entry.surface === scenario.surface).length})`)}`,
        (scenario) =>
          `${scenario.id}  ${muted(`- ${scenario.title}`)}${scenario.sourcePath ? `\n    ${muted(displayPath(scenario.sourcePath))}` : ""}`,
      ),
    ),
  ]);
}

function renderSurfaceLines(target?: KovaRunTarget) {
  const resolvedTarget: "qa" = target ?? "qa";
  const surfaces = summarizeKovaQaSurfaces();
  return joinBlocks([
    pageHeader(
      `${resolvedTarget.toUpperCase()} Surfaces`,
      `${surfaces.length} execution surface${surfaces.length === 1 ? "" : "s"} represented in the QA catalog`,
    ),
    block(
      "Coverage",
      table(
        ["surface", "scenarios"],
        surfaces.map((surface) => [surface.surface, String(surface.scenarioCount)]),
      ),
    ),
  ]);
}

function renderCapabilityLines() {
  const capabilities = listKovaCapabilities();
  return joinBlocks([
    pageHeader("Kova Capabilities", `${capabilities.length} product guarantees tracked by Kova`),
    block(
      "By Area",
      groupLines(
        capabilities,
        (capability) => formatGroupLabel(capability.area),
        (capability) =>
          `${capability.id}  ${muted(`- ${capability.title}`)}\n    ${muted(capability.description)}`,
      ),
    ),
  ]);
}

function renderListSubjects() {
  return joinBlocks([
    pageHeader("Kova List", "Browse structured Kova data by subject"),
    block("Subjects", table(["subject", "description"], [...kovaListSubjects])),
  ]);
}

function renderRunLines(
  latestRunId: string | undefined,
  runs: Awaited<ReturnType<typeof hydrateKovaRunIndex>>["runs"],
  showAll = false,
) {
  const visibleRuns = showAll ? runs.toReversed() : runs.toReversed().slice(0, 12);
  const verdictCounts = runs.reduce<Record<string, number>>((counts, run) => {
    counts[run.verdict] = (counts[run.verdict] ?? 0) + 1;
    return counts;
  }, {});
  return joinBlocks([
    pageHeader(
      "Run History",
      `${runs.length} recorded run${runs.length === 1 ? "" : "s"}${latestRunId ? ` | latest ${latestRunId}` : ""}`,
      showAll ? undefined : "Showing the most recent 12. Use --all for full history.",
    ),
    block(
      "Summary",
      keyValueBlock([
        ["pass", verdictCounts.pass ?? 0],
        ["blocked", verdictCounts.blocked ?? 0],
        ["fail", verdictCounts.fail ?? 0],
        ["degraded", verdictCounts.degraded ?? 0],
        ["flaky", verdictCounts.flaky ?? 0],
      ]),
    ),
    block(
      "History",
      table(
        ["updated", "verdict", "run", "target", "backend", "duration"],
        visibleRuns.map((run) => [
          formatIsoTimestamp(run.updatedAt),
          run.verdict.toUpperCase(),
          run.runId,
          formatTargetLabel(run.selection.target),
          run.backend.id ?? run.backend.kind,
          formatDuration(run.timing.durationMs),
        ]),
      ),
    ),
  ]);
}

export async function listCommand(repoRoot: string, args: string[]) {
  const options = parseListArgs(args);

  if (!options.subject) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            subjects: kovaListSubjects.map(([subject, description]) => ({
              subject,
              description,
            })),
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    process.stdout.write(renderListSubjects());
    return;
  }

  if (options.subject === "runs") {
    const index = await hydrateKovaRunIndex(repoRoot);
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            latestRunId: index.latestRunId ?? null,
            runs: index.runs,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    process.stdout.write(renderRunLines(index.latestRunId, index.runs, options.all));
    return;
  }

  if (options.subject === "targets") {
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ targets: listKovaTargets() }, null, 2)}\n`);
      return;
    }
    process.stdout.write(renderTargetLines());
    return;
  }

  if (options.subject === "backends") {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            target: options.target ?? null,
            backends: listKovaBackends(options.target).map((backend) => ({
              id: backend.id,
              title: backend.title,
            })),
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    process.stdout.write(renderBackendLines(options.target));
    return;
  }

  if (options.subject === "scenarios") {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            target: options.target ?? "qa",
            scenarios: listKovaQaScenarios(),
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    process.stdout.write(renderScenarioLines(options.target));
    return;
  }

  if (options.subject === "surfaces") {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            target: options.target ?? "qa",
            surfaces: summarizeKovaQaSurfaces(),
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    process.stdout.write(renderSurfaceLines(options.target));
    return;
  }

  if (options.subject === "capabilities") {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            capabilities: listKovaCapabilities(),
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    process.stdout.write(renderCapabilityLines());
    return;
  }

  throw new Error(
    `unsupported Kova list subject: ${options.subject}. Use 'kova --help' to inspect supported list subjects.`,
  );
}
