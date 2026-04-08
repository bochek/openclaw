import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, Usage } from "@mariozechner/pi-ai";
import { formatErrorMessage } from "../../infra/errors.js";
import type { MessagingToolSend } from "../pi-embedded-messaging.js";
import type {
  EmbeddedRunAttemptParams,
  EmbeddedRunAttemptResult,
} from "../pi-embedded-runner/run/types.js";
import { normalizeUsage, type NormalizedUsage } from "../usage.js";
import {
  isJsonObject,
  type CodexServerNotification,
  type CodexThreadItem,
  type CodexTurn,
  type JsonObject,
  type JsonValue,
} from "./protocol.js";

export type CodexAppServerToolTelemetry = {
  didSendViaMessagingTool: boolean;
  messagingToolSentTexts: string[];
  messagingToolSentMediaUrls: string[];
  messagingToolSentTargets: MessagingToolSend[];
  successfulCronAdds?: number;
};

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

export class CodexAppServerEventProjector {
  private readonly assistantTextByItem = new Map<string, string>();
  private readonly reasoningTextByItem = new Map<string, string>();
  private readonly activeItemIds = new Set<string>();
  private readonly completedItemIds = new Set<string>();
  private assistantStarted = false;
  private completedTurn: CodexTurn | undefined;
  private promptError: unknown;
  private promptErrorSource: EmbeddedRunAttemptResult["promptErrorSource"] = null;
  private aborted = false;
  private tokenUsage: NormalizedUsage | undefined;
  private guardianReviewCount = 0;

  constructor(
    private readonly params: EmbeddedRunAttemptParams,
    private readonly threadId: string,
    private readonly turnId: string,
  ) {}

  async handleNotification(notification: CodexServerNotification): Promise<void> {
    const params = isJsonObject(notification.params) ? notification.params : undefined;
    if (!params || !this.isNotificationForTurn(params)) {
      return;
    }

    switch (notification.method) {
      case "item/agentMessage/delta":
        await this.handleAssistantDelta(params);
        break;
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/textDelta":
        await this.handleReasoningDelta(params);
        break;
      case "item/started":
        this.handleItemStarted(params);
        break;
      case "item/completed":
        this.handleItemCompleted(params);
        break;
      case "item/autoApprovalReview/started":
      case "item/autoApprovalReview/completed":
        this.guardianReviewCount += 1;
        this.params.onAgentEvent?.({
          stream: "codex_app_server.guardian",
          data: { method: notification.method },
        });
        break;
      case "thread/tokenUsage/updated":
        this.handleTokenUsage(params);
        break;
      case "turn/completed":
        this.handleTurnCompleted(params);
        break;
      case "error":
        this.promptError = readString(params, "message") ?? "codex app-server error";
        this.promptErrorSource = "prompt";
        break;
      default:
        break;
    }
  }

  buildResult(toolTelemetry: CodexAppServerToolTelemetry): EmbeddedRunAttemptResult {
    const assistantTexts = this.collectAssistantTexts();
    const lastAssistant =
      assistantTexts.length > 0
        ? this.createAssistantMessage(assistantTexts.join("\n\n"))
        : undefined;
    const messagesSnapshot: AgentMessage[] = [
      {
        role: "user",
        content: this.params.prompt,
        timestamp: Date.now(),
      },
    ];
    if (lastAssistant) {
      messagesSnapshot.push(lastAssistant);
    }
    const turnFailed = this.completedTurn?.status === "failed";
    const turnInterrupted = this.completedTurn?.status === "interrupted";
    const promptError =
      this.promptError ??
      (turnFailed ? (this.completedTurn?.error?.message ?? "codex app-server turn failed") : null);
    return {
      aborted: this.aborted || turnInterrupted,
      timedOut: false,
      idleTimedOut: false,
      timedOutDuringCompaction: false,
      promptError,
      promptErrorSource: promptError ? this.promptErrorSource || "prompt" : null,
      sessionIdUsed: this.params.sessionId,
      bootstrapPromptWarningSignaturesSeen: this.params.bootstrapPromptWarningSignaturesSeen,
      bootstrapPromptWarningSignature: this.params.bootstrapPromptWarningSignature,
      messagesSnapshot,
      assistantTexts,
      toolMetas: [],
      lastAssistant,
      didSendViaMessagingTool: toolTelemetry.didSendViaMessagingTool,
      messagingToolSentTexts: toolTelemetry.messagingToolSentTexts,
      messagingToolSentMediaUrls: toolTelemetry.messagingToolSentMediaUrls,
      messagingToolSentTargets: toolTelemetry.messagingToolSentTargets,
      successfulCronAdds: toolTelemetry.successfulCronAdds,
      cloudCodeAssistFormatError: false,
      attemptUsage: this.tokenUsage,
      replayMetadata: {
        hadPotentialSideEffects: toolTelemetry.didSendViaMessagingTool,
        replaySafe: !toolTelemetry.didSendViaMessagingTool,
      },
      itemLifecycle: {
        startedCount: this.activeItemIds.size + this.completedItemIds.size,
        completedCount: this.completedItemIds.size,
        activeCount: this.activeItemIds.size,
      },
      yieldDetected: false,
      didSendDeterministicApprovalPrompt: this.guardianReviewCount > 0 ? false : undefined,
    };
  }

  markTimedOut(): void {
    this.aborted = true;
    this.promptError = "codex app-server attempt timed out";
    this.promptErrorSource = "prompt";
  }

