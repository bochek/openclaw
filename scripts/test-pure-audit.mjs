import {
  collectBroadPureTestCandidates,
  collectPureTestFileAnalysis,
  collectPureTestCandidates,
  pureTestFiles,
} from "../vitest.pure-paths.mjs";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const scope = args.has("--broad") ? "broad" : "current";

const analysis = collectPureTestFileAnalysis(process.cwd(), { scope });
const rejected = analysis.filter((entry) => !entry.pure);
const reasonCounts = new Map();
const candidateCount =
  scope === "broad"
    ? collectBroadPureTestCandidates(process.cwd()).length
    : collectPureTestCandidates(process.cwd()).length;
const pureCount = analysis.filter((entry) => entry.pure).length;

for (const entry of rejected) {
  for (const reason of entry.reasons) {
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
}

if (json) {
  console.log(
    JSON.stringify(
      {
        candidates: candidateCount,
        pure: pureCount,
        routedPure: pureTestFiles.length,
        rejected: rejected.length,
        reasonCounts: Object.fromEntries(
          [...reasonCounts.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
        ),
        scope,
        files: analysis,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(
  [
    `[test-pure-audit] scope=${scope} candidates=${analysis.length} pure=${pureCount} routed=${pureTestFiles.length} rejected=${rejected.length}`,
    scope === "broad" ? `[test-pure-audit] broad pure candidates are not routed automatically` : "",
    "",
    "Rejected reasons:",
    ...[...reasonCounts.entries()]
      .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([reason, count]) => `  ${String(count).padStart(4, " ")} ${reason}`),
  ].join("\n"),
);
