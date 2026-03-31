import { beforeEach, describe, expect, it } from "vitest";
import { __testing, createOpenClawTools } from "./openclaw-tools.js";
import { stubTool } from "./test-helpers/fast-tool-stubs.js";

function readToolByName() {
  return new Map(createOpenClawTools({ config: {} as never }).map((tool) => [tool.name, tool]));
}

describe("createOpenClawTools owner authorization", () => {
  beforeEach(() => {
    __testing.setDepsForTest({
      createCanvasTool: () => stubTool("canvas"),
      resolvePluginTools: () => [],
    });
  });

  it("marks owner-only core tools in raw registration", () => {
    const tools = readToolByName();
    expect(tools.get("cron")?.ownerOnly).toBe(true);
    expect(tools.get("gateway")?.ownerOnly).toBe(true);
    expect(tools.get("nodes")?.ownerOnly).toBe(true);
  });

  it("keeps canvas non-owner-only in raw registration", () => {
    const tools = readToolByName();
    expect(tools.get("canvas")).toBeDefined();
    expect(tools.get("canvas")?.ownerOnly).not.toBe(true);
  });
});
