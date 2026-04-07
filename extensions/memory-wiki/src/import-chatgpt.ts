import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { slugifyWikiSegment } from "./markdown.js";

type ChatGptMessage = {
  role: string;
  text: string;
  sortTime: number;
  sourceIndex: number;
};

type ChatGptMappingNode = {
  id: string;
  parentId?: string;
  message: ChatGptMessage | null;
};

export type ChatGptExportConversation = {
  conversationId: string;
  title: string;
  relativePath: string;
  transcriptBody: string;
  messageCount: number;
  participantRoles: string[];
  conversationCreatedAt?: string;
  conversationUpdatedAt?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeTimestamp(value: unknown): { iso?: string; sortTime: number } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime())
      ? { sortTime: 0 }
      : { iso: date.toISOString(), sortTime: ms };
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? { sortTime: 0 }
      : { iso: date.toISOString(), sortTime: date.getTime() };
  }
  return { sortTime: 0 };
}

function normalizeRole(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim().toLowerCase();
  }
  return "unknown";
}

function formatRoleHeading(role: string): string {
  return role
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function collectTextFragments(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTextFragments(entry));
  }
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  for (const key of ["text", "parts", "content"]) {
    if (key in record) {
      const fragments = collectTextFragments(record[key]);
      if (fragments.length > 0) {
        return fragments;
      }
    }
  }
  return [];
}

function extractMessageText(contentValue: unknown): string {
  const content = asRecord(contentValue);
  if (!content) {
    return "";
  }
  if (Array.isArray(content.parts)) {
    return collectTextFragments(content.parts).join("\n\n");
  }
  if (typeof content.text === "string" && content.text.trim()) {
    return content.text.trim();
  }
  if (Array.isArray(content.text)) {
    return collectTextFragments(content.text).join("\n\n");
  }
  return "";
}

function shouldImportConversationMessage(params: {
  role: string;
  message: Record<string, unknown>;
}): boolean {
  if (params.role === "tool") {
    return false;
  }
  const metadata = asRecord(params.message.metadata);
  if (metadata?.is_visually_hidden_from_conversation === true) {
    return false;
  }
  return true;
}

function compareChatGptMessages(left: ChatGptMessage, right: ChatGptMessage): number {
  if (left.sortTime !== right.sortTime) {
    if (left.sortTime === 0) {
      return 1;
    }
    if (right.sortTime === 0) {
      return -1;
    }
    return left.sortTime - right.sortTime;
  }
  return left.sourceIndex - right.sourceIndex;
}

function extractConversationMessages(mappingValue: unknown): ChatGptMessage[] {
  const mapping = asRecord(mappingValue);
  if (!mapping) {
    return [];
  }
  return Object.values(mapping)
    .flatMap((entry, sourceIndex) => {
      const node = asRecord(entry);
      const message = asRecord(node?.message);
      if (!message) {
        return [];
      }
      const text = extractMessageText(message.content);
      if (!text) {
        return [];
      }
      const author = asRecord(message.author);
      const role = normalizeRole(author?.role ?? author?.name);
      if (!shouldImportConversationMessage({ role, message })) {
        return [];
      }
      const { sortTime } = normalizeTimestamp(message.create_time ?? node?.create_time);
      return [
        {
          role,
          text,
          sortTime,
          sourceIndex,
        },
      ];
    })
    .toSorted(compareChatGptMessages);
}

function extractConversationMappingNodes(mappingValue: unknown): ChatGptMappingNode[] {
  const mapping = asRecord(mappingValue);
  if (!mapping) {
    return [];
  }
  return Object.entries(mapping).map(([id, entry], sourceIndex) => {
    const node = asRecord(entry);
    const message = asRecord(node?.message);
    const text = extractMessageText(message?.content);
    const author = asRecord(message?.author);
    const role = normalizeRole(author?.role ?? author?.name);
    const { sortTime } = normalizeTimestamp(message?.create_time ?? node?.create_time);
    return {
      id,
      parentId:
        typeof node?.parent === "string" && node.parent.trim() ? node.parent.trim() : undefined,
      message:
        text && message && shouldImportConversationMessage({ role, message })
          ? {
              role,
              text,
              sortTime,
              sourceIndex,
            }
          : null,
    };
  });
}

function extractCurrentConversationMessages(params: {
  mappingValue: unknown;
  currentNodeId?: unknown;
}): ChatGptMessage[] {
  const nodes = extractConversationMappingNodes(params.mappingValue);
  if (
    nodes.length === 0 ||
    typeof params.currentNodeId !== "string" ||
    !params.currentNodeId.trim()
  ) {
    return extractConversationMessages(params.mappingValue);
  }

  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const lineage: ChatGptMessage[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = params.currentNodeId.trim();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) {
      break;
    }
    if (node.message) {
      lineage.push(node.message);
    }
    cursor = node.parentId;
  }
  if (lineage.length === 0) {
    return extractConversationMessages(params.mappingValue);
  }
  return lineage.toReversed();
}

function renderTranscriptBody(messages: ChatGptMessage[]): string {
  if (messages.length === 0) {
    return "_No readable ChatGPT transcript messages were found in this export conversation._";
  }
  return messages
    .flatMap((message) => [`### ${formatRoleHeading(message.role)}`, "", message.text, ""])
    .join("\n")
    .trim();
}

function resolveConversationRecords(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry) => {
      const record = asRecord(entry);
      return record ? [record] : [];
    });
  }
  const envelope = asRecord(parsed);
  if (Array.isArray(envelope?.conversations)) {
    return envelope.conversations.flatMap((entry) => {
      const record = asRecord(entry);
      return record ? [record] : [];
    });
  }
  return [];
}

function resolveConversationId(record: Record<string, unknown>, index: number): string {
  for (const key of ["id", "conversation_id", "conversationId"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return `conversation-${index + 1}`;
}

export async function parseChatGptExportFile(
  inputPath: string,
): Promise<ChatGptExportConversation[]> {
  const raw = await fs.readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const records = resolveConversationRecords(parsed);
  if (records.length === 0) {
    throw new Error(`No ChatGPT conversations found in export: ${inputPath}`);
  }

  const conversations = records.flatMap((record, index) => {
    const conversationId = resolveConversationId(record, index);
    const title =
      (typeof record.title === "string" && record.title.trim()) || `Conversation ${index + 1}`;
    const created = normalizeTimestamp(record.create_time);
    const updated = normalizeTimestamp(record.update_time);
    const messages = extractCurrentConversationMessages({
      mappingValue: record.mapping,
      currentNodeId: record.current_node,
    });
    if (messages.length === 0) {
      return [];
    }
    const participantRoles = [...new Set(messages.map((message) => message.role))].toSorted();
    const relativeSlug = slugifyWikiSegment(title);
    const idHash = createHash("sha1").update(conversationId).digest("hex").slice(0, 8);
    return [
      {
        conversationId,
        title,
        relativePath: `${relativeSlug}-${idHash}.md`,
        transcriptBody: renderTranscriptBody(messages),
        messageCount: messages.length,
        participantRoles,
        ...(created.iso ? { conversationCreatedAt: created.iso } : {}),
        ...(updated.iso ? { conversationUpdatedAt: updated.iso } : {}),
      },
    ];
  });
  if (conversations.length === 0) {
    throw new Error(`No readable ChatGPT conversations found in export: ${inputPath}`);
  }
  return conversations;
}
