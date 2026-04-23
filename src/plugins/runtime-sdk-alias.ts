import fs from "node:fs";
import path from "node:path";

function assertPathIsNotSymlink(targetPath: string, label: string): void {
  try {
    if (fs.lstatSync(targetPath).isSymbolicLink()) {
      throw new Error(`refusing to ${label} via symlinked path: ${targetPath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function ensureDirectoryPathSegments(params: {
  rootDir: string;
  relativeSegments: readonly string[];
  label: string;
}): string {
  let cursor = params.rootDir;
  assertPathIsNotSymlink(cursor, params.label);
  for (const segment of params.relativeSegments) {
    cursor = path.join(cursor, segment);
    assertPathIsNotSymlink(cursor, params.label);
    if (!fs.existsSync(cursor)) {
      fs.mkdirSync(cursor);
    }
  }
  return cursor;
}

function writeRuntimeJsonFile(targetPath: string, value: unknown): void {
  assertPathIsNotSymlink(targetPath, "write runtime alias file");
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function hasRuntimeDefaultExport(sourcePath: string): boolean {
  const text = fs.readFileSync(sourcePath, "utf8");
  return /\bexport\s+default\b/u.test(text) || /\bas\s+default\b/u.test(text);
}

function writeRuntimeModuleWrapper(sourcePath: string, targetPath: string): void {
  const specifier = path.relative(path.dirname(targetPath), sourcePath).replaceAll(path.sep, "/");
  const normalizedSpecifier = specifier.startsWith(".") ? specifier : `./${specifier}`;
  const defaultForwarder = hasRuntimeDefaultExport(sourcePath)
    ? [
        `import defaultModule from ${JSON.stringify(normalizedSpecifier)};`,
        "let defaultExport = defaultModule;",
        `for (let index = 0; index < 4 && defaultExport && typeof defaultExport === "object" && "default" in defaultExport; index += 1) {`,
        "  defaultExport = defaultExport.default;",
        "}",
      ]
    : [
        `import * as module from ${JSON.stringify(normalizedSpecifier)};`,
        `let defaultExport = "default" in module ? module.default : module;`,
        `for (let index = 0; index < 4 && defaultExport && typeof defaultExport === "object" && "default" in defaultExport; index += 1) {`,
        "  defaultExport = defaultExport.default;",
        "}",
      ];
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(
    targetPath,
    [
      `export * from ${JSON.stringify(normalizedSpecifier)};`,
      ...defaultForwarder,
      "export { defaultExport as default };",
      "",
    ].join("\n"),
    "utf8",
  );
}

export function ensureOpenClawPluginSdkAlias(params: {
  aliasDistRoot: string;
  sdkDistRoot?: string;
}): void {
  const pluginSdkDir = path.join(params.sdkDistRoot ?? params.aliasDistRoot, "plugin-sdk");
  if (!fs.existsSync(pluginSdkDir)) {
    return;
  }

  const aliasDir = ensureDirectoryPathSegments({
    rootDir: params.aliasDistRoot,
    relativeSegments: ["extensions", "node_modules", "openclaw"],
    label: "prepare runtime alias directory",
  });
  const pluginSdkAliasDir = path.join(aliasDir, "plugin-sdk");
  writeRuntimeJsonFile(path.join(aliasDir, "package.json"), {
    name: "openclaw",
    type: "module",
    exports: {
      "./plugin-sdk": "./plugin-sdk/index.js",
      "./plugin-sdk/*": "./plugin-sdk/*.js",
    },
  });
  assertPathIsNotSymlink(pluginSdkAliasDir, "replace runtime alias directory");
  fs.rmSync(pluginSdkAliasDir, { recursive: true, force: true });
  fs.mkdirSync(pluginSdkAliasDir, { recursive: true });
  for (const entry of fs.readdirSync(pluginSdkDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name) !== ".js") {
      continue;
    }
    writeRuntimeModuleWrapper(
      path.join(pluginSdkDir, entry.name),
      path.join(pluginSdkAliasDir, entry.name),
    );
  }
}
