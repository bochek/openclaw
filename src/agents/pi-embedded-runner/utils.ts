import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ReasoningLevel, ThinkLevel } from "../../auto-reply/thinking.js";

type AdaptiveThinkingTrigger = "cron" | "heartbeat" | "manual" | "memory" | "overflow" | "user";

export type ResolveAdaptiveThinkingParams = {
  level?: ThinkLevel;
  prompt?: string;
  trigger?: AdaptiveThinkingTrigger;
  provider?: string;
  modelId?: string;
  hasImages?: boolean;
  disableTools?: boolean;
};

const SIMPLE_TURN_RE =
  /^\s*(\/?(status|help|start|menu|ping|model|models)|hi|hello|hey|yo|ok|okay|thanks|thank you|what model are you|what'?s your model)\b/i;

const HIGH_SIGNAL_RE =
  /\b(debug|investigate|trace|logs?|root cause|why|broken|failing|failed|failure|error|exception|timeout|regression|smoke test|doctor|health ?check|review|audit|plan|architecture|design)\b/i;

const MUTATION_RE =
  /\b(fix|patch|implement|edit|change|update|delete|remove|clean|deploy|migrate|restart|install|configure|setup|reauth|auth|wire|enable|disable)\b/i;

const RISK_SURFACE_RE =
  /\b(vps|production|prod|gateway|systemd|service|oauth|auth|token|secret|api key|database|db|convex|graph|email|telegram|discord|journal|cron|provider|model|billing|security|ssh)\b/i;

const XHIGH_RISK_RE =
  /\b(delete|remove|migrate|migration|production|prod|oauth|auth|token|secret|security|database|db|billing|gateway|systemd|restart|deploy)\b/i;

export function resolveAdaptiveThinkingLevel(params: ResolveAdaptiveThinkingParams): ThinkLevel {
  const requested = params.level ?? "off";
  if (requested !== "adaptive") {
    return requested;
  }

  const prompt = params.prompt ?? "";
  const trimmedPrompt = prompt.trim();
  const promptChars = trimmedPrompt.length;

  if (params.trigger === "memory" || params.trigger === "heartbeat") {
    return "low";
  }

  if (params.trigger === "cron") {
    return HIGH_SIGNAL_RE.test(prompt) || MUTATION_RE.test(prompt) ? "medium" : "low";
  }

  if (!params.hasImages && promptChars < 160 && SIMPLE_TURN_RE.test(trimmedPrompt)) {
    return "low";
  }

  if (params.hasImages) {
    return "high";
  }

  const highSignal = HIGH_SIGNAL_RE.test(prompt);
  const mutation = MUTATION_RE.test(prompt);
  const riskSurface = RISK_SURFACE_RE.test(prompt);

  if (mutation && riskSurface && XHIGH_RISK_RE.test(prompt)) {
    return "xhigh";
  }

  if ((mutation && riskSurface) || highSignal) {
    return "high";
  }

  if (promptChars > 8_000) {
    return "high";
  }

  if (promptChars > 2_500 || !params.disableTools) {
    return "medium";
  }

  return "low";
}

export function mapThinkingLevel(level?: ThinkLevel): ThinkingLevel {
  // pi-agent-core supports "xhigh"; OpenClaw enables it for specific models.
  if (!level) {
    return "off";
  }
  if (level === "max") {
    return "xhigh";
  }
  // "adaptive" maps to "medium" at the pi-agent-core layer.  The Pi SDK
  // provider then translates this to `thinking.type: "adaptive"` with
  // `output_config.effort: "medium"` for models that support it (Opus 4.6,
  // Sonnet 4.6).
  if (level === "adaptive") {
    return "medium";
  }
  return level;
}

export type { ReasoningLevel, ThinkLevel };
