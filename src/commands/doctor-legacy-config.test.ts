import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { normalizeCompatibilityConfigValues } from "./doctor-legacy-config.js";

describe("normalizeCompatibilityConfigValues preview streaming aliases", () => {
  it("normalizes telegram boolean streaming aliases to enum", () => {
    const res = normalizeCompatibilityConfigValues({
      channels: {
        telegram: {
          streaming: false,
        },
      },
    } as unknown as OpenClawConfig);

    expect(res.config.channels?.telegram?.streaming).toBe("off");
    expect(
      (res.config.channels?.telegram as Record<string, unknown> | undefined)?.streamMode,
    ).toBeUndefined();
    expect(res.changes).toEqual(["Normalized channels.telegram.streaming boolean → enum (off)."]);
  });

  it("normalizes discord boolean streaming aliases to enum", () => {
    const res = normalizeCompatibilityConfigValues({
      channels: {
        discord: {
          streaming: true,
        },
      },
    } as unknown as OpenClawConfig);

    expect(res.config.channels?.discord?.streaming).toBe("partial");
    expect(
      (res.config.channels?.discord as Record<string, unknown> | undefined)?.streamMode,
    ).toBeUndefined();
    expect(res.changes).toEqual([
      "Normalized channels.discord.streaming boolean → enum (partial).",
    ]);
  });

  it("does not label explicit discord streaming=false as a default-off case", () => {
    const res = normalizeCompatibilityConfigValues({
      channels: {
        discord: {
          streaming: false,
        },
      },
    } as unknown as OpenClawConfig);

    expect(res.config.channels?.discord?.streaming).toBe("off");
    expect(
      (res.config.channels?.discord as Record<string, unknown> | undefined)?.streamMode,
    ).toBeUndefined();
    expect(res.changes).toEqual(["Normalized channels.discord.streaming boolean → enum (off)."]);
  });

  it("explains why discord preview streaming stays off when legacy config resolves to off", () => {
    const res = normalizeCompatibilityConfigValues({
      channels: {
        discord: {
          streamMode: "off",
        },
      },
    } as unknown as OpenClawConfig);

    expect(res.config.channels?.discord?.streaming).toBe("off");
    expect(
      (res.config.channels?.discord as Record<string, unknown> | undefined)?.streamMode,
    ).toBeUndefined();
    expect(res.changes).toEqual([
      "Moved channels.discord.streamMode → channels.discord.streaming (off).",
      'channels.discord.streaming remains off by default to avoid Discord preview-edit rate limits; set channels.discord.streaming="partial" to opt in explicitly.',
    ]);
  });

  it("normalizes slack boolean streaming aliases to enum and native streaming", () => {
    const res = normalizeCompatibilityConfigValues({
      channels: {
        slack: {
          streaming: false,
        },
      },
    } as unknown as OpenClawConfig);

    expect(res.config.channels?.slack?.streaming).toBe("off");
    expect(res.config.channels?.slack?.nativeStreaming).toBe(false);
    expect(
      (res.config.channels?.slack as Record<string, unknown> | undefined)?.streamMode,
    ).toBeUndefined();
    expect(res.changes).toEqual([
      "Moved channels.slack.streaming (boolean) → channels.slack.nativeStreaming (false).",
    ]);
  });
});
