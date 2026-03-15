import { describe, expect, it } from "vitest";
import type { ContextEngine } from "../../context-engine/types.js";
import {
  getExtensionHostContextEngineFactory,
  listExtensionHostContextEngineIds,
  registerExtensionHostContextEngine,
} from "./context-engine-runtime.js";

class TestContextEngine implements ContextEngine {
  readonly info = {
    id: "host-test",
    name: "Host Test",
    version: "1.0.0",
  };

  async ingest() {
    return { ingested: false };
  }

  async assemble(params: { messages: [] }) {
    return { messages: params.messages, estimatedTokens: 0 };
  }

  async afterTurn() {}

  async compact() {
    return { ok: true, compacted: false, reason: "noop" };
  }
}

describe("extension host context engine runtime", () => {
  it("stores registered context-engine factories in the host-owned runtime", async () => {
    const factory = () => new TestContextEngine();
    registerExtensionHostContextEngine("host-test", factory);

    expect(getExtensionHostContextEngineFactory("host-test")).toBe(factory);
    expect(listExtensionHostContextEngineIds()).toContain("host-test");
    expect(await getExtensionHostContextEngineFactory("host-test")?.()).toBeInstanceOf(
      TestContextEngine,
    );
  });
});
