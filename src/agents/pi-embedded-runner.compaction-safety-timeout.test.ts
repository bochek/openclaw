import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compactWithSafetyTimeout,
  EMBEDDED_COMPACTION_TIMEOUT_MS,
  resolveCompactionTimeoutMs,
} from "./pi-embedded-runner/compaction-safety-timeout.js";

describe("compactWithSafetyTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects with timeout when compaction never settles", async () => {
    await expect(
      compactWithSafetyTimeout(() => new Promise<never>(() => {}), 20),
    ).rejects.toThrow("Compaction timed out");
  });

  it("returns result and clears timer when compaction settles first", async () => {
    await expect(
      compactWithSafetyTimeout(
        () => new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 10)),
        30,
      ),
    ).resolves.toBe("ok");
  });

  it("preserves compaction errors and clears timer", async () => {
    const error = new Error("provider exploded");

    await expect(
      compactWithSafetyTimeout(async () => {
        throw error;
      }, 30),
    ).rejects.toBe(error);
  });

  it("calls onCancel when compaction times out", async () => {
    const onCancel = vi.fn();

    await expect(
      compactWithSafetyTimeout(() => new Promise<never>(() => {}), 20, {
        onCancel,
      }),
    ).rejects.toThrow("Compaction timed out");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("aborts early on external abort signal and calls onCancel once", async () => {
    const controller = new AbortController();
    const onCancel = vi.fn();
    const reason = new Error("request timed out");

    const compactPromise = compactWithSafetyTimeout(() => new Promise<never>(() => {}), 10_000, {
      abortSignal: controller.signal,
      onCancel,
    });

    setTimeout(() => controller.abort(reason), 0);
    await expect(compactPromise).rejects.toBe(reason);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ignores onCancel errors and still rejects with the timeout", async () => {
    await expect(
      compactWithSafetyTimeout(() => new Promise<never>(() => {}), 20, {
        onCancel: () => {
          throw new Error("abortCompaction failed");
        },
      }),
    ).rejects.toThrow("Compaction timed out");
  });
});

describe("resolveCompactionTimeoutMs", () => {
  it("returns default when config is undefined", () => {
    expect(resolveCompactionTimeoutMs(undefined)).toBe(EMBEDDED_COMPACTION_TIMEOUT_MS);
  });

  it("returns default when compaction config is missing", () => {
    expect(resolveCompactionTimeoutMs({ agents: { defaults: {} } })).toBe(
      EMBEDDED_COMPACTION_TIMEOUT_MS,
    );
  });

  it("returns default when timeoutSeconds is not set", () => {
    expect(
      resolveCompactionTimeoutMs({ agents: { defaults: { compaction: { mode: "safeguard" } } } }),
    ).toBe(EMBEDDED_COMPACTION_TIMEOUT_MS);
  });

  it("converts timeoutSeconds to milliseconds", () => {
    expect(
      resolveCompactionTimeoutMs({
        agents: { defaults: { compaction: { timeoutSeconds: 1800 } } },
      }),
    ).toBe(1_800_000);
  });

  it("floors fractional seconds", () => {
    expect(
      resolveCompactionTimeoutMs({
        agents: { defaults: { compaction: { timeoutSeconds: 120.7 } } },
      }),
    ).toBe(120_000);
  });

  it("returns default for zero", () => {
    expect(
      resolveCompactionTimeoutMs({ agents: { defaults: { compaction: { timeoutSeconds: 0 } } } }),
    ).toBe(EMBEDDED_COMPACTION_TIMEOUT_MS);
  });

  it("returns default for negative values", () => {
    expect(
      resolveCompactionTimeoutMs({ agents: { defaults: { compaction: { timeoutSeconds: -5 } } } }),
    ).toBe(EMBEDDED_COMPACTION_TIMEOUT_MS);
  });

  it("returns default for NaN", () => {
    expect(
      resolveCompactionTimeoutMs({
        agents: { defaults: { compaction: { timeoutSeconds: NaN } } },
      }),
    ).toBe(EMBEDDED_COMPACTION_TIMEOUT_MS);
  });

  it("returns default for Infinity", () => {
    expect(
      resolveCompactionTimeoutMs({
        agents: { defaults: { compaction: { timeoutSeconds: Infinity } } },
      }),
    ).toBe(EMBEDDED_COMPACTION_TIMEOUT_MS);
  });
});
