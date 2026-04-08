import { readKovaArtifact, renderArtifactSummary, resolveLatestRunId } from "../report.js";

export async function reportCommand(repoRoot: string, args: string[]) {
  const selector = args[0] ?? "latest";
  const runId = selector === "latest" ? await resolveLatestRunId(repoRoot) : selector;
  if (!runId) {
    throw new Error("no Kova runs found");
  }
  const artifact = await readKovaArtifact(repoRoot, runId);
  process.stdout.write(renderArtifactSummary(artifact));
}
