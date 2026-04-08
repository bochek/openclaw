import {
  diffArtifacts,
  readKovaArtifact,
  renderArtifactDiff,
  resolveLatestRunId,
  resolvePreviousRunId,
} from "../report.js";

function parseDiffArgs(args: string[]) {
  const json = args.includes("--json");
  const filteredArgs = args.filter((arg) => arg !== "--json");
  return {
    baselineSelector: filteredArgs[0] ?? "previous",
    candidateSelector: filteredArgs[1] ?? "latest",
    json,
  };
}

async function resolveDiffSelector(repoRoot: string, selector: string) {
  if (selector === "latest") {
    return await resolveLatestRunId(repoRoot);
  }
  if (selector === "previous") {
    return await resolvePreviousRunId(repoRoot);
  }
  return selector;
}

export async function diffCommand(repoRoot: string, args: string[]) {
  const options = parseDiffArgs(args);
  const baselineRunId = await resolveDiffSelector(repoRoot, options.baselineSelector);
  const candidateRunId = await resolveDiffSelector(repoRoot, options.candidateSelector);

  if (!baselineRunId || !candidateRunId) {
    throw new Error("not enough Kova runs available to diff");
  }

  const [baseline, candidate] = await Promise.all([
    readKovaArtifact(repoRoot, baselineRunId),
    readKovaArtifact(repoRoot, candidateRunId),
  ]);
  const diff = diffArtifacts(baseline, candidate);

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          baseline,
          candidate,
          diff,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  process.stdout.write(renderArtifactDiff(diff, baseline, candidate));
}
