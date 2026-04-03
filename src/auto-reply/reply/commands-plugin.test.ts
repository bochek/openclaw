import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { clearPluginCommands, registerPluginCommand } from "../../plugins/commands.js";
import {
  clearPluginInteractiveHandlers,
  registerPluginInteractionHandler,
} from "../../plugins/interactive.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createTestRegistry } from "../../test-utils/channel-plugins.js";
import { buildCommandTestParams } from "./commands.test-harness.js";

const { handlePluginCommand } = await import("./commands-plugin.js");

function buildParams(commandBody: string, ctxOverrides?: Record<string, unknown>) {
  const cfg = {
    commands: { text: true },
    channels: { feishu: { allowFrom: ["*"] } },
  } as OpenClawConfig;
  return buildCommandTestParams(
    commandBody,
    cfg,
    {
      Provider: "feishu",
      Surface: "feishu",
      AccountId: "default",
      To: "chat:oc_123",
      From: "user:ou_sender_1",
      ...ctxOverrides,
    },
    { workspaceDir: "/tmp/workspace" },
  );
}

describe("handlePluginCommand", () => {
  beforeEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
  });

  afterEach(() => {
    clearPluginCommands();
    clearPluginInteractiveHandlers();
  });

  it("routes fallback commands into generic interaction handlers", async () => {
    const handler = vi.fn(async (ctx) => {
      await ctx.respond.replyText({ text: `Handled ${ctx.action.actionId}` });
      return { handled: true };
    });
    expect(
      registerPluginInteractionHandler("codex-plugin", {
        namespace: "codex",
        handler,
      }),
    ).toEqual({ ok: true });

    const result = await handlePluginCommand(buildParams("/codex approve.thread"), true);

    expect(result).toEqual({
      shouldContinue: false,
      reply: { text: "Handled approve.thread" },
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "feishu",
        action: expect.objectContaining({
          kind: "command",
          actionId: "approve.thread",
        }),
      }),
    );
  });

  it("prefers explicit plugin commands over interaction fallback namespaces", async () => {
    const commandHandler = vi.fn(async () => ({ text: "explicit command" }));
    const interactionHandler = vi.fn(async () => ({ handled: true }));

    expect(
      registerPluginCommand("codex-plugin", {
        name: "codex",
        description: "Explicit command",
        acceptsArgs: true,
        handler: commandHandler,
      }),
    ).toEqual({ ok: true });
    expect(
      registerPluginInteractionHandler("codex-plugin", {
        namespace: "codex",
        handler: interactionHandler,
      }),
    ).toEqual({ ok: true });

    const result = await handlePluginCommand(buildParams("/codex approve.thread"), true);

    expect(result).toEqual({
      shouldContinue: false,
      reply: { text: "explicit command" },
    });
    expect(commandHandler).toHaveBeenCalledTimes(1);
    expect(interactionHandler).not.toHaveBeenCalled();
  });
});
