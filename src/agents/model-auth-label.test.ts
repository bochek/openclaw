import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing as modelAuthLabelTesting, resolveModelAuthLabel } from "./model-auth-label.js";

const mocks = vi.hoisted(() => ({
  ensureAuthProfileStore: vi.fn(),
  resolveAuthProfileOrder: vi.fn(),
  resolveAuthProfileDisplayLabel: vi.fn(),
  resolveUsableCustomProviderApiKey: vi.fn(() => null),
  resolveEnvApiKey: vi.fn(() => null),
}));

describe("resolveModelAuthLabel", () => {
  beforeEach(() => {
    mocks.ensureAuthProfileStore.mockReset();
    mocks.resolveAuthProfileOrder.mockReset();
    mocks.resolveAuthProfileDisplayLabel.mockReset();
    mocks.resolveUsableCustomProviderApiKey.mockReset();
    mocks.resolveUsableCustomProviderApiKey.mockReturnValue(null);
    mocks.resolveEnvApiKey.mockReset();
    mocks.resolveEnvApiKey.mockReturnValue(null);
    modelAuthLabelTesting.setDepsForTest({
      ensureAuthProfileStore: mocks.ensureAuthProfileStore,
      resolveAuthProfileOrder: mocks.resolveAuthProfileOrder,
      resolveAuthProfileDisplayLabel: mocks.resolveAuthProfileDisplayLabel,
      resolveUsableCustomProviderApiKey: mocks.resolveUsableCustomProviderApiKey,
      resolveEnvApiKey: mocks.resolveEnvApiKey,
    });
  });

  afterEach(() => {
    modelAuthLabelTesting.setDepsForTest();
  });

  it("does not include token value in label for token profiles", () => {
    mocks.ensureAuthProfileStore.mockReturnValue({
      version: 1,
      profiles: {
        "github-copilot:default": {
          type: "token",
          provider: "github-copilot",
          token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // pragma: allowlist secret
          tokenRef: { source: "env", provider: "default", id: "GITHUB_TOKEN" },
        },
      },
    } as never);
    mocks.resolveAuthProfileOrder.mockReturnValue(["github-copilot:default"]);
    mocks.resolveAuthProfileDisplayLabel.mockReturnValue("github-copilot:default");

    const label = resolveModelAuthLabel({
      provider: "github-copilot",
      cfg: {},
      sessionEntry: { authProfileOverride: "github-copilot:default" } as never,
    });

    expect(label).toBe("token (github-copilot:default)");
    expect(label).not.toContain("ghp_");
    expect(label).not.toContain("ref(");
  });

  it("does not include api-key value in label for api-key profiles", () => {
    const shortSecret = "abc123"; // pragma: allowlist secret
    mocks.ensureAuthProfileStore.mockReturnValue({
      version: 1,
      profiles: {
        "openai:default": {
          type: "api_key",
          provider: "openai",
          key: shortSecret,
        },
      },
    } as never);
    mocks.resolveAuthProfileOrder.mockReturnValue(["openai:default"]);
    mocks.resolveAuthProfileDisplayLabel.mockReturnValue("openai:default");

    const label = resolveModelAuthLabel({
      provider: "openai",
      cfg: {},
      sessionEntry: { authProfileOverride: "openai:default" } as never,
    });

    expect(label).toBe("api-key (openai:default)");
    expect(label).not.toContain(shortSecret);
    expect(label).not.toContain("...");
  });

  it("shows oauth type with profile label", () => {
    mocks.ensureAuthProfileStore.mockReturnValue({
      version: 1,
      profiles: {
        "anthropic:oauth": {
          type: "oauth",
          provider: "anthropic",
        },
      },
    } as never);
    mocks.resolveAuthProfileOrder.mockReturnValue(["anthropic:oauth"]);
    mocks.resolveAuthProfileDisplayLabel.mockReturnValue("anthropic:oauth");

    const label = resolveModelAuthLabel({
      provider: "anthropic",
      cfg: {},
      sessionEntry: { authProfileOverride: "anthropic:oauth" } as never,
    });

    expect(label).toBe("oauth (anthropic:oauth)");
  });
});
