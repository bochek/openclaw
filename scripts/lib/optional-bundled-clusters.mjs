import fs from "node:fs";
import path from "node:path";

export const optionalBundledClusters = [
  "acpx",
  "diagnostics-otel",
  "diffs",
  "googlechat",
  "matrix",
  "memory-lancedb",
  "msteams",
  "nostr",
  "tlon",
  "twitch",
  "ui",
  "whatsapp",
  "zalouser",
];

export const optionalBundledClusterSet = new Set(optionalBundledClusters);

export const OPTIONAL_BUNDLED_BUILD_ENV = "OPENCLAW_INCLUDE_OPTIONAL_BUNDLED";

export function isOptionalBundledCluster(cluster) {
  return optionalBundledClusterSet.has(cluster);
}

export function shouldIncludeOptionalBundledClusters(env = process.env) {
  return env[OPTIONAL_BUNDLED_BUILD_ENV] === "1";
}

export function shouldBuildBundledCluster(cluster, env = process.env) {
  return shouldIncludeOptionalBundledClusters(env) || !isOptionalBundledCluster(cluster);
}

export function resolveOptionalBundledClusterRequiredPackPaths(repoRoot = process.cwd()) {
  return optionalBundledClusters
    .filter((cluster) =>
      fs.existsSync(path.join(repoRoot, "extensions", cluster, "openclaw.plugin.json")),
    )
    .flatMap((cluster) => [
      `dist/extensions/${cluster}/openclaw.plugin.json`,
      `dist/extensions/${cluster}/package.json`,
    ]);
}

export function collectMissingOptionalBundledClusterPackPaths(paths, repoRoot = process.cwd()) {
  const presentPaths = new Set(paths);
  return resolveOptionalBundledClusterRequiredPackPaths(repoRoot).filter(
    (path) => !presentPaths.has(path),
  );
}
