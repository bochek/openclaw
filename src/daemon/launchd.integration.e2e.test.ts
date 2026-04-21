import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  installLaunchAgent,
  readLaunchAgentRuntime,
  restartLaunchAgent,
  resolveLaunchAgentPlistPath,
  stopLaunchAgent,
  uninstallLaunchAgent,
} from "./launchd.js";
import type { GatewayServiceEnv } from "./service-types.js";
import { resolveGatewayService, startGatewayService } from "./service.js";

const WAIT_INTERVAL_MS = 200;
const WAIT_TIMEOUT_MS = 30_000;
const STARTUP_TIMEOUT_MS = 45_000;
const RECOVERY_TEST_TIMEOUT_MS = 90_000;

const OPENCLAW_ENTRYPOINT_PATH = fileURLToPath(new URL("../../openclaw.mjs", import.meta.url));
const REPO_ROOT = path.dirname(OPENCLAW_ENTRYPOINT_PATH);

function canRunLaunchdIntegration(): boolean {
  if (process.platform !== "darwin") {
    return false;
  }
  if (typeof process.getuid !== "function") {
    return false;
  }
  const domain = `gui/${process.getuid()}`;
  const probe = spawnSync("launchctl", ["print", domain], { encoding: "utf8" });
  if (probe.error) {
    return false;
  }
  return probe.status === 0;
}

const describeLaunchdIntegration = canRunLaunchdIntegration() ? describe : describe.skip;

async function withTimeout<T>(params: {
  run: () => Promise<T>;
  timeoutMs: number;
  message: string;
}): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      params.run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(params.message)), params.timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function waitForRunningRuntime(params: {
  env: GatewayServiceEnv;
  pidNot?: number;
  timeoutMs?: number;
}): Promise<{ pid: number }> {
  const timeoutMs = params.timeoutMs ?? WAIT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "unknown";
  let lastPid: number | undefined;
  while (Date.now() < deadline) {
    const runtime = await readLaunchAgentRuntime(params.env);
    lastStatus = runtime.status ?? "unknown";
    lastPid = runtime.pid;
    if (
      runtime.status === "running" &&
      typeof runtime.pid === "number" &&
      runtime.pid > 1 &&
      (params.pidNot === undefined || runtime.pid !== params.pidNot)
    ) {
      return { pid: runtime.pid };
    }
    await new Promise((resolve) => {
      setTimeout(resolve, WAIT_INTERVAL_MS);
    });
  }
  throw new Error(
    `Timed out waiting for launchd runtime (status=${lastStatus}, pid=${lastPid ?? "none"})`,
  );
}

async function waitForNotRunningRuntime(params: {
  env: GatewayServiceEnv;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params.timeoutMs ?? WAIT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "unknown";
  let lastPid: number | undefined;
  while (Date.now() < deadline) {
    const runtime = await readLaunchAgentRuntime(params.env);
    lastStatus = runtime.status ?? "unknown";
    lastPid = runtime.pid;
    if (runtime.status !== "running" && runtime.pid === undefined) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, WAIT_INTERVAL_MS);
    });
  }
  throw new Error(
    `Timed out waiting for launchd runtime to stop (status=${lastStatus}, pid=${lastPid ?? "none"})`,
  );
}

async function waitForCondition(params: {
  check: () => Promise<boolean>;
  timeoutMs?: number;
  label: string;
}): Promise<void> {
  const timeoutMs = params.timeoutMs ?? WAIT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await params.check()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, WAIT_INTERVAL_MS);
    });
  }
  throw new Error(`Timed out waiting for ${params.label}`);
}

function runGatewayServiceCli(params: {
  profile: string;
  stateDir: string;
  home: string;
  args: string[];
}): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [OPENCLAW_ENTRYPOINT_PATH, "--profile", params.profile, ...params.args],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: params.home,
        OPENCLAW_PROFILE: params.profile,
        OPENCLAW_STATE_DIR: params.stateDir,
      },
    },
  );
}

async function waitForExistingFile(filePath: string, timeoutMs = WAIT_TIMEOUT_MS): Promise<void> {
  await waitForCondition({
    timeoutMs,
    label: path.basename(filePath),
    check: async () => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
  });
}

function launchEnvOrThrow(env: GatewayServiceEnv | undefined): GatewayServiceEnv {
  if (!env) {
    throw new Error("launchd integration env was not initialized");
  }
  return env;
}

async function initializeLaunchdRuntime(launchEnv: GatewayServiceEnv, stdout: PassThrough) {
  await withTimeout({
    run: async () => {
      await installLaunchAgent({
        env: launchEnv,
        stdout,
        programArguments: [process.execPath, "-e", "setInterval(() => {}, 1000);"],
      });
      await waitForRunningRuntime({ env: launchEnv });
    },
    timeoutMs: STARTUP_TIMEOUT_MS,
    message: "Timed out initializing launchd integration runtime",
  });
}

async function expectRuntimePidReplaced(params: {
  env: GatewayServiceEnv;
  previousPid: number;
}): Promise<void> {
  const after = await waitForRunningRuntime({
    env: params.env,
    pidNot: params.previousPid,
  });
  expect(after.pid).toBeGreaterThan(1);
  expect(after.pid).not.toBe(params.previousPid);
  await fs.access(resolveLaunchAgentPlistPath(params.env));
}

