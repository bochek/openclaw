import { z } from "zod";
import { summarizeKovaCapabilityAreas } from "../../capabilities/registry.js";
import type { KovaScenarioResult, KovaVerdict } from "../../contracts/run-artifact.js";

const parallelsLaneSummarySchema = z.object({
  status: z.string().trim().min(1),
  version: z.string().trim().min(1).optional(),
  latestVersionInstalled: z.string().trim().min(1).optional(),
  mainVersion: z.string().trim().min(1).optional(),
  devVersion: z.string().trim().min(1).optional(),
  gateway: z.string().trim().min(1).optional(),
  agent: z.string().trim().min(1).optional(),
  dashboard: z.string().trim().min(1).optional(),
  discord: z.string().trim().min(1).optional(),
  precheck: z.string().trim().min(1).optional(),
  path: z.string().trim().min(1).optional(),
});

export const parallelsSummarySchema = z.object({
  vm: z.string().trim().min(1),
  snapshotHint: z.string().trim().min(1).optional(),
  snapshotId: z.string().trim().min(1).optional(),
  mode: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  latestVersion: z.string().trim().min(1).optional(),
  installVersion: z.string().trim().min(1).optional(),
  targetPackageSpec: z.string().trim().min(1).optional(),
  currentHead: z.string().trim().min(1).optional(),
  runDir: z.string().trim().min(1),
  daemon: z.string().trim().min(1).optional(),
  freshMain: parallelsLaneSummarySchema.optional(),
  upgrade: parallelsLaneSummarySchema.optional(),
});

export type KovaParallelsSummary = z.infer<typeof parallelsSummarySchema>;
export type KovaParallelsGuest = "macos" | "windows" | "linux";
export type KovaParallelsMode = "fresh" | "upgrade" | "both";
export type KovaParallelsProvider = "openai" | "anthropic" | "minimax";

function normalizeLaneVerdict(status?: string): KovaVerdict | undefined {
  if (!status || status === "skip" || status === "skipped") {
    return undefined;
  }
  return status === "pass" ? "pass" : "fail";
}

function collectLaneCapabilities(params: {
  lane: "fresh" | "upgrade";
  laneSummary: KovaParallelsSummary["freshMain"];
}) {
  const capabilities = new Set<string>(["lane.parallels", "platform.compatibility"]);
  if (params.lane === "fresh") {
    capabilities.add("install.baseline");
  }
  if (params.lane === "upgrade") {
    capabilities.add("update.dev-channel");
  }
  if (params.laneSummary?.gateway && params.laneSummary.gateway !== "skip") {
    capabilities.add("runtime.gateway");
  }
  if (params.laneSummary?.agent && params.laneSummary.agent !== "skip") {
    capabilities.add("runtime.agent-turn");
  }
  if (params.laneSummary?.dashboard && params.laneSummary.dashboard !== "skip") {
    capabilities.add("dashboard.control-ui");
  }
  if (params.laneSummary?.discord && params.laneSummary.discord !== "skip") {
    capabilities.add("integration.discord-roundtrip");
  }
  return [...capabilities].toSorted();
}

function collectLaneStepStatuses(laneSummary: KovaParallelsSummary["freshMain"]) {
  return [
    laneSummary?.gateway,
    laneSummary?.agent,
    laneSummary?.dashboard,
    laneSummary?.discord,
  ].filter((value) => value && value !== "skip");
}

function buildLaneDetails(laneSummary: KovaParallelsSummary["freshMain"]) {
  const details = [
    laneSummary?.version ? `version=${laneSummary.version}` : "",
    laneSummary?.latestVersionInstalled ? `latest=${laneSummary.latestVersionInstalled}` : "",
    laneSummary?.mainVersion ? `main=${laneSummary.mainVersion}` : "",
    laneSummary?.devVersion ? `dev=${laneSummary.devVersion}` : "",
    laneSummary?.precheck ? `precheck=${laneSummary.precheck}` : "",
    laneSummary?.path ? `path=${laneSummary.path}` : "",
  ].filter(Boolean);
  return details.length > 0 ? details.join(" | ") : undefined;
}

