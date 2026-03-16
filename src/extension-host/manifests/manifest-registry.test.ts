import { describe, expect, it, vi } from "vitest";
import { loadPackageManifest } from "../../plugins/manifest.js";
import { buildResolvedExtensionRecord } from "./manifest-registry.js";

vi.mock("../../plugins/manifest.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../plugins/manifest.js")>();
  return {
    ...actual,
    loadPackageManifest: vi.fn(actual.loadPackageManifest),
  };
});

describe("extension host manifest registry", () => {
  it("does not fall back to disk package loading when only description is present on the candidate", () => {
    const loadPackageManifestMock = vi.mocked(loadPackageManifest);
    loadPackageManifestMock.mockClear();

    buildResolvedExtensionRecord({
      manifest: {
        id: "demo",
        name: "Demo",
      },
      candidate: {
        id: "demo",
        rootDir: "/plugins/demo",
        source: "/plugins/demo/index.ts",
        origin: "workspace",
        packageDescription: "candidate description only",
      },
      manifestPath: "/plugins/demo/plugin.json",
    });

    expect(loadPackageManifestMock).not.toHaveBeenCalled();
  });
});
