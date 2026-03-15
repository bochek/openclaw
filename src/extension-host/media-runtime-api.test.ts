import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildExtensionHostMediaProviderRegistry,
  normalizeExtensionHostMediaAttachments,
  resolveExtensionHostAutoImageModel,
  resolveExtensionHostMediaAttachmentLocalRoots,
  runExtensionHostMediaApiCapability,
} from "./media-runtime-api.js";

vi.mock("./media-runtime-auto.js", () => ({
  clearMediaUnderstandingBinaryCacheForTests: vi.fn(),
  resolveAutoImageModel: vi.fn(),
}));

vi.mock("./media-runtime-orchestration.js", () => ({
  runCapability: vi.fn(),
}));

vi.mock("./media-runtime-registry.js", () => ({
  buildExtensionHostMediaUnderstandingRegistry: vi.fn(),
}));

vi.mock("../media/inbound-path-policy.js", () => ({
  mergeInboundPathRoots: vi.fn(),
  resolveIMessageAttachmentRoots: vi.fn(),
}));

vi.mock("../media/local-roots.js", () => ({
  getDefaultMediaLocalRoots: vi.fn(),
}));

vi.mock("../media-understanding/attachments.js", () => ({
  MediaAttachmentCache: class MediaAttachmentCache {
    constructor(
      readonly attachments: unknown[],
      readonly options?: unknown,
    ) {}
  },
  normalizeAttachments: vi.fn(),
}));

describe("media-runtime-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates provider-registry construction to the host-owned registry", async () => {
    const registryModule = await import("./media-runtime-registry.js");
    const registry = new Map();
    vi.mocked(registryModule.buildExtensionHostMediaUnderstandingRegistry).mockReturnValue(
      registry,
    );

    expect(buildExtensionHostMediaProviderRegistry({ openai: {} as never })).toBe(registry);
    expect(registryModule.buildExtensionHostMediaUnderstandingRegistry).toHaveBeenCalledWith({
      openai: {} as never,
    });
  });

  it("resolves local roots through the host-owned inbound-path policy", async () => {
    const localRootsModule = await import("../media/local-roots.js");
    const inboundPolicyModule = await import("../media/inbound-path-policy.js");

    vi.mocked(localRootsModule.getDefaultMediaLocalRoots).mockReturnValue(["/tmp/openclaw"]);
    vi.mocked(inboundPolicyModule.resolveIMessageAttachmentRoots).mockReturnValue(["/messages"]);
    vi.mocked(inboundPolicyModule.mergeInboundPathRoots).mockReturnValue([
      "/tmp/openclaw",
      "/messages",
    ]);

    const roots = resolveExtensionHostMediaAttachmentLocalRoots({
      cfg: { channels: { imessage: {} } } as never,
      ctx: { AccountId: "primary" } as never,
    });

    expect(roots).toEqual(["/tmp/openclaw", "/messages"]);
    expect(inboundPolicyModule.resolveIMessageAttachmentRoots).toHaveBeenCalledWith({
      cfg: { channels: { imessage: {} } },
      accountId: "primary",
    });
  });

  it("injects the default registry when resolving the auto image model", async () => {
    const registryModule = await import("./media-runtime-registry.js");
    const autoModule = await import("./media-runtime-auto.js");
    const registry = new Map();

    vi.mocked(registryModule.buildExtensionHostMediaUnderstandingRegistry).mockReturnValue(
      registry,
    );
    vi.mocked(autoModule.resolveAutoImageModel).mockResolvedValue({
      provider: "openai",
      model: "gpt-4.1",
    });

    await expect(
      resolveExtensionHostAutoImageModel({
        cfg: {} as never,
      }),
    ).resolves.toEqual({
      provider: "openai",
      model: "gpt-4.1",
    });

    expect(autoModule.resolveAutoImageModel).toHaveBeenCalledWith({
      cfg: {},
      providerRegistry: registry,
    });
  });

  it("delegates top-level capability execution to the host-owned orchestration", async () => {
    const orchestrationModule = await import("./media-runtime-orchestration.js");
    const attachments = { cleanup: vi.fn() } as never;
    const media = [{ kind: "image" }] as never;
    const providerRegistry = new Map() as never;
    const result = { outputs: [], decision: { capability: "image", outcome: "skipped" } } as never;

    vi.mocked(orchestrationModule.runCapability).mockResolvedValue(result);

    await expect(
      runExtensionHostMediaApiCapability({
        capability: "image",
        cfg: {} as never,
        ctx: {} as never,
        attachments,
        media,
        providerRegistry,
      }),
    ).resolves.toBe(result);
  });

  it("delegates attachment normalization to the shared media attachment helper", async () => {
    const attachmentsModule = await import("../media-understanding/attachments.js");
    vi.mocked(attachmentsModule.normalizeAttachments).mockReturnValue([{ kind: "audio" }] as never);

    expect(normalizeExtensionHostMediaAttachments({ MediaPath: "/tmp/test.wav" } as never)).toEqual(
      [{ kind: "audio" }],
    );
  });
});
