import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConfigIO } from "./io.js";

async function withTempConfig(
  run: (params: {
    home: string;
    configPath: string;
    logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
    loadConfig: () => Record<string, unknown>;
  }) => Promise<void>,
): Promise<void> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-config-log-"));
  const configDir = path.join(home, ".openclaw");
  const configPath = path.join(configDir, "openclaw.json");
  await fs.mkdir(configDir, { recursive: true });
  const logger = { warn: vi.fn(), error: vi.fn() };
  const io = createConfigIO({
    env: {} as NodeJS.ProcessEnv,
    homedir: () => home,
    logger,
  });
  try {
    await run({
      home,
      configPath,
      logger,
      loadConfig: () => io.loadConfig() as Record<string, unknown>,
    });
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("config io warning/error logging", () => {
  it("dedupes identical warning payloads until the config changes", async () => {
    await withTempConfig(async ({ configPath, logger, loadConfig }) => {
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            plugins: {
              entries: {
                discord: { enabled: false, config: {} },
              },
            },
          },
          null,
          2,
        ),
      );

      loadConfig();
      loadConfig();
      expect(logger.warn).toHaveBeenCalledTimes(1);

      await fs.writeFile(configPath, JSON.stringify({}, null, 2));
      loadConfig();

      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            plugins: {
              entries: {
                slack: { enabled: false, config: {} },
              },
            },
          },
          null,
          2,
        ),
      );
      loadConfig();
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn.mock.calls[1]?.[0]).toContain("plugins.entries.slack");
    });
  });

  it("dedupes identical invalid config errors until the config becomes valid again", async () => {
    await withTempConfig(async ({ configPath, logger, loadConfig }) => {
      await fs.writeFile(
        configPath,
        JSON.stringify({ gateway: { port: "not-a-number" } }, null, 2),
      );

      expect(loadConfig()).toEqual({});
      expect(loadConfig()).toEqual({});
      expect(logger.error).toHaveBeenCalledTimes(1);

      await fs.writeFile(configPath, JSON.stringify({ gateway: { port: 18789 } }, null, 2));
      expect(loadConfig()).toMatchObject({ gateway: { port: 18789 } });

      await fs.writeFile(configPath, JSON.stringify({ gateway: { port: "still-bad" } }, null, 2));
      expect(loadConfig()).toEqual({});
      expect(logger.error).toHaveBeenCalledTimes(2);
    });
  });
});
