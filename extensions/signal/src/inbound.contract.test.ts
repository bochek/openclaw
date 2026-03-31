import { describe, expect, it } from "vitest";
import { finalizeInboundContext } from "../../../src/auto-reply/reply/inbound-context.js";
import { expectChannelInboundContextContract } from "../../../src/channels/plugins/contracts/suites.js";

describe("signal inbound contract", () => {
  it("keeps inbound context finalized", () => {
    const ctx = finalizeInboundContext({
      Body: "Alice: hi",
      BodyForAgent: "hi",
      RawBody: "hi",
      CommandBody: "hi",
      BodyForCommands: "hi",
      From: "group:g1",
      To: "group:g1",
      SessionKey: "agent:main:signal:group:g1",
      AccountId: "default",
      ChatType: "group",
      ConversationLabel: "Alice",
      GroupSubject: "Test Group",
      SenderName: "Alice",
      SenderId: "+15550001111",
      Provider: "signal",
      Surface: "signal",
      MessageSid: "1700000000000",
      OriginatingChannel: "signal",
      OriginatingTo: "group:g1",
      CommandAuthorized: true,
    });

    expect(ctx).toBeTruthy();
    expectChannelInboundContextContract(ctx);
  });
});
