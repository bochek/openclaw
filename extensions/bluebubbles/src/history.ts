import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { resolveBlueBubblesServerAccount } from "./account-resolve.js";
import { blueBubblesFetchWithTimeout, buildBlueBubblesApiUrl } from "./types.js";

export type BlueBubblesHistoryEntry = {
  sender: string;
  body: string;
  timestamp?: number;
  messageId?: string;
};

export type BlueBubblesHistoryFetchResult = {
  entries: BlueBubblesHistoryEntry[];
  /**
   * True when at least one API path returned a recognized response shape.
   * False means all attempts failed or returned unusable data.
   */
  resolved: boolean;
};

export type BlueBubblesMessageData = {
  guid?: string;
  text?: string;
  handle_id?: string;
  is_from_me?: boolean;
  date_created?: number;
  date_delivered?: number;
  associated_message_guid?: string;
  sender?: {
    address?: string;
    display_name?: string;
  };
};

export type BlueBubblesChatOpts = {
  serverUrl?: string;
  password?: string;
  accountId?: string;
  timeoutMs?: number;
  cfg?: OpenClawConfig;
};

function resolveAccount(params: BlueBubblesChatOpts) {
  return resolveBlueBubblesServerAccount(params);
}

/**
 * Fetch message history from BlueBubbles API for a specific chat.
 * This provides the initial backfill for both group chats and DMs.
 */
export async function fetchBlueBubblesHistory(
  chatIdentifier: string,
  limit: number,
  opts: BlueBubblesChatOpts = {},
): Promise<BlueBubblesHistoryFetchResult> {
  if (!chatIdentifier.trim() || limit <= 0) {
    return { entries: [], resolved: true };
  }

  let baseUrl: string;
  let password: string;
  try {
    ({ baseUrl, password } = resolveAccount(opts));
  } catch {
    return { entries: [], resolved: false };
  }

  // Try different common API patterns for fetching messages
  const possiblePaths = [
    `/api/v1/chat/${encodeURIComponent(chatIdentifier)}/messages?limit=${limit}&sort=DESC`,
    `/api/v1/messages?chatGuid=${encodeURIComponent(chatIdentifier)}&limit=${limit}`,
    `/api/v1/chat/${encodeURIComponent(chatIdentifier)}/message?limit=${limit}`,
  ];

  for (const path of possiblePaths) {
    try {
      const url = buildBlueBubblesApiUrl({ baseUrl, path, password });
      const res = await blueBubblesFetchWithTimeout(
        url,
        { method: "GET" },
        opts.timeoutMs ?? 10000,
      );

      if (!res.ok) {
        continue; // Try next path
      }

      const data = await res.json().catch(() => null);
      if (!data) {
        continue;
      }

      // Handle different response structures
      let messages: unknown[] = [];
      if (Array.isArray(data)) {
        messages = data;
      } else if (data.data && Array.isArray(data.data)) {
        messages = data.data;
      } else if (data.messages && Array.isArray(data.messages)) {
        messages = data.messages;
      } else {
        continue;
      }

      const historyEntries: BlueBubblesHistoryEntry[] = [];

      for (const item of messages) {
        const msg = item as BlueBubblesMessageData;

        // Skip messages without text content
        const text = msg.text?.trim();
        if (!text) {
          continue;
        }

        const sender = msg.is_from_me
          ? "me"
          : msg.sender?.display_name || msg.sender?.address || msg.handle_id || "Unknown";
        const timestamp = msg.date_created || msg.date_delivered;

        historyEntries.push({
          sender,
          body: text,
          timestamp,
          messageId: msg.guid,
        });
      }

      // Sort by timestamp (oldest first for context)
      historyEntries.sort((a, b) => {
        const aTime = a.timestamp || 0;
        const bTime = b.timestamp || 0;
        return aTime - bTime;
      });

      return {
        entries: historyEntries.slice(0, limit), // Ensure we don't exceed the requested limit
        resolved: true,
      };
    } catch (error) {
      // Continue to next path
      continue;
    }
  }

  // If none of the API paths worked, return empty history
  return { entries: [], resolved: false };
}
