import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginCandidate } from "../plugins/discovery.js";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "../plugins/test-helpers/fs-fixtures.js";
import { syncDocsLocales } from "./sync-docs.js";

const tempDirs: string[] = [];

function makeTempDir() {
  return makeTrackedTempDir("openclaw-locales-sync-docs", tempDirs);
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function createLocalePluginCandidate(
  rootDir: string,
  idHint: string,
  origin: PluginCandidate["origin"] = "global",
): PluginCandidate {
  return {
    idHint,
    source: rootDir,
    rootDir,
    origin,
    packageDir: rootDir,
    packageManifest: {
      packageMode: "resource-only",
    },
  };
}

function writeLocalePlugin(params: { pluginDir: string; id: string; locale: string }) {
  writeJson(path.join(params.pluginDir, "package.json"), {
    name: `@openclaw/${params.id}`,
    version: "0.0.1",
    openclaw: {
      packageMode: "resource-only",
    },
  });
  writeJson(path.join(params.pluginDir, "openclaw.plugin.json"), {
    id: params.id,
    configSchema: { type: "object", additionalProperties: false, properties: {} },
    localization: {
      locale: params.locale,
      docs: {
        root: `./resources/docs/${params.locale}`,
        navPath: `./resources/docs-nav.${params.locale}.json`,
        schemaVersion: "1",
      },
    },
  });
  writeJson(path.join(params.pluginDir, "resources", `docs-nav.${params.locale}.json`), {
    language: params.locale,
    tabs: [
      {
        tab: "Get started",
        groups: [{ group: "Overview", pages: [`${params.locale}/index`] }],
      },
    ],
  });
  writeText(
    path.join(params.pluginDir, "resources", "docs", params.locale, "index.md"),
    ["---", `summary: "${params.locale}"`, 'title: "Overview"', "---", ""].join("\n"),
  );
}

function writeCanonicalDocsFixture(docsDir: string) {
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
        {
          language: "zh-CN",
          tabs: [
            {
              tab: "开始",
              groups: [{ group: "概览", pages: ["zh-CN/index"] }],
            },
          ],
        },
      ],
    },
  });
  writeText(
    path.join(docsDir, "index.md"),
    ["---", 'summary: "English overview"', 'title: "Overview"', "---", "", "Hello", ""].join("\n"),
  );
  writeText(
    path.join(docsDir, "zh-CN", "index.md"),
    ["---", 'summary: "已跟踪中文页"', 'title: "概览"', "---", "", "tracked", ""].join("\n"),
  );
}

afterEach(() => {
  cleanupTrackedTempDirs(tempDirs);
});

