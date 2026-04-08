import {
  diffArtifacts,
  readKovaArtifact,
  renderArtifactDiff,
  resolveLatestRunId,
  resolveLatestComparablePassRunId,
  resolveLatestPassRunId,
  resolvePreviousComparableRunId,
  resolvePreviousRunId,
} from "../report.js";

function parseDiffArgs(args: string[]) {
  const json = args.includes("--json");
  const options = {
    baselineSelector: undefined as string | undefined,
    candidateSelector: undefined as string | undefined,
    failOn: undefined as
      | "regression"
      | "mixed-change"
      | "compatibility-delta"
      | "informational-drift"
      | "any-delta"
      | undefined,
    json,
  };
  const rest: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      continue;
    }
    if (arg === "--baseline") {
      options.baselineSelector = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--candidate") {
      options.candidateSelector = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--fail-on") {
      const value = args[index + 1];
      if (
        value === "regression" ||
        value === "mixed-change" ||
        value === "compatibility-delta" ||
        value === "informational-drift" ||
        value === "any-delta"
      ) {
        options.failOn = value;
      }
      index += 1;
      continue;
    }
    rest.push(arg);
  }
  return {
    baselineSelector: options.baselineSelector ?? rest[0] ?? "auto",
    candidateSelector: options.candidateSelector ?? rest[1] ?? "latest",
    failOn: options.failOn,
    json,
  };
}

async function resolveDiffSelector(repoRoot: string, selector: string) {
  if (selector === "latest") {
    return await resolveLatestRunId(repoRoot);
  }
  if (selector === "previous") {
    const latestRunId = await resolveLatestRunId(repoRoot);
    return latestRunId ? await resolvePreviousRunId(repoRoot, latestRunId) : undefined;
  }
  if (selector === "latest-pass") {
    return await resolveLatestPassRunId(repoRoot);
  }
  return selector;
}

async function resolveAutoBaselineRunId(repoRoot: string, candidateRunId: string) {
  const candidateArtifact = await readKovaArtifact(repoRoot, candidateRunId);
  if (candidateArtifact.verdict === "pass" || candidateArtifact.verdict === "skipped") {
    const previousComparableRunId = await resolvePreviousComparableRunId(repoRoot, candidateRunId);
    if (previousComparableRunId) {
      return {
        runId: previousComparableRunId,
        resolvedBy: "previous-comparable",
      };
    }
    const latestComparablePassRunId = await resolveLatestComparablePassRunId(
      repoRoot,
      candidateRunId,
    );
    return latestComparablePassRunId
      ? {
          runId: latestComparablePassRunId,
          resolvedBy: "latest-comparable-pass",
        }
      : undefined;
  }
  const latestComparablePassRunId = await resolveLatestComparablePassRunId(
    repoRoot,
    candidateRunId,
  );
  if (latestComparablePassRunId) {
    return {
      runId: latestComparablePassRunId,
      resolvedBy: "latest-comparable-pass",
    };
  }
  const previousComparableRunId = await resolvePreviousComparableRunId(repoRoot, candidateRunId);
  return previousComparableRunId
    ? {
        runId: previousComparableRunId,
        resolvedBy: "previous-comparable",
      }
    : undefined;
}

export async function diffCommand(repoRoot: string, args: string[]) {
  const options = parseDiffArgs(args);
  const candidateRunId = await resolveDiffSelector(repoRoot, options.candidateSelector);
  const autoBaseline =
    options.baselineSelector === "auto" && candidateRunId
      ? await resolveAutoBaselineRunId(repoRoot, candidateRunId)
      : undefined;
  const baselineRunId =
    options.baselineSelector === "auto"
      ? autoBaseline?.runId
      : options.baselineSelector === "previous"
        ? await resolvePreviousComparableRunId(repoRoot, candidateRunId)
        : options.baselineSelector === "latest-pass"
          ? await resolveLatestComparablePassRunId(repoRoot, candidateRunId)
          : await resolveDiffSelector(repoRoot, options.baselineSelector);

  if (!baselineRunId || !candidateRunId) {
    if (
      options.baselineSelector === "auto" ||
      options.baselineSelector === "previous" ||
      options.baselineSelector === "latest-pass"
    ) {
      const fallbackPreviousRunId = await resolvePreviousRunId(repoRoot, candidateRunId);
      if (fallbackPreviousRunId) {
        throw new Error(
          `no comparable ${options.baselineSelector} Kova run found for ${candidateRunId}; nearest prior run is ${fallbackPreviousRunId}. Run another comparable candidate or choose an explicit baseline.`,
        );
      }
    }
    throw new Error("not enough Kova runs available to diff. Record at least two runs first.");
  }

  const [baseline, candidate] = await Promise.all([
    readKovaArtifact(repoRoot, baselineRunId),
    readKovaArtifact(repoRoot, candidateRunId),
  ]);
  const diff = diffArtifacts(baseline, candidate, {
    baseline: options.baselineSelector,
    candidate: options.candidateSelector,
    baselineResolved:
      options.baselineSelector === "auto"
        ? (autoBaseline?.resolvedBy ?? baselineRunId)
        : baselineRunId,
    candidateResolved: candidateRunId,
  });

  const failTriggered =
    options.failOn === "any-delta"
      ? diff.interpretation.signals.length > 0
      : options.failOn
        ? diff.interpretation.kind === options.failOn
        : false;

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
    if (failTriggered) {
      process.exitCode = 6;
    }
    return;
  }

  process.stdout.write(renderArtifactDiff(diff, baseline, candidate));
  if (failTriggered) {
    process.exitCode = 6;
  }
}
