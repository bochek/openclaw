import { kovaRunArtifactSchema, type KovaRunArtifact } from "../contracts/run-artifact.js";
import {
  ensureDir,
  readJsonFile,
  resolveKovaRoot,
  resolveKovaRunIndexPath,
  writeJsonFile,
} from "./fs.js";

const kovaRunIndexSchema = kovaRunArtifactSchema
  .pick({
    runId: true,
    selection: true,
    backend: true,
    verdict: true,
    status: true,
    timing: true,
  })
  .extend({
    updatedAt: kovaRunArtifactSchema.shape.timing.shape.finishedAt,
  });

const kovaRunIndexFileSchema = kovaRunArtifactSchema.pick({}).extend({
  latestRunId: kovaRunArtifactSchema.shape.runId.optional(),
  runs: kovaRunIndexSchema.array().default([]),
});

type KovaRunIndexEntry = typeof kovaRunIndexSchema._type;
type KovaRunIndexFile = typeof kovaRunIndexFileSchema._type;

export async function readKovaRunIndex(repoRoot: string): Promise<KovaRunIndexFile> {
  const indexPath = resolveKovaRunIndexPath(repoRoot);
  const current = await readJsonFile<KovaRunIndexFile>(indexPath).catch(() => ({
    latestRunId: undefined,
    runs: [],
  }));
  return kovaRunIndexFileSchema.parse(current);
}

export async function updateKovaRunIndex(repoRoot: string, artifact: KovaRunArtifact) {
  const rootDir = resolveKovaRoot(repoRoot);
  await ensureDir(rootDir);
  const indexPath = resolveKovaRunIndexPath(repoRoot);
  const current = await readKovaRunIndex(repoRoot);
  const nextEntry: KovaRunIndexEntry = {
    runId: artifact.runId,
    selection: artifact.selection,
    backend: artifact.backend,
    verdict: artifact.verdict,
    status: artifact.status,
    timing: artifact.timing,
    updatedAt: artifact.timing.finishedAt,
  };
  const filteredRuns = current.runs.filter((entry) => entry.runId !== artifact.runId);
  const runs = [...filteredRuns, nextEntry].toSorted((left, right) =>
    left.updatedAt.localeCompare(right.updatedAt),
  );
  await writeJsonFile(indexPath, {
    latestRunId: artifact.runId,
    runs,
  } satisfies KovaRunIndexFile);
}