describe("syncDocsLocales", () => {
  it("builds a generated workspace without mutating source-owned locale docs", async () => {
    const docsDir = makeTempDir();
    const pluginDir = makeTempDir();

    writeCanonicalDocsFixture(docsDir);
    writeLocalePlugin({ pluginDir, id: "locale-de", locale: "de" });

    const sourceDocsConfigBefore = fs.readFileSync(path.join(docsDir, "docs.json"), "utf8");
    const sourceTrackedZhBefore = fs.readFileSync(path.join(docsDir, "zh-CN", "index.md"), "utf8");

    const result = await syncDocsLocales({
      docsDir,
      candidates: [createLocalePluginCandidate(pluginDir, "locale-de")],
    });

    expect(result.workspaceDir).toBe(path.join(docsDir, ".generated", "locale-workspace"));
    expect(result.syncedLocales).toEqual([
      expect.objectContaining({
        pluginId: "locale-de",
        locale: "de",
        language: "de",
        pageCount: 1,
        targetDir: path.join(result.workspaceDir, "de"),
      }),
    ]);
    expect(fs.existsSync(path.join(result.workspaceDir, "de", "index.md"))).toBe(true);

    const generatedConfig = JSON.parse(fs.readFileSync(result.outputConfigPath, "utf8")) as {
      navigation: { languages: Array<{ language: string }> };
    };
    expect(generatedConfig.navigation.languages.map((entry) => entry.language)).toEqual([
      "en",
      "de",
    ]);

    expect(fs.readFileSync(path.join(docsDir, "docs.json"), "utf8")).toBe(sourceDocsConfigBefore);
    expect(fs.readFileSync(path.join(docsDir, "zh-CN", "index.md"), "utf8")).toBe(
      sourceTrackedZhBefore,
    );
  });

  it("cleans stale generated locales by rebuilding the workspace from scratch", async () => {
    const docsDir = makeTempDir();
    const dePluginDir = makeTempDir();
    const frPluginDir = makeTempDir();

    writeCanonicalDocsFixture(docsDir);
    writeLocalePlugin({ pluginDir: dePluginDir, id: "locale-de", locale: "de" });
    writeLocalePlugin({ pluginDir: frPluginDir, id: "locale-fr", locale: "fr" });

    const first = await syncDocsLocales({
      docsDir,
      candidates: [
        createLocalePluginCandidate(dePluginDir, "locale-de"),
        createLocalePluginCandidate(frPluginDir, "locale-fr"),
      ],
    });
    expect(fs.existsSync(path.join(first.workspaceDir, "fr", "index.md"))).toBe(true);

    const second = await syncDocsLocales({
      docsDir,
      candidates: [createLocalePluginCandidate(dePluginDir, "locale-de")],
    });

    expect(fs.existsSync(path.join(second.workspaceDir, "fr"))).toBe(false);
    const generatedConfig = JSON.parse(fs.readFileSync(second.outputConfigPath, "utf8")) as {
      navigation: { languages: Array<{ language: string }> };
    };
    expect(generatedConfig.navigation.languages.map((entry) => entry.language)).toEqual([
      "en",
      "de",
    ]);
  });

  it("rejects locale nav pages that escape the locale namespace", async () => {
    const docsDir = makeTempDir();
    const pluginDir = makeTempDir();

    writeCanonicalDocsFixture(docsDir);
    writeJson(path.join(pluginDir, "package.json"), {
      name: "@openclaw/locale-de",
      version: "0.0.1",
      openclaw: { packageMode: "resource-only" },
    });
    writeJson(path.join(pluginDir, "openclaw.plugin.json"), {
      id: "locale-de",
      configSchema: { type: "object", additionalProperties: false, properties: {} },
      localization: {
        locale: "de",
        docs: {
          root: "./resources/docs/de",
          navPath: "./resources/docs-nav.de.json",
          schemaVersion: "1",
        },
      },
    });
    writeJson(path.join(pluginDir, "resources", "docs-nav.de.json"), {
      language: "de",
      tabs: [{ tab: "Get started", groups: [{ group: "Overview", pages: ["index"] }] }],
    });
    writeText(
      path.join(pluginDir, "resources", "docs", "de", "index.md"),
      ["---", 'summary: "Deutsche Übersicht"', 'title: "Überblick"', "---", ""].join("\n"),
    );

    await expect(
      syncDocsLocales({
        docsDir,
        candidates: [createLocalePluginCandidate(pluginDir, "locale-de")],
      }),
    ).rejects.toThrow(/locale namespace/);
  });

  it("rejects symlinked docs roots that resolve outside the plugin root", async () => {
    const docsDir = makeTempDir();
    const pluginDir = makeTempDir();
    const outsideDir = makeTempDir();

    writeCanonicalDocsFixture(docsDir);
    writeJson(path.join(pluginDir, "package.json"), {
      name: "@openclaw/locale-de",
      version: "0.0.1",
      openclaw: { packageMode: "resource-only" },
    });
    writeJson(path.join(pluginDir, "openclaw.plugin.json"), {
      id: "locale-de",
      configSchema: { type: "object", additionalProperties: false, properties: {} },
      localization: {
        locale: "de",
        docs: {
          root: "./resources/docs/de",
          navPath: "./resources/docs-nav.de.json",
          schemaVersion: "1",
        },
      },
    });
    writeJson(path.join(pluginDir, "resources", "docs-nav.de.json"), {
      language: "de",
      tabs: [{ tab: "Get started", groups: [{ group: "Overview", pages: ["de/index"] }] }],
    });
    writeText(
      path.join(outsideDir, "index.md"),
      ["---", 'summary: "outside"', "---", ""].join("\n"),
    );

    const pluginDocsParent = path.join(pluginDir, "resources", "docs");
    fs.mkdirSync(pluginDocsParent, { recursive: true });
    const symlinkTarget = path.join(pluginDocsParent, "de");
    let symlinked = true;
    try {
      fs.symlinkSync(outsideDir, symlinkTarget, "dir");
    } catch {
      symlinked = false;
    }
    if (!symlinked) {
      return;
    }

    await expect(
      syncDocsLocales({
        docsDir,
        candidates: [createLocalePluginCandidate(pluginDir, "locale-de")],
      }),
    ).rejects.toThrow(/outside plugin root|must not contain symlinks/);
  });

  it("uses nav metadata from the selected artifact copy", async () => {
    const docsDir = makeTempDir();
    const bundledPluginDir = makeTempDir();
    const workspacePluginDir = makeTempDir();

    writeCanonicalDocsFixture(docsDir);
    writeLocalePlugin({ pluginDir: bundledPluginDir, id: "locale-de", locale: "de" });
    writeLocalePlugin({ pluginDir: workspacePluginDir, id: "locale-de", locale: "de" });

    writeJson(path.join(bundledPluginDir, "resources", "docs-nav.de.json"), {
      language: "de-bundled",
      tabs: [
        {
          tab: "Get started",
          groups: [{ group: "Overview", pages: ["de/index"] }],
        },
      ],
    });
    writeJson(path.join(workspacePluginDir, "resources", "docs-nav.de.json"), {
      language: "de-workspace",
      tabs: [
        {
          tab: "Get started",
          groups: [{ group: "Overview", pages: ["de/index"] }],
        },
      ],
    });

    const result = await syncDocsLocales({
      docsDir,
      candidates: [
        createLocalePluginCandidate(bundledPluginDir, "locale-de", "bundled"),
        createLocalePluginCandidate(workspacePluginDir, "locale-de", "workspace"),
      ],
    });

    expect(result.syncedLocales).toEqual([
      expect.objectContaining({
        pluginId: "locale-de",
        locale: "de",
        language: "de-workspace",
      }),
    ]);
  });
});
