import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import type {
  ContextEnginePromptCacheInfo,
  ContextEngineRuntimeContext,
} from "../../../context-engine/types.js";
import type { E2ETraceCollector } from "../../../infra/e2e-trace.js";
import {
  endE2ETraceSpan,
  recordMeasuredE2ETraceSpan,
  startE2ETraceSpan,
} from "../../../infra/e2e-trace.js";
import type {
  PluginHookAgentContext,
  PluginHookBeforeAgentStartResult,
  PluginHookBeforePromptChannelsResult,
  PluginHookBeforePromptBuildResult,
} from "../../../plugins/types.js";
import { isCronSessionKey, isSubagentSessionKey } from "../../../routing/session-key.js";
import { joinPresentTextSegments } from "../../../shared/text/join-segments.js";
import { resolveHeartbeatPromptForSystemPrompt } from "../../heartbeat-system-prompt.js";
import { buildActiveMusicGenerationTaskPromptContextForSession } from "../../music-generation-task-status.js";
import type {
  PromptChannelRoutingEvent,
  PromptChannelRoutingResult,
} from "../../prompt-channels.types.js";
import { prependSystemPromptAdditionAfterCacheBoundary } from "../../system-prompt-cache-boundary.js";
import { resolveEffectiveToolFsWorkspaceOnly } from "../../tool-fs-policy.js";
import { buildActiveVideoGenerationTaskPromptContextForSession } from "../../video-generation-task-status.js";
import { buildEmbeddedCompactionRuntimeContext } from "../compaction-runtime-context.js";
import { log } from "../logger.js";
import { shouldInjectHeartbeatPromptForTrigger } from "./trigger-policy.js";
import type { EmbeddedRunAttemptParams } from "./types.js";

