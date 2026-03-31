/**
 * Tests for send.ts module
 *
 * Tests cover:
 * - Message sending with valid configuration
 * - Account resolution and validation
 * - Channel normalization
 * - Markdown stripping
 * - Error handling for missing/invalid accounts
 * - Registry integration
 */

import { describe, expect, it, vi } from "vitest";
import { __testing, sendMessageTwitchInternal } from "./send.js";
import {
  BASE_TWITCH_TEST_ACCOUNT,
  installTwitchTestHooks,
  makeTwitchTestConfig,
} from "./test-fixtures.js";

// Mock dependencies
vi.mock("./utils/twitch.js", () => ({
  generateMessageId: vi.fn(() => "test-msg-id"),
  normalizeTwitchChannel: (channel: string) => channel.toLowerCase().replace(/^#/, ""),
}));

describe("send", () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const mockAccount = {
    ...BASE_TWITCH_TEST_ACCOUNT,
    accessToken: "test123",
  };
  const mockResolveTwitchAccountContext = vi.fn();
  const mockGetClientManager = vi.fn();
  const mockStripMarkdownForTwitch = vi.fn((text: string) => text.replace(/\*\*/g, ""));

  const mockConfig = makeTwitchTestConfig(mockAccount);
  installTwitchTestHooks();

  describe("sendMessageTwitchInternal", () => {
    function setupAccountContext(params?: {
      account?: typeof mockAccount | null;
      configured?: boolean;
      availableAccountIds?: string[];
    }) {
      const account = params?.account === undefined ? mockAccount : params.account;
      mockResolveTwitchAccountContext.mockImplementation((_cfg, accountId) => ({
        accountId: accountId?.trim() || "default",
        account,
        tokenResolution: { source: "config", token: account?.accessToken ?? "" },
        configured: account ? (params?.configured ?? true) : false,
        availableAccountIds: params?.availableAccountIds ?? ["default"],
      }));
    }

    async function mockSuccessfulSend(params: {
      messageId: string;
      stripMarkdown?: (text: string) => string;
    }) {
      setupAccountContext();
      mockGetClientManager.mockReturnValue({
        sendMessage: vi.fn().mockResolvedValue({
          ok: true,
          messageId: params.messageId,
        }),
      });
      mockStripMarkdownForTwitch.mockImplementation(params.stripMarkdown ?? ((text) => text));

      return { stripMarkdownForTwitch: mockStripMarkdownForTwitch };
    }

    __testing.resetDepsForTest();
    __testing.setDepsForTest({
      getClientManager: mockGetClientManager,
      resolveTwitchAccountContext: mockResolveTwitchAccountContext,
      stripMarkdownForTwitch: mockStripMarkdownForTwitch,
    });

    it("should send a message successfully", async () => {
      await mockSuccessfulSend({ messageId: "twitch-msg-123" });

      const result = await sendMessageTwitchInternal(
        "#testchannel",
        "Hello Twitch!",
        mockConfig,
        "default",
        false,
        mockLogger as unknown as Console,
      );

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe("twitch-msg-123");
    });

    it("should strip markdown when enabled", async () => {
      const { stripMarkdownForTwitch } = await mockSuccessfulSend({
        messageId: "twitch-msg-456",
        stripMarkdown: (text) => text.replace(/\*\*/g, ""),
      });

      await sendMessageTwitchInternal(
        "#testchannel",
        "**Bold** text",
        mockConfig,
        "default",
        true,
        mockLogger as unknown as Console,
      );

      expect(stripMarkdownForTwitch).toHaveBeenCalledWith("**Bold** text");
    });

    it("should return error when account not found", async () => {
      setupAccountContext({ account: null });

      const result = await sendMessageTwitchInternal(
        "#testchannel",
        "Hello!",
        mockConfig,
        "nonexistent",
        false,
        mockLogger as unknown as Console,
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Account not found: nonexistent");
    });

    it("should return error when account not configured", async () => {
      setupAccountContext({ configured: false });

      const result = await sendMessageTwitchInternal(
        "#testchannel",
        "Hello!",
        mockConfig,
        "default",
        false,
        mockLogger as unknown as Console,
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("not properly configured");
    });

    it("should return error when no channel specified", async () => {
      // Set channel to undefined to trigger the error (bypassing type check)
      const accountWithoutChannel = {
        ...mockAccount,
        channel: undefined as unknown as string,
      };
      setupAccountContext({ account: accountWithoutChannel });

      const result = await sendMessageTwitchInternal(
        "",
        "Hello!",
        mockConfig,
        "default",
        false,
        mockLogger as unknown as Console,
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("No channel specified");
    });

    it("should skip sending empty message after markdown stripping", async () => {
      setupAccountContext();
      mockStripMarkdownForTwitch.mockReturnValue("");

      const result = await sendMessageTwitchInternal(
        "#testchannel",
        "**Only markdown**",
        mockConfig,
        "default",
        true,
        mockLogger as unknown as Console,
      );

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe("skipped");
    });

    it("should return error when client manager not found", async () => {
      setupAccountContext();
      mockGetClientManager.mockReturnValue(undefined);

      const result = await sendMessageTwitchInternal(
        "#testchannel",
        "Hello!",
        mockConfig,
        "default",
        false,
        mockLogger as unknown as Console,
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Client manager not found");
    });

    it("should handle send errors gracefully", async () => {
      setupAccountContext();
      mockGetClientManager.mockReturnValue({
        sendMessage: vi.fn().mockRejectedValue(new Error("Connection lost")),
      });

      const result = await sendMessageTwitchInternal(
        "#testchannel",
        "Hello!",
        mockConfig,
        "default",
        false,
        mockLogger as unknown as Console,
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Connection lost");
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should use account channel when channel parameter is empty", async () => {
      setupAccountContext();
      const mockSend = vi.fn().mockResolvedValue({
        ok: true,
        messageId: "twitch-msg-789",
      });
      mockGetClientManager.mockReturnValue({
        sendMessage: mockSend,
      });

      await sendMessageTwitchInternal(
        "",
        "Hello!",
        mockConfig,
        "default",
        false,
        mockLogger as unknown as Console,
      );

      expect(mockSend).toHaveBeenCalledWith(
        mockAccount,
        "testchannel", // normalized account channel
        "Hello!",
        mockConfig,
        "default",
      );
    });
  });
});
