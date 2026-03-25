import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { attachEarlyGatewayErrorGuard } from "./gateway-error-guard.js";

describe("attachEarlyGatewayErrorGuard", () => {
  it("captures gateway errors until released", () => {
    const emitter = new EventEmitter();
    const fallbackErrorListener = vi.fn();
    emitter.on("error", fallbackErrorListener);
    const client = {
      getPlugin: vi.fn(() => ({ emitter })),
    };

    const guard = attachEarlyGatewayErrorGuard(client as never);
    emitter.emit("error", new Error("Fatal Gateway error: 4014"));
    expect(guard.pendingErrors).toHaveLength(1);

    guard.release();
    emitter.emit("error", new Error("Fatal Gateway error: 4000"));
    expect(guard.pendingErrors).toHaveLength(1);
    expect(fallbackErrorListener).toHaveBeenCalledTimes(2);
  });

  it("routes active lifecycle errors through the current handler and queues late errors after clear", () => {
    const emitter = new EventEmitter();
    const fallbackErrorListener = vi.fn();
    const activeHandler = vi.fn();
    emitter.on("error", fallbackErrorListener);
    const client = {
      getPlugin: vi.fn(() => ({ emitter })),
    };

    const guard = attachEarlyGatewayErrorGuard(client as never);
    guard.setHandler(activeHandler);
    emitter.emit("error", new Error("Fatal Gateway error: 4000"));

    expect(activeHandler).toHaveBeenCalledTimes(1);
    expect(guard.pendingErrors).toHaveLength(0);
    expect(fallbackErrorListener).toHaveBeenCalledTimes(1);

    guard.setHandler(undefined);
    emitter.emit("error", new Error("Max reconnect attempts (0) reached after code 1006"));

    expect(activeHandler).toHaveBeenCalledTimes(1);
    expect(guard.pendingErrors).toHaveLength(1);
    expect(fallbackErrorListener).toHaveBeenCalledTimes(2);
  });

  it("returns noop guard when gateway emitter is unavailable", () => {
    const client = {
      getPlugin: vi.fn(() => undefined),
    };

    const guard = attachEarlyGatewayErrorGuard(client as never);
    expect(guard.pendingErrors).toEqual([]);
    expect(() => guard.setHandler(() => {})).not.toThrow();
    expect(() => guard.release()).not.toThrow();
  });
});
