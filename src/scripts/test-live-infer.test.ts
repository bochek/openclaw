import { afterEach, describe, expect, it, vi } from "vitest";

const loadShellEnvFallbackMock = vi.fn();
const collectProviderApiKeysMock = vi.fn((provider: string) =>
  process.env[`TEST_AUTH_${provider.toUpperCase()}`] ? ["test-key"] : [],
);

vi.mock("../../src/infra/shell-env.js", () => ({
  loadShellEnvFallback: loadShellEnvFallbackMock,
}));

vi.mock("../../src/agents/live-auth-keys.js", () => ({
  collectProviderApiKeys: collectProviderApiKeysMock,
}));

describe("test-live-infer", () => {
  afterEach(() => {
    collectProviderApiKeysMock.mockClear();
    loadShellEnvFallbackMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("defaults to all suites with auth filtering", async () => {
    vi.stubEnv("TEST_AUTH_OPENAI", "1");
    vi.stubEnv("TEST_AUTH_GOOGLE", "1");
    vi.stubEnv("TEST_AUTH_DEEPGRAM", "1");
    vi.stubEnv("TEST_AUTH_BRAVE", "1");

    const { buildRunPlan, parseArgs } = await import("../../scripts/test-live-infer.ts");
    const plan = buildRunPlan(parseArgs([]));

    expect(plan.map((entry) => entry.suite.id)).toEqual([
      "audio",
      "embedding",
      "image",
      "model",
      "tts",
      "video",
      "web",
    ]);
    expect(plan.find((entry) => entry.suite.id === "audio")?.providers).toEqual([
      "deepgram",
      "google",
      "openai",
    ]);
    expect(plan.find((entry) => entry.suite.id === "image")?.providers).toEqual([
      "google",
      "openai",
    ]);
    expect(plan.find((entry) => entry.suite.id === "web")?.providers).toEqual([
      "brave",
      "duckduckgo",
      "google",
    ]);
  });

  it("supports suite-specific provider filters without auth narrowing", async () => {
    const { buildRunPlan, parseArgs } = await import("../../scripts/test-live-infer.ts");
    const plan = buildRunPlan(
      parseArgs(["audio", "--audio-providers", "deepgram,openai", "--all-providers"]),
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]?.suite.id).toBe("audio");
    expect(plan[0]?.providers).toEqual(["deepgram", "openai"]);
  });

  it("forwards quiet flags separately from passthrough args", async () => {
    const { parseArgs } = await import("../../scripts/test-live-infer.ts");
    const options = parseArgs(["image", "--quiet", "--reporter", "dot"]);

    expect(options.suites).toEqual(["image"]);
    expect(options.quietArgs).toEqual(["--quiet"]);
    expect(options.passthroughArgs).toEqual(["--reporter", "dot"]);
  });
});
