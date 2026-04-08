import fs from "node:fs/promises";
import path from "node:path";

export function resolveKovaRoot(repoRoot: string) {
  return path.join(repoRoot, ".artifacts", "kova");
}

export function resolveKovaRunsDir(repoRoot: string) {
  return path.join(resolveKovaRoot(repoRoot), "runs");
}

export function resolveKovaRunIndexPath(repoRoot: string) {
  return path.join(resolveKovaRoot(repoRoot), "run-index.json");
}

export function resolveKovaRunDir(repoRoot: string, runId: string) {
  return path.join(resolveKovaRunsDir(repoRoot), runId);
}

export async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJsonFile(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJsonFile<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}
