import { describe, expect, it, vi } from "vitest";
import type { ProviderPlugin } from "../plugins/types.js";
import {
  buildExtensionHostProviderMethodChoice,
  resolveExtensionHostProviderChoice,
  resolveExtensionHostProviderModelPickerEntries,
  resolveExtensionHostProviderWizardOptions,
} from "./provider-wizard.js";

function makeProvider(overrides: Partial<ProviderPlugin> & Pick<ProviderPlugin, "id" | "label">) {
  return {
    auth: [],
    ...overrides,
  } satisfies ProviderPlugin;
}

describe("resolveExtensionHostProviderWizardOptions", () => {
  it("uses explicit onboarding choice ids and bound method ids", () => {
    const provider = makeProvider({
      id: "vllm",
      label: "vLLM",
      auth: [
        { id: "local", label: "Local", kind: "custom", run: vi.fn() },
        { id: "cloud", label: "Cloud", kind: "custom", run: vi.fn() },
      ],
      wizard: {
        onboarding: {
          choiceId: "self-hosted-vllm",
          methodId: "local",
          choiceLabel: "vLLM local",
          groupId: "local-runtimes",
          groupLabel: "Local runtimes",
        },
      },
    });

    expect(resolveExtensionHostProviderWizardOptions([provider])).toEqual([
      {
        value: "self-hosted-vllm",
        label: "vLLM local",
        groupId: "local-runtimes",
        groupLabel: "Local runtimes",
      },
    ]);
    expect(
      resolveExtensionHostProviderChoice({
        providers: [provider],
        choice: "self-hosted-vllm",
      }),
    ).toEqual({
      provider,
      method: provider.auth[0],
    });
  });
});

describe("resolveExtensionHostProviderModelPickerEntries", () => {
  it("builds model-picker entries from provider metadata", () => {
    const provider = makeProvider({
      id: "sglang",
      label: "SGLang",
      auth: [
        { id: "server", label: "Server", kind: "custom", run: vi.fn() },
        { id: "cloud", label: "Cloud", kind: "custom", run: vi.fn() },
      ],
      wizard: {
        modelPicker: {
          label: "SGLang server",
          hint: "OpenAI-compatible local runtime",
          methodId: "server",
        },
      },
    });

    expect(resolveExtensionHostProviderModelPickerEntries([provider])).toEqual([
      {
        value: buildExtensionHostProviderMethodChoice("sglang", "server"),
        label: "SGLang server",
        hint: "OpenAI-compatible local runtime",
      },
    ]);
  });
});
