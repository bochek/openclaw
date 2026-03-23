import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncDocsLocales } from "../../src/locales/sync-docs.js";
import type { PluginCandidate } from "../../src/plugins/discovery.js";
import { loadPluginManifest } from "../../src/plugins/manifest.js";
import plugin from "./index.js";

const tempDirs: string[] = [];
const pluginRoot = path.resolve(import.meta.dirname);

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function createCandidate(): PluginCandidate {
  return {
    idHint: "de-locale",
    source: pluginRoot,
    rootDir: pluginRoot,
    origin: "bundled",
    packageDir: pluginRoot,
    packageManifest: {
      packageMode: "resource-only",
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("de-locale plugin", () => {
  it("exposes localization metadata via the manifest", () => {
    const manifest = loadPluginManifest(pluginRoot);

    expect(plugin.id).toBe("de-locale");
    expect(plugin.name).toBe("German Locale Prototype");
    expect(() => plugin.register({} as never)).not.toThrow();
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) {
      return;
    }
    expect(manifest.manifest.localization).toEqual({
      locale: "de",
      docs: {
        root: "./resources/docs/de",
        navPath: "./resources/docs-nav.de.json",
        schemaVersion: "1",
        coverage: "partial",
      },
      meta: {
        provenancePath: "./resources/provenance.json",
        sourceManifestPath: "./resources/source-manifest.json",
      },
    });
  });

  it("materializes German docs from the in-repo plugin", async () => {
    const docsDir = makeTempDir("openclaw-de-locale-docs-");
    writeJson(path.join(docsDir, "docs.json"), {
      $schema: "https://mintlify.com/docs.json",
      navigation: {
        languages: [
          {
            language: "en",
            tabs: [
              {
                tab: "Get started",
                groups: [{ group: "Overview", pages: ["index"] }],
              },
            ],
          },
        ],
      },
    });
    writeText(
      path.join(docsDir, "index.md"),
      ["---", 'title: "Overview"', 'summary: "English overview"', "---", "", "Hello", ""].join(
        "\n",
      ),
    );

    const result = await syncDocsLocales({
      docsDir,
      candidates: [createCandidate()],
    });

    expect(result.syncedLocales).toEqual([
      expect.objectContaining({
        pluginId: "de-locale",
        locale: "de",
        language: "de",
        pageCount: 2,
      }),
    ]);
    expect(fs.existsSync(path.join(result.workspaceDir, "de", "index.md"))).toBe(true);
    expect(fs.existsSync(path.join(result.workspaceDir, "de", "plugins", "manifest.md"))).toBe(
      true,
    );

    const generatedConfig = JSON.parse(fs.readFileSync(result.outputConfigPath, "utf8")) as {
      navigation: { languages: Array<{ language: string }> };
    };
    expect(generatedConfig.navigation.languages.map((entry) => entry.language)).toEqual([
      "en",
      "de",
    ]);
  });
});
