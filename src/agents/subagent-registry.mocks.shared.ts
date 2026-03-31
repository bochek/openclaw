import { vi } from "vitest";

const noop = () => {};
export const mockCallGateway = vi.fn(async () => ({
  status: "ok",
  startedAt: 111,
  endedAt: 222,
}));

vi.mock("../gateway/call.js", () => ({
  callGateway: mockCallGateway,
}));

vi.mock("../infra/agent-events.js", () => ({
  onAgentEvent: vi.fn(() => noop),
}));
