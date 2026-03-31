import { beforeEach, describe, expect, it, vi } from "vitest";
import { __testing as snapshotTesting, resolveTargetIdAfterNavigate } from "./agent.snapshot.js";

type Tab = { targetId: string; url: string };

function staticListTabs(tabs: Tab[]): () => Promise<Tab[]> {
  return async () => tabs;
}

describe("resolveTargetIdAfterNavigate", () => {
  beforeEach(() => {
    vi.useRealTimers();
    snapshotTesting.resetDepsForTest();
    snapshotTesting.setDepsForTest({
      retryDelayMs: 1,
    });
  });

  it("returns original targetId when old target still exists (no swap)", async () => {
    const result = await resolveTargetIdAfterNavigate({
      oldTargetId: "old-123",
      navigatedUrl: "https://example.com",
      listTabs: staticListTabs([
        { targetId: "old-123", url: "https://example.com" },
        { targetId: "other-456", url: "https://other.com" },
      ]),
    });
    expect(result).toBe("old-123");
  });

  it("resolves new targetId when old target is gone (renderer swap)", async () => {
    const result = await resolveTargetIdAfterNavigate({
      oldTargetId: "old-123",
      navigatedUrl: "https://example.com",
      listTabs: staticListTabs([{ targetId: "new-456", url: "https://example.com" }]),
    });
    expect(result).toBe("new-456");
  });

  it("prefers non-stale targetId when multiple tabs share the URL", async () => {
    const result = await resolveTargetIdAfterNavigate({
      oldTargetId: "old-123",
      navigatedUrl: "https://example.com",
      listTabs: staticListTabs([
        { targetId: "preexisting-000", url: "https://example.com" },
        { targetId: "fresh-777", url: "https://example.com" },
      ]),
    });
    // Ambiguous replacement; prefer staying on the old target rather than guessing wrong.
    expect(result).toBe("old-123");
  });

  it("retries and resolves targetId when first listTabs has no URL match", async () => {
    let calls = 0;

    const result = await resolveTargetIdAfterNavigate({
      oldTargetId: "old-123",
      navigatedUrl: "https://delayed.com",
      listTabs: async () => {
        calls++;
        if (calls === 1) {
          return [{ targetId: "unrelated-1", url: "https://unrelated.com" }];
        }
        return [{ targetId: "delayed-999", url: "https://delayed.com" }];
      },
    });

    expect(result).toBe("delayed-999");
    expect(calls).toBe(2);
  });

  it("falls back to original targetId when no match found after retry", async () => {
    const result = await resolveTargetIdAfterNavigate({
      oldTargetId: "old-123",
      navigatedUrl: "https://no-match.com",
      listTabs: staticListTabs([
        { targetId: "unrelated-1", url: "https://unrelated.com" },
        { targetId: "unrelated-2", url: "https://unrelated2.com" },
      ]),
    });

    expect(result).toBe("old-123");
  });

  it("falls back to single remaining tab when no URL match after retry", async () => {
    const result = await resolveTargetIdAfterNavigate({
      oldTargetId: "old-123",
      navigatedUrl: "https://single-tab.com",
      listTabs: staticListTabs([{ targetId: "only-tab", url: "https://some-other.com" }]),
    });

    expect(result).toBe("only-tab");
  });

  it("falls back to original targetId when listTabs throws", async () => {
    const result = await resolveTargetIdAfterNavigate({
      oldTargetId: "old-123",
      navigatedUrl: "https://error.com",
      listTabs: async () => {
        throw new Error("CDP connection lost");
      },
    });
    expect(result).toBe("old-123");
  });

  it("keeps the old target when multiple replacement candidates still match after retry", async () => {
    const result = await resolveTargetIdAfterNavigate({
      oldTargetId: "old-123",
      navigatedUrl: "https://example.com",
      listTabs: staticListTabs([
        { targetId: "preexisting-000", url: "https://example.com" },
        { targetId: "fresh-777", url: "https://example.com" },
      ]),
    });

    expect(result).toBe("old-123");
  });
});
