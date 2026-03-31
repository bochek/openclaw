import { beforeEach, describe, expect, it, vi } from "vitest";

const isTruthyEnvValueMock = vi.hoisted(() =>
  vi.fn((value: string | undefined) => value === "1" || value === "true"),
);
let respawnImportCounter = 0;

vi.mock("./infra/env.js", () => ({
  isTruthyEnvValue: isTruthyEnvValueMock,
}));

async function importRespawnModule(): Promise<typeof import("./entry.respawn.js")> {
  if (typeof process.versions.bun === "string") {
    respawnImportCounter += 1;
    return await import(`./entry.respawn.js?bun-respawn=${respawnImportCounter}`);
  }
  return await import("./entry.respawn.js");
}

describe("buildCliRespawnPlan", () => {
  beforeEach(() => {
    vi.resetModules();
    isTruthyEnvValueMock.mockReset();
    isTruthyEnvValueMock.mockImplementation(
      (value: string | undefined) => value === "1" || value === "true",
    );
  });

  it("returns null when respawn policy skips the argv", async () => {
    const { buildCliRespawnPlan } = await importRespawnModule();

    expect(
      buildCliRespawnPlan({
        argv: ["node", "openclaw", "--version"],
        env: {},
        execArgv: [],
        autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
      }),
    ).toBeNull();
  });

  it("adds NODE_EXTRA_CA_CERTS and warning suppression in one respawn", async () => {
    const {
      buildCliRespawnPlan,
      EXPERIMENTAL_WARNING_FLAG,
      OPENCLAW_NODE_EXTRA_CA_CERTS_READY,
      OPENCLAW_NODE_OPTIONS_READY,
    } = await importRespawnModule();
    const plan = buildCliRespawnPlan({
      argv: ["node", "openclaw", "gateway", "run"],
      env: {},
      execArgv: [],
      autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
    });

    expect(plan).not.toBeNull();
    expect(plan?.argv[0]).toBe(EXPERIMENTAL_WARNING_FLAG);
    expect(plan?.env.NODE_EXTRA_CA_CERTS).toBe("/etc/ssl/certs/ca-certificates.crt");
    expect(plan?.env[OPENCLAW_NODE_EXTRA_CA_CERTS_READY]).toBe("1");
    expect(plan?.env[OPENCLAW_NODE_OPTIONS_READY]).toBe("1");
  });

  it("does not overwrite an existing NODE_EXTRA_CA_CERTS value", async () => {
    const { buildCliRespawnPlan } = await importRespawnModule();
    const plan = buildCliRespawnPlan({
      argv: ["node", "openclaw", "gateway", "run"],
      env: { NODE_EXTRA_CA_CERTS: "/custom/ca.pem" },
      execArgv: [],
      autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
    });

    expect(plan?.env.NODE_EXTRA_CA_CERTS).toBe("/custom/ca.pem");
  });

  it("returns null when both respawn guards are already satisfied", async () => {
    const {
      buildCliRespawnPlan,
      EXPERIMENTAL_WARNING_FLAG,
      OPENCLAW_NODE_EXTRA_CA_CERTS_READY,
      OPENCLAW_NODE_OPTIONS_READY,
    } = await importRespawnModule();
    expect(
      buildCliRespawnPlan({
        argv: ["node", "openclaw", "gateway", "run"],
        env: {
          [OPENCLAW_NODE_EXTRA_CA_CERTS_READY]: "1",
          [OPENCLAW_NODE_OPTIONS_READY]: "1",
        },
        execArgv: [EXPERIMENTAL_WARNING_FLAG],
        autoNodeExtraCaCerts: "/etc/ssl/certs/ca-certificates.crt",
      }),
    ).toBeNull();
  });
});
