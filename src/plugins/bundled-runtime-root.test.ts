import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { prepareBundledPluginRuntimeRoot } from "./bundled-runtime-root.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-bundled-runtime-root-"));
}

function writeMirroredRuntimeFixture(params: {
  packageRoot: string;
  pluginRoot: string;
  pluginSdkDir: string;
}) {
  fs.mkdirSync(params.pluginRoot, { recursive: true });
  fs.mkdirSync(params.pluginSdkDir, { recursive: true });
  fs.writeFileSync(
    path.join(params.packageRoot, "package.json"),
    JSON.stringify({ name: "openclaw", type: "module" }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(params.pluginRoot, "monitor-polling.runtime.js"),
    [
      'import { sentinelValue } from "openclaw/plugin-sdk/text-runtime";',
      "export const mirroredSentinel = sentinelValue;",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(path.join(params.pluginRoot, "package.json"), JSON.stringify({}), "utf8");
  fs.writeFileSync(
    path.join(params.pluginSdkDir, "text-runtime.js"),
    'export const sentinelValue = "runtime-alias-ok";\n',
    "utf8",
  );
  fs.writeFileSync(path.join(params.pluginSdkDir, "index.js"), "export {};\n", "utf8");
}

describe("bundled runtime root mirroring", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("preserves openclaw/plugin-sdk imports for mirrored staged dist roots", async () => {
    const packageRoot = makeTempDir();
    const stageDir = makeTempDir();
    tempDirs.push(packageRoot, stageDir);

    const pluginRoot = path.join(packageRoot, "dist", "extensions", "telegram");
    const pluginSdkDir = path.join(packageRoot, "dist", "plugin-sdk");
    writeMirroredRuntimeFixture({ packageRoot, pluginRoot, pluginSdkDir });

    const prepared = prepareBundledPluginRuntimeRoot({
      pluginId: "telegram",
      pluginRoot,
      modulePath: path.join(pluginRoot, "monitor-polling.runtime.js"),
      env: {
        ...process.env,
        OPENCLAW_PLUGIN_STAGE_DIR: stageDir,
      },
    });

    expect(prepared.pluginRoot).not.toBe(pluginRoot);
    const stagedPackageRoot = path.join(stageDir, fs.readdirSync(stageDir)[0] ?? "");
    expect(
      fs.existsSync(
        path.join(
          stagedPackageRoot,
          "dist",
          "extensions",
          "node_modules",
          "openclaw",
          "plugin-sdk",
          "text-runtime.js",
        ),
      ),
    ).toBe(true);

    await expect(import(pathToFileURL(prepared.modulePath).href)).resolves.toBeTruthy();
  });

  it("preserves openclaw/plugin-sdk imports for mirrored staged dist-runtime roots", async () => {
    const packageRoot = makeTempDir();
    const stageDir = makeTempDir();
    tempDirs.push(packageRoot, stageDir);

    const pluginRoot = path.join(packageRoot, "dist-runtime", "extensions", "telegram");
    const pluginSdkDir = path.join(packageRoot, "dist", "plugin-sdk");
    writeMirroredRuntimeFixture({ packageRoot, pluginRoot, pluginSdkDir });

    const prepared = prepareBundledPluginRuntimeRoot({
      pluginId: "telegram",
      pluginRoot,
      modulePath: path.join(pluginRoot, "monitor-polling.runtime.js"),
      env: {
        ...process.env,
        OPENCLAW_PLUGIN_STAGE_DIR: stageDir,
      },
    });

    const stagedPackageRoot = path.join(stageDir, fs.readdirSync(stageDir)[0] ?? "");
    expect(
      fs.existsSync(
        path.join(
          stagedPackageRoot,
          "dist-runtime",
          "extensions",
          "node_modules",
          "openclaw",
          "plugin-sdk",
          "text-runtime.js",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(stagedPackageRoot, "dist", "plugin-sdk", "text-runtime.js")),
    ).toBe(true);

    await expect(import(pathToFileURL(prepared.modulePath).href)).resolves.toBeTruthy();
  });
});
