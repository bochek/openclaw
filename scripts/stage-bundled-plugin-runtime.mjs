import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { removePathIfExists } from "./runtime-postbuild-shared.mjs";

function symlinkType() {
  return process.platform === "win32" ? "junction" : "dir";
}

function relativeSymlinkTarget(sourcePath, targetPath) {
  const relativeTarget = path.relative(path.dirname(targetPath), sourcePath);
  return relativeTarget || ".";
}

function ensureSymlink(targetValue, targetPath, type) {
  try {
    fs.symlinkSync(targetValue, targetPath, type);
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }

  try {
    if (fs.lstatSync(targetPath).isSymbolicLink() && fs.readlinkSync(targetPath) === targetValue) {
      return;
    }
  } catch {
    // Fall through and recreate the target when inspection fails.
  }

  removePathIfExists(targetPath);
  fs.symlinkSync(targetValue, targetPath, type);
}

function symlinkPath(sourcePath, targetPath, type) {
  ensureSymlink(relativeSymlinkTarget(sourcePath, targetPath), targetPath, type);
}

function shouldWrapRuntimeJsFile(sourcePath) {
  return path.extname(sourcePath) === ".js";
}

function shouldCopyRuntimeFile(sourcePath) {
  const relativePath = sourcePath.replace(/\\/g, "/");
  return (
    relativePath.endsWith("/package.json") ||
    relativePath.endsWith("/openclaw.plugin.json") ||
    relativePath.endsWith("/.codex-plugin/plugin.json") ||
    relativePath.endsWith("/.claude-plugin/plugin.json") ||
    relativePath.endsWith("/.cursor-plugin/plugin.json")
  );
}

function writeRuntimeModuleWrapper(sourcePath, targetPath) {
  const specifier = relativeSymlinkTarget(sourcePath, targetPath).replace(/\\/g, "/");
  const normalizedSpecifier = specifier.startsWith(".") ? specifier : `./${specifier}`;
  writeFileIfChanged(
    targetPath,
    [
      `export * from ${JSON.stringify(normalizedSpecifier)};`,
      `import * as module from ${JSON.stringify(normalizedSpecifier)};`,
      "export default module.default;",
      "",
    ].join("\n"),
  );
}

function prepareWritableTarget(targetPath) {
  try {
    const stat = fs.lstatSync(targetPath);
    if (!stat.isFile()) {
      removePathIfExists(targetPath);
    }
  } catch {
    // Target missing. Parent creation happens below.
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

function writeFileIfChanged(targetPath, contents) {
  prepareWritableTarget(targetPath);
  const next = String(contents);
  try {
    if (fs.readFileSync(targetPath, "utf8") === next) {
      return;
    }
  } catch {
    // Rewrite when missing or unreadable.
  }
  fs.writeFileSync(targetPath, next, "utf8");
}

function copyFileIfChanged(sourcePath, targetPath) {
  prepareWritableTarget(targetPath);
  const next = fs.readFileSync(sourcePath);
  try {
    const current = fs.readFileSync(targetPath);
    if (current.equals(next)) {
      return;
    }
  } catch {
    // Rewrite when missing or unreadable.
  }
  fs.writeFileSync(targetPath, next);
}

function removeStaleRuntimeEntries(sourceDir, targetDir) {
  let targetEntries = [];
  try {
    targetEntries = fs.readdirSync(targetDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of targetEntries) {
    if (entry.name === "node_modules") {
      continue;
    }
    const sourcePath = path.join(sourceDir, entry.name);
    if (fs.existsSync(sourcePath)) {
      continue;
    }
    removePathIfExists(path.join(targetDir, entry.name));
  }
}

function stagePluginRuntimeOverlay(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  removeStaleRuntimeEntries(sourceDir, targetDir);

  for (const dirent of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (dirent.name === "node_modules") {
      continue;
    }

    const sourcePath = path.join(sourceDir, dirent.name);
    const targetPath = path.join(targetDir, dirent.name);

    if (dirent.isDirectory()) {
      stagePluginRuntimeOverlay(sourcePath, targetPath);
      continue;
    }

    if (dirent.isSymbolicLink()) {
      ensureSymlink(fs.readlinkSync(sourcePath), targetPath);
      continue;
    }

    if (!dirent.isFile()) {
      continue;
    }

    if (shouldWrapRuntimeJsFile(sourcePath)) {
      writeRuntimeModuleWrapper(sourcePath, targetPath);
      continue;
    }

    if (shouldCopyRuntimeFile(sourcePath)) {
      copyFileIfChanged(sourcePath, targetPath);
      continue;
    }

    symlinkPath(sourcePath, targetPath);
  }
}

function linkPluginNodeModules(params) {
  const runtimeNodeModulesDir = path.join(params.runtimePluginDir, "node_modules");
  removePathIfExists(runtimeNodeModulesDir);
  if (!fs.existsSync(params.sourcePluginNodeModulesDir)) {
    return;
  }
  ensureSymlink(params.sourcePluginNodeModulesDir, runtimeNodeModulesDir, symlinkType());
}

export function stageBundledPluginRuntime(params = {}) {
  const repoRoot = params.cwd ?? params.repoRoot ?? process.cwd();
  const distRoot = path.join(repoRoot, "dist");
  const runtimeRoot = path.join(repoRoot, "dist-runtime");
  const distExtensionsRoot = path.join(distRoot, "extensions");
  const runtimeExtensionsRoot = path.join(runtimeRoot, "extensions");

  if (!fs.existsSync(distExtensionsRoot)) {
    removePathIfExists(runtimeRoot);
    return;
  }

  fs.mkdirSync(runtimeExtensionsRoot, { recursive: true });
  const sourcePluginIds = new Set();

  for (const dirent of fs.readdirSync(distExtensionsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    sourcePluginIds.add(dirent.name);
    const distPluginDir = path.join(distExtensionsRoot, dirent.name);
    const runtimePluginDir = path.join(runtimeExtensionsRoot, dirent.name);
    const distPluginNodeModulesDir = path.join(distPluginDir, "node_modules");

    stagePluginRuntimeOverlay(distPluginDir, runtimePluginDir);
    linkPluginNodeModules({
      runtimePluginDir,
      sourcePluginNodeModulesDir: distPluginNodeModulesDir,
    });
  }

  for (const dirent of fs.readdirSync(runtimeExtensionsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    if (sourcePluginIds.has(dirent.name)) {
      continue;
    }
    removePathIfExists(path.join(runtimeExtensionsRoot, dirent.name));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  stageBundledPluginRuntime();
}
