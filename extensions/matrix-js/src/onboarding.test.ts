import type { RuntimeEnv, WizardPrompter } from "openclaw/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { matrixOnboardingAdapter } from "./onboarding.js";
import { setMatrixRuntime } from "./runtime.js";
import type { CoreConfig } from "./types.js";

vi.mock("./matrix/deps.js", () => ({
  ensureMatrixSdkInstalled: vi.fn(async () => {}),
  isMatrixSdkAvailable: vi.fn(() => true),
}));

describe("matrix onboarding", () => {
  const previousEnv = {
    MATRIX_HOMESERVER: process.env.MATRIX_HOMESERVER,
    MATRIX_USER_ID: process.env.MATRIX_USER_ID,
    MATRIX_ACCESS_TOKEN: process.env.MATRIX_ACCESS_TOKEN,
    MATRIX_PASSWORD: process.env.MATRIX_PASSWORD,
  };

  afterEach(() => {
    process.env.MATRIX_HOMESERVER = previousEnv.MATRIX_HOMESERVER;
    process.env.MATRIX_USER_ID = previousEnv.MATRIX_USER_ID;
    process.env.MATRIX_ACCESS_TOKEN = previousEnv.MATRIX_ACCESS_TOKEN;
    process.env.MATRIX_PASSWORD = previousEnv.MATRIX_PASSWORD;
  });

  it("does not offer env shortcut when adding a non-default account", async () => {
    setMatrixRuntime({
      state: {
        resolveStateDir: (_env: NodeJS.ProcessEnv, homeDir?: () => string) =>
          (homeDir ?? (() => "/tmp"))(),
      },
      config: {
        loadConfig: () => ({}),
      },
    } as never);

    process.env.MATRIX_HOMESERVER = "https://matrix.env.example.org";
    process.env.MATRIX_USER_ID = "@env:example.org";
    process.env.MATRIX_PASSWORD = "env-password";
    process.env.MATRIX_ACCESS_TOKEN = "";

    const confirmMessages: string[] = [];
    const prompter = {
      note: vi.fn(async () => {}),
      select: vi.fn(async ({ message }: { message: string }) => {
        if (message === "Matrix-js already configured. What do you want to do?") {
          return "add-account";
        }
        if (message === "Matrix auth method") {
          return "token";
        }
        throw new Error(`unexpected select prompt: ${message}`);
      }),
      text: vi.fn(async ({ message }: { message: string }) => {
        if (message === "Matrix account name") {
          return "ops";
        }
        if (message === "Matrix homeserver URL") {
          return "https://matrix.ops.example.org";
        }
        if (message === "Matrix access token") {
          return "ops-token";
        }
        if (message === "Matrix device name (optional)") {
          return "Ops Device";
        }
        throw new Error(`unexpected text prompt: ${message}`);
      }),
      confirm: vi.fn(async ({ message }: { message: string }) => {
        confirmMessages.push(message);
        if (message === "Enable end-to-end encryption (E2EE)?") {
          return false;
        }
        if (message === "Configure Matrix rooms access?") {
          return false;
        }
        return false;
      }),
    } as unknown as WizardPrompter;

    const result = await matrixOnboardingAdapter.configureInteractive!({
      cfg: {
        channels: {
          "matrix-js": {
            accounts: {
              default: {
                homeserver: "https://matrix.main.example.org",
                accessToken: "main-token",
              },
            },
          },
        },
      } as CoreConfig,
      runtime: { log: vi.fn(), error: vi.fn(), exit: vi.fn() } as unknown as RuntimeEnv,
      prompter,
      options: undefined,
      accountOverrides: {},
      shouldPromptAccountIds: true,
      forceAllowFrom: false,
      configured: true,
      label: "Matrix-js",
    });

    expect(result).not.toBe("skip");
    if (result !== "skip") {
      expect(result.accountId).toBe("ops");
      expect(result.cfg.channels?.["matrix-js"]?.accounts?.ops).toMatchObject({
        homeserver: "https://matrix.ops.example.org",
        accessToken: "ops-token",
      });
    }
    expect(confirmMessages).not.toContain("Matrix env vars detected. Use env values?");
  });
});
