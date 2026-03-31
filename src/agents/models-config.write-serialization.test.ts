import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  CUSTOM_PROXY_MODELS_CONFIG,
  installModelsConfigTestHooks,
  withModelsTempHome,
} from "./models-config.e2e-harness.js";
import { ensureOpenClawModelsJson } from "./models-config.js";
import { readGeneratedModelsJson } from "./models-config.test-utils.js";

installModelsConfigTestHooks();

describe("models-config write serialization", () => {
  it("serializes concurrent models.json writes to avoid overlap", { timeout: 20_000 }, async () => {
    await withModelsTempHome(async () => {
      const first = structuredClone(CUSTOM_PROXY_MODELS_CONFIG);
      const second = structuredClone(CUSTOM_PROXY_MODELS_CONFIG);
      const firstModel = first.models?.providers?.["custom-proxy"]?.models?.[0];
      const secondModel = second.models?.providers?.["custom-proxy"]?.models?.[0];
      if (!firstModel || !secondModel) {
        throw new Error("custom-proxy fixture missing expected model entries");
      }
      firstModel.name = "Proxy A";
      secondModel.name = "Proxy B with longer name";

      const originalWriteFile = fs.writeFile.bind(fs);
      let inFlightWrites = 0;
      let maxInFlightWrites = 0;
      let firstWriteEntered = false;
      let resolveFirstWriteStarted: (() => void) | undefined;
      let releaseFirstWrite: (() => void) | undefined;
      const firstWriteStarted = new Promise<void>((resolve) => {
        resolveFirstWriteStarted = resolve;
      });
      const firstWriteGate = new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      });
      const writeSpy = vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
        inFlightWrites += 1;
        if (inFlightWrites > maxInFlightWrites) {
          maxInFlightWrites = inFlightWrites;
        }
        if (!firstWriteEntered) {
          firstWriteEntered = true;
          resolveFirstWriteStarted?.();
          await firstWriteGate;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        try {
          return await originalWriteFile(...args);
        } finally {
          inFlightWrites -= 1;
        }
      });

      try {
        const firstWrite = ensureOpenClawModelsJson(first);
        await firstWriteStarted;
        const secondWrite = ensureOpenClawModelsJson(second);
        releaseFirstWrite?.();
        await Promise.all([firstWrite, secondWrite]);
      } finally {
        writeSpy.mockRestore();
      }

      expect(maxInFlightWrites).toBe(1);
      const parsed = await readGeneratedModelsJson<{
        providers: { "custom-proxy"?: { models?: Array<{ name?: string }> } };
      }>();
      expect(parsed.providers["custom-proxy"]?.models?.[0]?.name).toBe("Proxy B with longer name");
    });
  });
});