  private async handleAssistantDelta(params: JsonObject): Promise<void> {
    const itemId = readString(params, "itemId") ?? readString(params, "id") ?? "assistant";
    const delta = readString(params, "delta") ?? "";
    if (!delta) {
      return;
    }
    if (!this.assistantStarted) {
      this.assistantStarted = true;
      await this.params.onAssistantMessageStart?.();
    }
    const text = `${this.assistantTextByItem.get(itemId) ?? ""}${delta}`;
    this.assistantTextByItem.set(itemId, text);
    await this.params.onPartialReply?.({ text });
  }

  private async handleReasoningDelta(params: JsonObject): Promise<void> {
    const itemId = readString(params, "itemId") ?? readString(params, "id") ?? "reasoning";
    const delta = readString(params, "delta") ?? "";
    if (!delta) {
      return;
    }
    this.reasoningTextByItem.set(itemId, `${this.reasoningTextByItem.get(itemId) ?? ""}${delta}`);
    await this.params.onReasoningStream?.({ text: delta });
  }

  private handleItemStarted(params: JsonObject): void {
    const itemId = readString(params, "itemId") ?? readString(params, "id");
    if (itemId) {
      this.activeItemIds.add(itemId);
    }
    this.params.onAgentEvent?.({
      stream: "codex_app_server.item",
      data: { phase: "started", itemId },
    });
  }

  private handleItemCompleted(params: JsonObject): void {
    const item = readItem(params.item);
    const itemId = item?.id ?? readString(params, "itemId") ?? readString(params, "id");
    if (itemId) {
      this.activeItemIds.delete(itemId);
      this.completedItemIds.add(itemId);
    }
    if (item?.type === "agentMessage" && typeof item.text === "string" && item.text) {
      this.assistantTextByItem.set(item.id, item.text);
    }
    this.params.onAgentEvent?.({
      stream: "codex_app_server.item",
      data: { phase: "completed", itemId, type: item?.type },
    });
  }

  private handleTokenUsage(params: JsonObject): void {
    const tokenUsage = isJsonObject(params.tokenUsage) ? params.tokenUsage : undefined;
    const total = tokenUsage && isJsonObject(tokenUsage.total) ? tokenUsage.total : undefined;
    if (!total) {
      return;
    }
    this.tokenUsage = normalizeUsage({
      input: readNumber(total, "inputTokens"),
      output: readNumber(total, "outputTokens"),
      cacheRead: readNumber(total, "cachedInputTokens"),
      total: readNumber(total, "totalTokens"),
    });
  }

  private handleTurnCompleted(params: JsonObject): void {
    const turn = readTurn(params.turn);
    if (!turn || turn.id !== this.turnId) {
      return;
    }
    this.completedTurn = turn;
    if (turn.status === "interrupted") {
      this.aborted = true;
    }
    if (turn.status === "failed") {
      this.promptError = turn.error?.message ?? "codex app-server turn failed";
      this.promptErrorSource = "prompt";
    }
    for (const item of turn.items ?? []) {
      if (item.type === "agentMessage" && typeof item.text === "string" && item.text) {
        this.assistantTextByItem.set(item.id, item.text);
      }
    }
  }

  private collectAssistantTexts(): string[] {
    return [...this.assistantTextByItem.values()].filter((text) => text.trim().length > 0);
  }

  private createAssistantMessage(text: string): AssistantMessage {
    const usage: Usage = this.tokenUsage
      ? {
          input: this.tokenUsage.input ?? 0,
          output: this.tokenUsage.output ?? 0,
          cacheRead: this.tokenUsage.cacheRead ?? 0,
          cacheWrite: this.tokenUsage.cacheWrite ?? 0,
          totalTokens:
            this.tokenUsage.total ??
            (this.tokenUsage.input ?? 0) +
              (this.tokenUsage.output ?? 0) +
              (this.tokenUsage.cacheRead ?? 0) +
              (this.tokenUsage.cacheWrite ?? 0),
          cost: ZERO_USAGE.cost,
        }
      : ZERO_USAGE;
    return {
      role: "assistant",
      content: [{ type: "text", text }],
      api: this.params.model.api ?? "openai-codex-responses",
      provider: this.params.provider,
      model: this.params.modelId,
      usage,
      stopReason: this.aborted ? "aborted" : this.promptError ? "error" : "stop",
      errorMessage: this.promptError ? formatErrorMessage(this.promptError) : undefined,
      timestamp: Date.now(),
    };
  }

  private isNotificationForTurn(params: JsonObject): boolean {
    const threadId = readString(params, "threadId");
    const turnId = readString(params, "turnId");
    return (!threadId || threadId === this.threadId) && (!turnId || turnId === this.turnId);
  }
}

function readString(record: JsonObject, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(record: JsonObject, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readItem(value: JsonValue | undefined): CodexThreadItem | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const type = typeof value.type === "string" ? value.type : undefined;
  const id = typeof value.id === "string" ? value.id : undefined;
  if (!type || !id) {
    return undefined;
  }
  return value as CodexThreadItem;
}

function readTurn(value: JsonValue | undefined): CodexTurn | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const id = typeof value.id === "string" ? value.id : undefined;
  const status = typeof value.status === "string" ? value.status : undefined;
  if (!id || !status) {
    return undefined;
  }
  const items = Array.isArray(value.items)
    ? value.items.flatMap((item) => {
        const parsed = readItem(item);
        return parsed ? [parsed] : [];
      })
    : undefined;
  return {
    id,
    status: status as CodexTurn["status"],
    error: isJsonObject(value.error)
      ? {
          message: typeof value.error.message === "string" ? value.error.message : undefined,
        }
      : null,
    items,
  };
}
