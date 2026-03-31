import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMatrixResolveTargetsForTest } from "./onboarding.js";
import { installMatrixTestRuntime } from "./test-runtime.js";
import type { CoreConfig } from "./types.js";

const { runMatrixAddAccountAllowlistConfigure } = await import("./onboarding.test-harness.js");

const resolveMatrixTargetsMock = vi.fn(
  async () => [{ input: "Alice", resolved: true, id: "@alice:example.org" }] as const,
);

describe("matrix onboarding account-scoped resolution", () => {
  beforeEach(() => {
    installMatrixTestRuntime();
    resolveMatrixTargetsMock.mockReset();
    resolveMatrixTargetsMock.mockResolvedValue([
      { input: "Alice", resolved: true, id: "@alice:example.org" },
    ]);
    setMatrixResolveTargetsForTest(
      resolveMatrixTargetsMock as typeof import("./resolve-targets.js").resolveMatrixTargets,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    setMatrixResolveTargetsForTest(undefined);
  });

  it("passes accountId into Matrix allowlist target resolution during onboarding", async () => {
    const result = await runMatrixAddAccountAllowlistConfigure({
      cfg: {
        channels: {
          matrix: {
            accounts: {
              default: {
                homeserver: "https://matrix.main.example.org",
                accessToken: "main-token",
              },
            },
          },
        },
      } as CoreConfig,
      allowFromInput: "Alice",
      roomsAllowlistInput: "",
    });

    expect(result).not.toBe("skip");
    expect(resolveMatrixTargetsMock).toHaveBeenCalledWith({
      cfg: expect.any(Object),
      accountId: "ops",
      inputs: ["Alice"],
      kind: "user",
    });
  });
});