export type PromptBuildHookRunner = {
  hasHooks: (
    hookName: "before_prompt_channels" | "before_prompt_build" | "before_agent_start",
  ) => boolean;
  runBeforePromptChannels?: (
    event: PromptChannelRoutingEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<PluginHookBeforePromptChannelsResult | undefined>;
  runBeforePromptBuild: (
    event: { prompt: string; messages: unknown[] },
    ctx: PluginHookAgentContext,
  ) => Promise<PluginHookBeforePromptBuildResult | undefined>;
  runBeforeAgentStart: (
    event: { prompt: string; messages: unknown[] },
    ctx: PluginHookAgentContext,
  ) => Promise<PluginHookBeforeAgentStartResult | undefined>;
};

export async function resolvePromptBuildHookResult(params: {
  prompt: string;
  messages: unknown[];
  hookCtx: PluginHookAgentContext;
  hookRunner?: PromptBuildHookRunner | null;
  legacyBeforeAgentStartResult?: PluginHookBeforeAgentStartResult;
  e2eTraceContext?: E2ETraceCollector;
}): Promise<PluginHookBeforePromptBuildResult> {
  const hookStartedAt = Date.now();
  startE2ETraceSpan(params.e2eTraceContext, "pre_turn_hooks", {
    startedAt: hookStartedAt,
  });
  const promptBuildResult = params.hookRunner?.hasHooks("before_prompt_build")
    ? await params.hookRunner
        .runBeforePromptBuild(
          {
            prompt: params.prompt,
            messages: params.messages,
          },
          params.hookCtx,
        )
        .catch((hookErr: unknown) => {
          log.warn(`before_prompt_build hook failed: ${String(hookErr)}`);
          return undefined;
        })
    : undefined;
  const legacyResult =
    params.legacyBeforeAgentStartResult ??
    (params.hookRunner?.hasHooks("before_agent_start")
      ? await params.hookRunner
          .runBeforeAgentStart(
            {
              prompt: params.prompt,
              messages: params.messages,
            },
            params.hookCtx,
          )
          .catch((hookErr: unknown) => {
            log.warn(
              `before_agent_start hook (legacy prompt build path) failed: ${String(hookErr)}`,
            );
            return undefined;
          })
      : undefined);
  const hookEndedAt = Date.now();
  endE2ETraceSpan(params.e2eTraceContext, "pre_turn_hooks", {
    endedAt: hookEndedAt,
  });
  const activeMemoryTag = "<active_memory_plugin>";
  const containsActiveMemory =
    promptBuildResult?.prependContext?.includes(activeMemoryTag) ||
    legacyResult?.prependContext?.includes(activeMemoryTag) ||
    promptBuildResult?.systemPrompt?.includes(activeMemoryTag) ||
    legacyResult?.systemPrompt?.includes(activeMemoryTag);
  if (containsActiveMemory) {
    recordMeasuredE2ETraceSpan(params.e2eTraceContext, "active_memory", {
      durationMs: hookEndedAt - hookStartedAt,
      endedAt: hookEndedAt,
    });
  }
  return {
    systemPrompt: promptBuildResult?.systemPrompt ?? legacyResult?.systemPrompt,
    prependContext: joinPresentTextSegments([
      promptBuildResult?.prependContext,
      legacyResult?.prependContext,
    ]),
    prependSystemContext: joinPresentTextSegments([
      promptBuildResult?.prependSystemContext,
      legacyResult?.prependSystemContext,
    ]),
    appendSystemContext: joinPresentTextSegments([
      promptBuildResult?.appendSystemContext,
      legacyResult?.appendSystemContext,
    ]),
  };
}

export async function resolvePromptChannelHookResult(params: {
  event: PromptChannelRoutingEvent;
  hookCtx: PluginHookAgentContext;
  hookRunner?: PromptBuildHookRunner | null;
}): Promise<PromptChannelRoutingResult> {
  const promptChannelPromise =
    params.hookRunner?.hasHooks("before_prompt_channels") &&
    params.hookRunner.runBeforePromptChannels
      ? params.hookRunner.runBeforePromptChannels(params.event, params.hookCtx)
      : undefined;
  const promptChannelResult = promptChannelPromise
    ? await promptChannelPromise.catch((hookErr: unknown) => {
        log.warn(`before_prompt_channels hook failed: ${String(hookErr)}`);
        return undefined;
      })
    : undefined;
  return {
    systemAdditions: promptChannelResult?.systemAdditions,
    developerAdditions: promptChannelResult?.developerAdditions,
    userAdditions: promptChannelResult?.userAdditions,
    memorySectionTarget: promptChannelResult?.memorySectionTarget,
    contextFileRoutes: promptChannelResult?.contextFileRoutes,
  };
}

export function resolvePromptModeForSession(sessionKey?: string): "minimal" | "full" {
  if (!sessionKey) {
    return "full";
  }
  return isSubagentSessionKey(sessionKey) || isCronSessionKey(sessionKey) ? "minimal" : "full";
}

export function shouldInjectHeartbeatPrompt(params: {
  config?: OpenClawConfig;
  agentId?: string;
  defaultAgentId?: string;
  isDefaultAgent: boolean;
  trigger?: EmbeddedRunAttemptParams["trigger"];
}): boolean {
  return (
    params.isDefaultAgent &&
    shouldInjectHeartbeatPromptForTrigger(params.trigger) &&
    Boolean(
      resolveHeartbeatPromptForSystemPrompt({
        config: params.config,
        agentId: params.agentId,
        defaultAgentId: params.defaultAgentId,
      }),
    )
  );
}

export function shouldWarnOnOrphanedUserRepair(
  trigger: EmbeddedRunAttemptParams["trigger"],
): boolean {
  return trigger === "user" || trigger === "manual";
}

function extractUserMessagePlainText(content: unknown): string | undefined {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || undefined;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const text = content
    .flatMap((part) =>
      part && typeof part === "object" && "type" in part && part.type === "text"
        ? [typeof part.text === "string" ? part.text : ""]
        : [],
    )
    .join("\n")
    .trim();
  return text || undefined;
}

export function mergeOrphanedTrailingUserPrompt(params: {
  prompt: string;
  trigger: EmbeddedRunAttemptParams["trigger"];
  leafMessage: { content?: unknown };
}): { prompt: string; merged: boolean } {
  if (!shouldWarnOnOrphanedUserRepair(params.trigger)) {
    return { prompt: params.prompt, merged: false };
  }

  const orphanText = extractUserMessagePlainText(params.leafMessage.content);
  if (!orphanText || orphanText.length < 4 || params.prompt.includes(orphanText)) {
    return { prompt: params.prompt, merged: false };
  }

  return {
    prompt: [
      "[Queued user message that arrived while the previous turn was still active]",
      orphanText,
      "",
      params.prompt,
    ].join("\n"),
    merged: true,
  };
}

export function resolveAttemptFsWorkspaceOnly(params: {
  config?: OpenClawConfig;
  sessionAgentId: string;
}): boolean {
  return resolveEffectiveToolFsWorkspaceOnly({
    cfg: params.config,
    agentId: params.sessionAgentId,
  });
}

export function prependSystemPromptAddition(params: {
  systemPrompt: string;
  systemPromptAddition?: string;
}): string {
  return prependSystemPromptAdditionAfterCacheBoundary(params);
}

export function resolveAttemptPrependSystemContext(params: {
  sessionKey?: string;
  trigger?: EmbeddedRunAttemptParams["trigger"];
  hookPrependSystemContext?: string;
}): string | undefined {
  const activeMediaTaskPromptContexts =
    params.trigger === "user" || params.trigger === "manual"
      ? [
          buildActiveVideoGenerationTaskPromptContextForSession(params.sessionKey),
          buildActiveMusicGenerationTaskPromptContextForSession(params.sessionKey),
        ]
      : [];
  return joinPresentTextSegments([
    ...activeMediaTaskPromptContexts,
    params.hookPrependSystemContext,
  ]);
}

/** Build runtime context passed into context-engine afterTurn hooks. */
export function buildAfterTurnRuntimeContext(params: {
  attempt: Pick<
    EmbeddedRunAttemptParams,
    | "sessionKey"
    | "messageChannel"
    | "messageProvider"
    | "agentAccountId"
    | "currentChannelId"
    | "currentThreadTs"
    | "currentMessageId"
    | "config"
    | "skillsSnapshot"
    | "senderIsOwner"
    | "senderId"
    | "provider"
    | "modelId"
    | "thinkLevel"
    | "reasoningLevel"
    | "bashElevated"
    | "extraSystemPrompt"
    | "ownerNumbers"
    | "authProfileId"
  >;
  workspaceDir: string;
  agentDir: string;
  promptCache?: ContextEnginePromptCacheInfo;
}): ContextEngineRuntimeContext {
  return {
    ...buildEmbeddedCompactionRuntimeContext({
      sessionKey: params.attempt.sessionKey,
      messageChannel: params.attempt.messageChannel,
      messageProvider: params.attempt.messageProvider,
      agentAccountId: params.attempt.agentAccountId,
      currentChannelId: params.attempt.currentChannelId,
      currentThreadTs: params.attempt.currentThreadTs,
      currentMessageId: params.attempt.currentMessageId,
      authProfileId: params.attempt.authProfileId,
      workspaceDir: params.workspaceDir,
      agentDir: params.agentDir,
      config: params.attempt.config,
      skillsSnapshot: params.attempt.skillsSnapshot,
      senderIsOwner: params.attempt.senderIsOwner,
      senderId: params.attempt.senderId,
      provider: params.attempt.provider,
      modelId: params.attempt.modelId,
      thinkLevel: params.attempt.thinkLevel,
      reasoningLevel: params.attempt.reasoningLevel,
      bashElevated: params.attempt.bashElevated,
      extraSystemPrompt: params.attempt.extraSystemPrompt,
      ownerNumbers: params.attempt.ownerNumbers,
    }),
    ...(params.promptCache ? { promptCache: params.promptCache } : {}),
  };
}
