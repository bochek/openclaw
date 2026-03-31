import { vi } from "vitest";
import {
  makeIsolatedAgentJobFixture,
  makeIsolatedAgentParamsFixture,
} from "./isolated-agent/job-fixtures.js";

type AbortEmbeddedPiRun = typeof import("../agents/pi-embedded.js").abortEmbeddedPiRun;
type ResolveEmbeddedSessionLane = typeof import("../agents/pi-embedded.js").resolveEmbeddedSessionLane;
type RunEmbeddedPiAgent = typeof import("../agents/pi-embedded.js").runEmbeddedPiAgent;
type LoadModelCatalog = typeof import("../agents/model-catalog.js").loadModelCatalog;
type RunSubagentAnnounceFlow = typeof import("../agents/subagent-announce.js").runSubagentAnnounceFlow;
type CallGateway = typeof import("../gateway/call.js").callGateway;

export const abortEmbeddedPiRunMock = vi.fn<AbortEmbeddedPiRun>().mockReturnValue(false);
export const resolveEmbeddedSessionLaneMock = vi.fn<ResolveEmbeddedSessionLane>(
  (key: string) => `session:${key.trim() || "main"}`,
);
export const runEmbeddedPiAgentMock = vi.fn<RunEmbeddedPiAgent>();
export const loadModelCatalogMock = vi.fn<LoadModelCatalog>();
export const runSubagentAnnounceFlowMock = vi.fn<RunSubagentAnnounceFlow>();
export const callGatewayMock = vi.fn<CallGateway>();

vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: abortEmbeddedPiRunMock,
  runEmbeddedPiAgent: runEmbeddedPiAgentMock,
  resolveEmbeddedSessionLane: resolveEmbeddedSessionLaneMock,
}));

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: loadModelCatalogMock,
}));

vi.mock("../agents/model-selection.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/model-selection.js")>();
  return {
    ...actual,
    isCliProvider: vi.fn(() => false),
  };
});

vi.mock("../agents/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: runSubagentAnnounceFlowMock,
}));

vi.mock("../gateway/call.js", () => ({
  callGateway: callGatewayMock,
}));

export const makeIsolatedAgentJob = makeIsolatedAgentJobFixture;
export const makeIsolatedAgentParams = makeIsolatedAgentParamsFixture;