export function buildParallelsScenarioResults(params: {
  summary: KovaParallelsSummary;
  guest: KovaParallelsGuest;
}) {
  const scenarios: KovaScenarioResult[] = [];
  const freshVerdict = normalizeLaneVerdict(params.summary.freshMain?.status);
  if (freshVerdict) {
    const stepStatuses = collectLaneStepStatuses(params.summary.freshMain);
    scenarios.push({
      id: `fresh-${params.guest}`,
      title: `Fresh ${params.guest} smoke`,
      verdict: freshVerdict,
      capabilities: collectLaneCapabilities({
        lane: "fresh",
        laneSummary: params.summary.freshMain,
      }),
      surface: params.guest,
      details: buildLaneDetails(params.summary.freshMain),
      stepCounts: {
        total: stepStatuses.length || 1,
        passed:
          stepStatuses.filter((status) => status === "pass").length ||
          (freshVerdict === "pass" ? 1 : 0),
        failed:
          stepStatuses.filter((status) => status === "fail").length ||
          (freshVerdict === "fail" ? 1 : 0),
      },
    });
  }

  const upgradeVerdict = normalizeLaneVerdict(params.summary.upgrade?.status);
  if (upgradeVerdict) {
    const stepStatuses = collectLaneStepStatuses(params.summary.upgrade);
    scenarios.push({
      id: `upgrade-${params.guest}`,
      title: `Upgrade ${params.guest} smoke`,
      verdict: upgradeVerdict,
      capabilities: collectLaneCapabilities({
        lane: "upgrade",
        laneSummary: params.summary.upgrade,
      }),
      surface: params.guest,
      details: buildLaneDetails(params.summary.upgrade),
      stepCounts: {
        total: stepStatuses.length || 1,
        passed:
          stepStatuses.filter((status) => status === "pass").length ||
          (upgradeVerdict === "pass" ? 1 : 0),
        failed:
          stepStatuses.filter((status) => status === "fail").length ||
          (upgradeVerdict === "fail" ? 1 : 0),
      },
    });
  }

  return scenarios;
}

export function buildParallelsCoverage(scenarios: KovaScenarioResult[]) {
  const capabilityIds = [
    ...new Set(scenarios.flatMap((scenario) => scenario.capabilities)),
  ].toSorted();
  return {
    scenarioIds: scenarios.map((scenario) => scenario.id),
    capabilities: capabilityIds,
    capabilityAreas: summarizeKovaCapabilityAreas(capabilityIds),
    surfaces: [...new Set(scenarios.map((scenario) => scenario.surface).filter(Boolean))].toSorted(
      (left, right) => left.localeCompare(right),
    ),
  };
}

export function buildParallelsBaseCoverage(params: {
  guest: KovaParallelsGuest;
  mode: KovaParallelsMode;
}) {
  const capabilities = new Set<string>(["lane.parallels", "platform.compatibility"]);
  if (params.mode === "fresh" || params.mode === "both") {
    capabilities.add("install.baseline");
  }
  if (params.mode === "upgrade" || params.mode === "both") {
    capabilities.add("update.dev-channel");
  }
  const capabilityIds = [...capabilities].toSorted();
  return {
    scenarioIds: [],
    capabilities: capabilityIds,
    capabilityAreas: summarizeKovaCapabilityAreas(capabilityIds),
    surfaces: [params.guest],
  };
}

export function deriveParallelsVerdict(failedCount: number) {
  return failedCount > 0 ? "fail" : "pass";
}

export function deriveParallelsClassification(failedCount: number) {
  return failedCount > 0
    ? {
        domain: "product" as const,
        reason: "one or more Parallels smoke lanes failed",
      }
    : {
        domain: "product" as const,
        reason: "all Parallels smoke lanes passed under current selection",
      };
}

export function buildParallelsCounts(scenarios: KovaScenarioResult[]) {
  return {
    total: scenarios.length,
    passed: scenarios.filter((scenario) => scenario.verdict === "pass").length,
    failed: scenarios.filter((scenario) => scenario.verdict === "fail").length,
  };
}
