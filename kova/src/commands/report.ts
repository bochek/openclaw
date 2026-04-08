import { readKovaArtifact, renderArtifactSummary, resolveLatestRunId } from "../report.js";

export async function reportCommand(repoRoot: string, args: string[]) {
  const json = args.includes("--json");
  const filteredArgs = args.filter((arg) => arg !== "--json");
  const selector = filteredArgs[0] ?? "latest";
  const runId = selector === "latest" ? await resolveLatestRunId(repoRoot) : selector;
  if (!runId) {
    throw new Error("no Kova runs found. Run 'kova run qa' to record the first artifact.");
  }
  const artifact = await readKovaArtifact(repoRoot, runId);
  if (json) {
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
    return;
  }
  process.stdout.write(renderArtifactSummary(artifact));
}
