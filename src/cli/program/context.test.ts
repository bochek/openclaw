import { describe, expect, it, vi } from "vitest";

const resolveCliChannelOptionsMock = vi.fn(() => ["telegram", "whatsapp"]);

vi.mock("../../version.js", () => ({
  VERSION: "9.9.9-test",
}));

vi.mock("../channel-options.js", () => ({
  resolveCliChannelOptions: resolveCliChannelOptionsMock,
}));

const { createProgramContext } = await import("./context.js");

describe("createProgramContext", () => {
  it("builds program context from version and resolved channel options", () => {
    resolveCliChannelOptionsMock.mockReturnValue(["telegram", "whatsapp"]);

    expect(createProgramContext()).toEqual({
      programVersion: "9.9.9-test",
      channelOptions: ["telegram", "whatsapp"],
      messageChannelOptions: "telegram|whatsapp",
      agentChannelOptions: "last|telegram|whatsapp",
    });
  });

  it("handles empty channel options", () => {
    resolveCliChannelOptionsMock.mockReturnValue([]);

    expect(createProgramContext()).toEqual({
      programVersion: "9.9.9-test",
      channelOptions: [],
      messageChannelOptions: "",
      agentChannelOptions: "last",
    });
  });

  // Fast-path correctness: channel options must NOT be resolved until a command
  // actually needs them. This ensures --help/--version never trigger catalog discovery.
  it("does not call resolveCliChannelOptions before channelOptions is accessed", () => {
    resolveCliChannelOptionsMock.mockClear();
    createProgramContext(); // create context without accessing any channel option getter
    expect(resolveCliChannelOptionsMock).not.toHaveBeenCalled();
  });

  it("calls resolveCliChannelOptions lazily when channelOptions getter is first accessed", () => {
    resolveCliChannelOptionsMock.mockClear().mockReturnValue(["discord"]);
    const ctx = createProgramContext();
    const _ = ctx.channelOptions;
    expect(resolveCliChannelOptionsMock).toHaveBeenCalledOnce();
  });

  it("caches channel options so resolveCliChannelOptions is called only once per context", () => {
    resolveCliChannelOptionsMock.mockClear().mockReturnValue(["telegram"]);
    const ctx = createProgramContext();
    const _a = ctx.channelOptions;
    const _b = ctx.messageChannelOptions;
    const _c = ctx.agentChannelOptions;
    // All three getters share the same underlying cache.
    expect(resolveCliChannelOptionsMock).toHaveBeenCalledOnce();
  });

  it("programVersion is accessible without triggering channel option resolution", () => {
    resolveCliChannelOptionsMock.mockClear();
    const ctx = createProgramContext();
    expect(ctx.programVersion).toBe("9.9.9-test");
    expect(resolveCliChannelOptionsMock).not.toHaveBeenCalled();
  });
});
