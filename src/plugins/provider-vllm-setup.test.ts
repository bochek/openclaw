import { describe, expect, it } from "vitest";
import { promptAndConfigureVllm } from "./provider-vllm-setup.js";

describe("promptAndConfigureVllm", () => {
  it("persists tools-disabled compat for configured models", async () => {
    const values = [
      "http://127.0.0.1:1234/v1",
      "test-key",
      "Qwen/Qwen3-8B",
    ];

    const notes: Array<{ message: string; title?: string }> = [];
    const result = await promptAndConfigureVllm({
      cfg: {},
      prompter: {
        intro: async () => {},
        outro: async () => {},
        note: async (message, title) => {
          notes.push({ message, title });
        },
        select: async () => "",
        multiselect: async () => [],
        text: async () => values.shift() ?? "",
        confirm: async () => true,
        progress: () => ({
          update: () => {},
          stop: () => {},
        }),
      },
    });

    expect(result.modelRef).toBe("vllm/Qwen/Qwen3-8B");
    expect(result.config.models?.providers?.vllm?.models?.[0]).toEqual(
      expect.objectContaining({
        id: "Qwen/Qwen3-8B",
        compat: { supportsTools: false },
      }),
    );
    expect(notes).toContainEqual(
      expect.objectContaining({
        title: "vLLM tools",
        message: expect.stringContaining(
          "Recommended: disable tools if you are unsure or having issues using openclaw config set models.providers.vllm.models[0].compat.supportsTools false --strict-json.",
        ),
      }),
    );
  });
});