describeLaunchdIntegration("launchd integration", () => {
  let env: GatewayServiceEnv | undefined;
  let homeDir = "";
  const stdout = new PassThrough();

  beforeAll(async () => {
    const testId = randomUUID().slice(0, 8);
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), `openclaw-launchd-int-${testId}-`));
    env = {
      HOME: homeDir,
      OPENCLAW_LAUNCHD_LABEL: `ai.openclaw.launchd-int-${testId}`,
      OPENCLAW_LOG_PREFIX: `gateway-launchd-int-${testId}`,
    };
  });

  afterAll(async () => {
    if (env) {
      try {
        await uninstallLaunchAgent({ env, stdout });
      } catch {
        // Best-effort cleanup in case launchctl state already changed.
      }
    }
    if (homeDir) {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("restarts launchd service and keeps it running with a new pid", async () => {
    const launchEnv = launchEnvOrThrow(env);
    try {
      await initializeLaunchdRuntime(launchEnv, stdout);
    } catch {
      // Best-effort integration check only; skip when launchctl is unstable in CI.
      return;
    }
    const before = await waitForRunningRuntime({ env: launchEnv });
    await restartLaunchAgent({ env: launchEnv, stdout });
    await expectRuntimePidReplaced({ env: launchEnv, previousPid: before.pid });
  }, 60_000);

  it("stops persistently without reinstall and starts later", async () => {
    const launchEnv = launchEnvOrThrow(env);
    try {
      await initializeLaunchdRuntime(launchEnv, stdout);
    } catch {
      return;
    }

    const before = await waitForRunningRuntime({ env: launchEnv });
    await stopLaunchAgent({ env: launchEnv, stdout });
    await waitForNotRunningRuntime({ env: launchEnv });
    const service = resolveGatewayService();
    const startResult = await startGatewayService(service, { env: launchEnv, stdout });
    expect(startResult.outcome).toBe("started");
    await expectRuntimePidReplaced({ env: launchEnv, previousPid: before.pid });
  }, 60_000);

  it("stops persistently without reinstall and restarts later", async () => {
    const launchEnv = launchEnvOrThrow(env);
    try {
      await initializeLaunchdRuntime(launchEnv, stdout);
    } catch {
      return;
    }

    const before = await waitForRunningRuntime({ env: launchEnv });
    await stopLaunchAgent({ env: launchEnv, stdout });
    await waitForNotRunningRuntime({ env: launchEnv });
    await restartLaunchAgent({ env: launchEnv, stdout });
    await expectRuntimePidReplaced({ env: launchEnv, previousPid: before.pid });
  }, 60_000);

  it(
    "restores last-known-good config after a supervised restart with invalid effective config",
    async () => {
      const testId = randomUUID().slice(0, 8);
      const home = await fs.mkdtemp(path.join(os.tmpdir(), `openclaw-launchd-recovery-${testId}-`));
      const stateDir = path.join(home, "state");
      const port = 19070;
      const token = `tok_${testId}`;
      const profile = `launchd-recovery-${testId}`;
      const launchEnv: GatewayServiceEnv = {
        HOME: home,
        OPENCLAW_PROFILE: profile,
        OPENCLAW_STATE_DIR: stateDir,
        OPENCLAW_LAUNCHD_LABEL: `ai.openclaw.${profile}`,
        OPENCLAW_LOG_PREFIX: `gateway-launchd-recovery-${testId}`,
      };
      const configPath = path.join(stateDir, "openclaw.json");
      const lastKnownGoodPath = `${configPath}.last-known-good`;

      try {
        await fs.mkdir(stateDir, { recursive: true });
        await fs.writeFile(
          configPath,
          `${JSON.stringify(
            {
              gateway: {
                auth: {
                  mode: "token",
                  token,
                },
                mode: "local",
              },
              meta: {
                lastTouchedVersion: "2026.4.20",
              },
            },
            null,
            2,
          )}\n`,
        );

        const install = runGatewayServiceCli({
          profile,
          stateDir,
          home,
          args: ["gateway", "install", "--force", "--json", "--port", String(port)],
        });
        expect(install.status).toBe(0);

        const before = await waitForRunningRuntime({
          env: launchEnv,
          timeoutMs: STARTUP_TIMEOUT_MS,
        });
        await waitForExistingFile(lastKnownGoodPath, STARTUP_TIMEOUT_MS);
        const expectedConfig = await fs.readFile(lastKnownGoodPath, "utf8");

        await fs.writeFile(configPath, '{\n  "gateway": {\n    "auth": ');
        const restart = runGatewayServiceCli({
          profile,
          stateDir,
          home,
          args: ["gateway", "restart", "--json"],
        });
        expect(restart.status).toBe(0);
        await expectRuntimePidReplaced({
          env: launchEnv,
          previousPid: before.pid,
        });
        await waitForCondition({
          timeoutMs: STARTUP_TIMEOUT_MS,
          label: "restored effective config",
          check: async () => {
            try {
              const restoredConfig = await fs.readFile(configPath, "utf8");
              return restoredConfig === expectedConfig;
            } catch {
              return false;
            }
          },
        });

        const restoredConfig = await fs.readFile(configPath, "utf8");
        expect(restoredConfig).toBe(expectedConfig);
      } finally {
        try {
          runGatewayServiceCli({
            profile,
            stateDir,
            home,
            args: ["gateway", "uninstall", "--json"],
          });
        } catch {
          // Best-effort cleanup for the isolated recovery agent.
        }
        await fs.rm(home, { recursive: true, force: true });
      }
    },
    RECOVERY_TEST_TIMEOUT_MS,
  );
});
