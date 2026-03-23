import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginCandidate } from "../plugins/discovery.js";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "../plugins/test-helpers/fs-fixtures.js";
import { getSelectedLocaleResource, loadLocaleRegistry } from "./registry.js";

const tempDirs: string[] = [];

function makeTempDir() {
  return makeTrackedTempDir("openclaw-locales-registry", tempDirs);
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeLocalePackage(params: {
  rootDir: string;
  id: string;
  locale: string;
  version?: string;
  docs?: boolean;
  controlUi?: boolean;
  runtime?: boolean;
}) {
  writeJson(path.join(params.rootDir, "package.json"), {
    name: `@openclaw/${params.id}`,
    version: params.version ?? "0.0.1",
    openclaw: {
      packageMode: "resource-only",
    },
  });
  writeJson(path.join(params.rootDir, "openclaw.plugin.json"), {
    id: params.id,
    configSchema: { type: "object", additionalProperties: false, properties: {} },
    localization: {
      locale: params.locale,
      ...(params.docs
        ? {
            docs: {
              root: `./resources/docs/${params.locale}`,
              navPath: `./resources/docs-nav.${params.locale}.json`,
              schemaVersion: "1",
            },
          }
        : {}),
      ...(params.controlUi
        ? {
            controlUi: {
              translationPath: `./resources/control-ui/${params.locale}.json`,
              schemaVersion: "1",
            },
          }
        : {}),
      ...(params.runtime
        ? {
            runtime: {
              catalogPath: `./resources/runtime/${params.locale}.json`,
              schemaVersion: "1",
            },
          }
        : {}),
    },
  });
}

function createCandidate(params: {
  rootDir: string;
  idHint: string;
  origin: PluginCandidate["origin"];
  version?: string;
}): PluginCandidate {
  return {
    idHint: params.idHint,
    source: params.rootDir,
    rootDir: params.rootDir,
    origin: params.origin,
    packageDir: params.rootDir,
    packageManifest: {
      packageMode: "resource-only",
    },
    packageVersion: params.version,
  };
}

afterEach(() => {
  cleanupTrackedTempDirs(tempDirs);
});

describe("loadLocaleRegistry", () => {
  it("selects higher-precedence origins for the same locale and kind", () => {
    const bundledDir = makeTempDir();
    const configDir = makeTempDir();
    writeLocalePackage({
      rootDir: bundledDir,
      id: "locale-de-bundled",
      locale: "de",
      docs: true,
    });
    writeLocalePackage({
      rootDir: configDir,
      id: "locale-de-config",
      locale: "de",
      docs: true,
    });

    const registry = loadLocaleRegistry({
      candidates: [
        createCandidate({ rootDir: bundledDir, idHint: "locale-de-bundled", origin: "bundled" }),
        createCandidate({ rootDir: configDir, idHint: "locale-de-config", origin: "config" }),
      ],
    });

    const selection = getSelectedLocaleResource(registry, "de", "docs");
    expect(selection?.selected.pluginId).toBe("locale-de-config");
    expect(selection?.shadowed.map((entry) => entry.pluginId)).toEqual(["locale-de-bundled"]);
    expect(registry.conflicts).toEqual([
      expect.objectContaining({
        key: "de::docs",
        selectedPluginId: "locale-de-config",
        shadowedPluginIds: ["locale-de-bundled"],
      }),
    ]);
  });

  it("falls back to a compatible lower-precedence provider when a higher-precedence one is incompatible", () => {
    const bundledDir = makeTempDir();
    const globalDir = makeTempDir();
    writeLocalePackage({ rootDir: bundledDir, id: "locale-de-bundled", locale: "de", docs: true });
    writeLocalePackage({ rootDir: globalDir, id: "locale-de-global", locale: "de", docs: true });
    const globalManifestPath = path.join(globalDir, "openclaw.plugin.json");
    const globalManifest = JSON.parse(fs.readFileSync(globalManifestPath, "utf8")) as {
      localization: Record<string, unknown>;
    };
    globalManifest.localization.compatibility = { minOpenClawVersion: ">=9999.1.1" };
    fs.writeFileSync(globalManifestPath, `${JSON.stringify(globalManifest, null, 2)}\n`, "utf8");

    const registry = loadLocaleRegistry({
      env: { OPENCLAW_VERSION: "2026.3.22" },
      candidates: [
        createCandidate({ rootDir: globalDir, idHint: "locale-de-global", origin: "global" }),
        createCandidate({ rootDir: bundledDir, idHint: "locale-de-bundled", origin: "bundled" }),
      ],
    });

    const selection = getSelectedLocaleResource(registry, "de", "docs");
    expect(selection?.selected.pluginId).toBe("locale-de-bundled");
    expect(selection?.selectionReason).toBe("compatibility");
  });

  it("does not treat different resource kinds for the same locale as conflicts", () => {
    const docsDir = makeTempDir();
    const runtimeDir = makeTempDir();
    writeLocalePackage({ rootDir: docsDir, id: "locale-de-docs", locale: "de", docs: true });
    writeLocalePackage({
      rootDir: runtimeDir,
      id: "locale-de-runtime",
      locale: "de",
      runtime: true,
    });

    const registry = loadLocaleRegistry({
      candidates: [
        createCandidate({ rootDir: docsDir, idHint: "locale-de-docs", origin: "global" }),
        createCandidate({ rootDir: runtimeDir, idHint: "locale-de-runtime", origin: "global" }),
      ],
    });

    expect(getSelectedLocaleResource(registry, "de", "docs")?.selected.pluginId).toBe(
      "locale-de-docs",
    );
    expect(getSelectedLocaleResource(registry, "de", "runtime")?.selected.pluginId).toBe(
      "locale-de-runtime",
    );
    expect(registry.conflicts).toHaveLength(0);
  });
});
