import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  persistEffectiveConfigLastKnownGood,
  readEffectiveConfigLastKnownGood,
  resolveEffectiveConfigLastKnownGoodPath,
  restoreEffectiveConfigLastKnownGood,
} from "./effective-config-recovery.js";

describe("effective config recovery", () => {
  it("persists and reads a last-known-good snapshot", async () => {
    await withTempDir({ prefix: "openclaw-effective-config-" }, async (tempDir) => {
      const configPath = path.join(tempDir, "openclaw.json");
      const snapshot = await persistEffectiveConfigLastKnownGood({
        path: configPath,
        raw: '{ gateway: { mode: "local" } }\n',
      });

      expect(snapshot).not.toBeNull();
      expect(resolveEffectiveConfigLastKnownGoodPath(configPath)).toBe(
        `${configPath}.last-known-good`,
      );

      const stored = await readEffectiveConfigLastKnownGood(configPath);
      expect(stored).toEqual(snapshot);
    });
  });

  it("restores the effective config from last-known-good", async () => {
    await withTempDir({ prefix: "openclaw-effective-config-" }, async (tempDir) => {
      const configPath = path.join(tempDir, "openclaw.json");
      const lastKnownGoodRaw = '{ gateway: { mode: "loopback" } }\n';
      await persistEffectiveConfigLastKnownGood({
        path: configPath,
        raw: lastKnownGoodRaw,
      });
      await fs.writeFile(configPath, '{ gateway: { mode: "lan" } }\n', "utf8");

      const restored = await restoreEffectiveConfigLastKnownGood(configPath);

      expect(restored?.raw).toBe(lastKnownGoodRaw);
      await expect(fs.readFile(configPath, "utf8")).resolves.toBe(lastKnownGoodRaw);
    });
  });

  it("ignores invalid last-known-good payloads", async () => {
    await withTempDir({ prefix: "openclaw-effective-config-" }, async (tempDir) => {
      const configPath = path.join(tempDir, "openclaw.json");
      const filePath = resolveEffectiveConfigLastKnownGoodPath(configPath);
      await fs.writeFile(filePath, "{ invalid", "utf8");

      await expect(readEffectiveConfigLastKnownGood(configPath)).resolves.toBeNull();
      await expect(restoreEffectiveConfigLastKnownGood(configPath)).resolves.toBeNull();
    });
  });
});
