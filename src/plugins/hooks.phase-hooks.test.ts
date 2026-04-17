import { beforeEach, describe, expect, it } from "vitest";
import { createHookRunner } from "./hooks.js";
import { addStaticTestHooks } from "./hooks.test-helpers.js";
import { createEmptyPluginRegistry, type PluginRegistry } from "./registry.js";
import type {
  PluginHookBeforeModelResolveResult,
  PluginHookBeforePromptChannelsResult,
  PluginHookBeforePromptBuildResult,
} from "./types.js";

describe("phase hooks merger", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = createEmptyPluginRegistry();
  });

  async function runPhaseHook(params: {
    hookName: "before_model_resolve" | "before_prompt_channels" | "before_prompt_build";
    hooks: ReadonlyArray<{
      pluginId: string;
      result:
        | PluginHookBeforeModelResolveResult
        | PluginHookBeforePromptChannelsResult
        | PluginHookBeforePromptBuildResult;
      priority?: number;
    }>;
  }) {
    addStaticTestHooks(registry, {
      hookName: params.hookName,
      hooks: [...params.hooks],
    });
    const runner = createHookRunner(registry);
    if (params.hookName === "before_model_resolve") {
      return await runner.runBeforeModelResolve({ prompt: "test" }, {});
    }
    if (params.hookName === "before_prompt_channels") {
      return await runner.runBeforePromptChannels(
        {
          prompt: "test",
          promptMode: "full",
          contextFiles: [],
          toolNames: [],
          includeMemorySection: true,
        },
        {},
      );
    }
    return await runner.runBeforePromptBuild({ prompt: "test", messages: [] }, {});
  }

  async function expectPhaseHookMerge(params: {
    hookName: "before_model_resolve" | "before_prompt_channels" | "before_prompt_build";
    hooks: ReadonlyArray<{
      pluginId: string;
      result:
        | PluginHookBeforeModelResolveResult
        | PluginHookBeforePromptChannelsResult
        | PluginHookBeforePromptBuildResult;
      priority?: number;
    }>;
    expected: Record<string, unknown>;
  }) {
    const result = await runPhaseHook(params);
    expect(result).toEqual(expect.objectContaining(params.expected));
  }

  it.each([
    {
      name: "before_model_resolve keeps higher-priority override values",
      hookName: "before_model_resolve" as const,
      hooks: [
        { pluginId: "low", result: { modelOverride: "demo-low-priority-model" }, priority: 1 },
        {
          pluginId: "high",
          result: {
            modelOverride: "demo-high-priority-model",
            providerOverride: "demo-provider",
          },
          priority: 10,
        },
      ],
      expected: {
        modelOverride: "demo-high-priority-model",
        providerOverride: "demo-provider",
      },
    },
    {
      name: "before_prompt_channels concatenates additions and preserves first route winner",
      hookName: "before_prompt_channels" as const,
      hooks: [
        {
          pluginId: "high",
          result: {
            systemAdditions: "system A",
            developerAdditions: "developer A",
            userAdditions: "user A",
            memorySectionTarget: "user",
            contextFileRoutes: {
              "AGENTS.md": "developer",
            },
          },
          priority: 10,
        },
        {
          pluginId: "low",
          result: {
            systemAdditions: "system B",
            developerAdditions: "developer B",
            userAdditions: "user B",
            memorySectionTarget: "system",
            contextFileRoutes: {
              "AGENTS.md": "user",
              "MEMORY.md": "user",
            },
          },
          priority: 1,
        },
      ],
      expected: {
        systemAdditions: "system A\n\nsystem B",
        developerAdditions: "developer A\n\ndeveloper B",
        userAdditions: "user A\n\nuser B",
        memorySectionTarget: "user",
        contextFileRoutes: {
          "AGENTS.md": "developer",
          "MEMORY.md": "user",
        },
      },
    },
    {
      name: "before_prompt_build concatenates prependContext and preserves systemPrompt precedence",
      hookName: "before_prompt_build" as const,
      hooks: [
        {
          pluginId: "high",
          result: { prependContext: "context A", systemPrompt: "system A" },
          priority: 10,
        },
        {
          pluginId: "low",
          result: { prependContext: "context B", systemPrompt: "system B" },
          priority: 1,
        },
      ],
      expected: {
        prependContext: "context A\n\ncontext B",
        systemPrompt: "system A",
      },
    },
    {
      name: "before_prompt_build concatenates prependSystemContext and appendSystemContext",
      hookName: "before_prompt_build" as const,
      hooks: [
        {
          pluginId: "first",
          result: {
            prependSystemContext: "prepend A",
            appendSystemContext: "append A",
          },
          priority: 10,
        },
        {
          pluginId: "second",
          result: {
            prependSystemContext: "prepend B",
            appendSystemContext: "append B",
          },
          priority: 1,
        },
      ],
      expected: {
        prependSystemContext: "prepend A\n\nprepend B",
        appendSystemContext: "append A\n\nappend B",
      },
    },
  ] as const)("$name", async ({ hookName, hooks, expected }) => {
    await expectPhaseHookMerge({ hookName, hooks, expected });
  });
});
