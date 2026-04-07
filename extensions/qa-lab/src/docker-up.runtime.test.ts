import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runQaDockerUp } from "./docker-up.runtime.js";

async function occupyOrReuseBusyPort(server: ReturnType<typeof createServer>, port: number) {
  return await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      cleanup();
      if (error.code === "EADDRINUSE") {
        resolve();
        return;
      }
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

async function closeIfListening(server: ReturnType<typeof createServer>) {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe("runQaDockerUp", () => {
  it("builds the QA UI, writes the harness, starts compose, and waits for health", async () => {
    const calls: string[] = [];
    const fetchCalls: string[] = [];
    const responseQueue = [false, true, false, true];
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "qa-docker-up-"));

    try {
      const result = await runQaDockerUp(
        {
          repoRoot: "/repo/openclaw",
          outputDir,
          gatewayPort: 18889,
          qaLabPort: 43124,
        },
        {
          async runCommand(command, args, cwd) {
            calls.push([command, ...args, `@${cwd}`].join(" "));
            return { stdout: "", stderr: "" };
          },
          fetchImpl: vi.fn(async (input: string) => {
            fetchCalls.push(input);
            return { ok: responseQueue.shift() ?? true };
          }),
          sleepImpl: vi.fn(async () => {}),
        },
      );

      expect(calls).toEqual([
        "pnpm qa:lab:build @/repo/openclaw",
        `docker compose -f ${outputDir}/docker-compose.qa.yml down --remove-orphans @/repo/openclaw`,
        expect.stringContaining(
          `docker compose -f ${outputDir}/docker-compose.qa.yml up --build -d @/repo/openclaw`,
        ),
      ]);
      expect(fetchCalls).toEqual([
        "http://127.0.0.1:43124/healthz",
        "http://127.0.0.1:43124/healthz",
        "http://127.0.0.1:18889/healthz",
        "http://127.0.0.1:18889/healthz",
      ]);
      expect(result.qaLabUrl).toBe("http://127.0.0.1:43124");
      expect(result.gatewayUrl).toBe("http://127.0.0.1:18889/");
      expect(result.composeFile).toBe(`${outputDir}/docker-compose.qa.yml`);
      expect(result.stopCommand).toBe(`docker compose -f ${outputDir}/docker-compose.qa.yml down`);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("skips UI build and compose --build for prebuilt images", async () => {
    const calls: string[] = [];
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "qa-docker-up-"));

    try {
      await runQaDockerUp(
        {
          repoRoot: "/repo/openclaw",
          outputDir,
          usePrebuiltImage: true,
          skipUiBuild: true,
        },
        {
          async runCommand(command, args, cwd) {
            calls.push([command, ...args, `@${cwd}`].join(" "));
            return { stdout: "", stderr: "" };
          },
          fetchImpl: vi.fn(async () => ({ ok: true })),
          sleepImpl: vi.fn(async () => {}),
        },
      );

      expect(calls).toEqual([
        `docker compose -f ${outputDir}/docker-compose.qa.yml down --remove-orphans @/repo/openclaw`,
        `docker compose -f ${outputDir}/docker-compose.qa.yml up -d @/repo/openclaw`,
      ]);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("uses a repo-root-relative default output dir when none is provided", async () => {
    const calls: string[] = [];
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "qa-docker-root-"));

    try {
      const result = await runQaDockerUp(
        {
          repoRoot,
          usePrebuiltImage: true,
          skipUiBuild: true,
        },
        {
          async runCommand(command, args, cwd) {
            calls.push([command, ...args, `@${cwd}`].join(" "));
            return { stdout: "", stderr: "" };
          },
          fetchImpl: vi.fn(async () => ({ ok: true })),
          sleepImpl: vi.fn(async () => {}),
        },
      );

      expect(result.outputDir).toBe(path.join(repoRoot, ".artifacts/qa-docker"));
      expect(result.composeFile).toBe(
        path.join(repoRoot, ".artifacts/qa-docker/docker-compose.qa.yml"),
      );
      expect(calls).toEqual([
        `docker compose -f ${path.join(repoRoot, ".artifacts/qa-docker/docker-compose.qa.yml")} down --remove-orphans @${repoRoot}`,
        `docker compose -f ${path.join(repoRoot, ".artifacts/qa-docker/docker-compose.qa.yml")} up -d @${repoRoot}`,
      ]);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("falls back to free host ports when defaults are already occupied", async () => {
    const gatewayServer = createServer();
    const labServer = createServer();
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "qa-docker-up-"));

    await occupyOrReuseBusyPort(gatewayServer, 18789);
    await occupyOrReuseBusyPort(labServer, 43124);

    try {
      const result = await runQaDockerUp(
        {
          repoRoot: "/repo/openclaw",
          outputDir,
          skipUiBuild: true,
          usePrebuiltImage: true,
        },
        {
          async runCommand() {
            return { stdout: "", stderr: "" };
          },
          fetchImpl: vi.fn(async () => ({ ok: true })),
          sleepImpl: vi.fn(async () => {}),
        },
      );

      expect(result.gatewayUrl).not.toBe("http://127.0.0.1:18789/");
      expect(result.qaLabUrl).not.toBe("http://127.0.0.1:43124");
    } finally {
      await closeIfListening(gatewayServer);
      await closeIfListening(labServer);
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
