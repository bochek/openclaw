import { describe, expect, it } from "vitest";
import { expectChannelInboundContextContract } from "../../../src/channels/plugins/contracts/suites.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { resolveRelativeBundledPluginPublicModuleId } from "../../../src/test-utils/bundled-plugin-public-surface.js";

const telegramHarnessModuleId = resolveRelativeBundledPluginPublicModuleId({
  fromModuleUrl: import.meta.url,
  pluginId: "telegram",
  artifactBasename: "src/bot-message-context.test-harness.js",
});

describe("telegram inbound contract", () => {
  it("keeps inbound context finalized", async () => {
    const telegramHarnessModule = (await import(telegramHarnessModuleId)) as {
      buildTelegramMessageContextForTest: (params: {
        cfg: OpenClawConfig;
        message: Record<string, unknown>;
      }) => Promise<{ ctxPayload: unknown } | null | undefined>;
    };

    const context = await telegramHarnessModule.buildTelegramMessageContextForTest({
      cfg: {
        agents: {
          defaults: {
            envelopeTimezone: "utc",
          },
        },
        channels: {
          telegram: {
            groupPolicy: "open",
            groups: { "*": { requireMention: false } },
          },
        },
      } satisfies OpenClawConfig,
      message: {
        chat: { id: 42, type: "group", title: "Ops" },
        text: "hello",
        date: 1736380800,
        message_id: 2,
        from: {
          id: 99,
          first_name: "Ada",
          last_name: "Lovelace",
          username: "ada",
        },
      },
    });

    const payload = context?.ctxPayload;
    expect(payload).toBeTruthy();
    if (!payload) {
      throw new Error("expected telegram inbound payload");
    }
    expectChannelInboundContextContract(payload);
  });
});
