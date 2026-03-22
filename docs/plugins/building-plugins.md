---
title: "Building Plugins"
sidebarTitle: "Getting Started"
summary: "Create your first OpenClaw plugin in minutes"
read_when:
  - You want to create a new OpenClaw plugin
  - You need a quick-start for plugin development
  - You are adding a new channel, provider, tool, or other capability to OpenClaw
---

# Building Plugins

Plugins extend OpenClaw with new capabilities: channels, model providers, speech,
image generation, web search, agent tools, or any combination.

You do not need to add your plugin to the OpenClaw repository. Publish on npm
and users install with `openclaw plugins install <npm-spec>`.

## Prerequisites

- Node >= 22 and a package manager (npm or pnpm)
- Familiarity with TypeScript (ESM)
- For in-repo plugins: repository cloned and `pnpm install` done

## What kind of plugin?

| I want to add...                         | Guide                                             |
| ---------------------------------------- | ------------------------------------------------- |
| A messaging channel (Discord, IRC, etc.) | [Channel Plugins](/plugins/sdk-channel-plugins)   |
| A model provider (LLM)                   | [Provider Plugins](/plugins/sdk-provider-plugins) |
| Agent tools, hooks, or services          | Continue below                                    |

## Quick start: tool plugin

This walkthrough creates a minimal plugin that registers an agent tool. Channel
and provider plugins have dedicated guides linked above.

<Steps>
  <Step title="Create the package">

    ```
    my-plugin/
    ├── package.json
    ├── openclaw.plugin.json
    └── index.ts
    ```

    **package.json:**

    ```json
    {
      "name": "@myorg/openclaw-my-plugin",
      "version": "1.0.0",
      "type": "module",
      "openclaw": {
        "extensions": ["./index.ts"]
      }
    }
    ```

  </Step>

  <Step title="Add the manifest">
    Create `openclaw.plugin.json`:

    ```json
    {
      "id": "my-plugin",
      "name": "My Plugin",
      "description": "Adds a custom tool to OpenClaw",
      "configSchema": {
        "type": "object",
        "additionalProperties": false
      }
    }
    ```

    Every plugin needs a manifest, even with no config. See [Manifest](/plugins/manifest)
    for the full schema.

  </Step>

  <Step title="Write the entry point">

    ```typescript
    // index.ts
    import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
    import { Type } from "@sinclair/typebox";

    export default definePluginEntry({
      id: "my-plugin",
      name: "My Plugin",
      description: "Adds a custom tool to OpenClaw",
      register(api) {
        api.registerTool({
          name: "my_tool",
          description: "Do a thing",
          parameters: Type.Object({ input: Type.String() }),
          async execute(_id, params) {
            return { content: [{ type: "text", text: `Got: ${params.input}` }] };
          },
        });
      },
    });
    ```

    `definePluginEntry` is for non-channel plugins. For channels, use
    `defineChannelPluginEntry` — see [Channel Plugins](/plugins/sdk-channel-plugins).
    For full entry point options, see [Entry Points](/plugins/sdk-entrypoints).

  </Step>

  <Step title="Test and publish">

    **External plugins:**

    ```bash
    npm publish
    openclaw plugins install @myorg/openclaw-my-plugin
    ```

    **In-repo plugins:** place under `extensions/` — automatically discovered.

    ```bash
    pnpm test -- extensions/my-plugin/
    ```

  </Step>
</Steps>

## Plugin capabilities

A single plugin can register any number of capabilities via the `api` object:

| Capability           | Registration method                           | Detailed guide                                                               |
| -------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| Text inference (LLM) | `api.registerProvider(...)`                   | [Provider Plugins](/plugins/sdk-provider-plugins)                            |
| Channel / messaging  | `api.registerChannel(...)`                    | [Channel Plugins](/plugins/sdk-channel-plugins)                              |
| Speech (TTS/STT)     | `api.registerSpeechProvider(...)`             | [Provider Plugins](/plugins/sdk-provider-plugins#multi-capability-providers) |
| Media understanding  | `api.registerMediaUnderstandingProvider(...)` | [Provider Plugins](/plugins/sdk-provider-plugins#multi-capability-providers) |
| Image generation     | `api.registerImageGenerationProvider(...)`    | [Provider Plugins](/plugins/sdk-provider-plugins#multi-capability-providers) |
| Web search           | `api.registerWebSearchProvider(...)`          | [Provider Plugins](/plugins/sdk-provider-plugins#multi-capability-providers) |
| Agent tools          | `api.registerTool(...)`                       | Below                                                                        |
| Custom commands      | `api.registerCommand(...)`                    | [Entry Points](/plugins/sdk-entrypoints)                                     |
| Event hooks          | `api.registerHook(...)`                       | [Entry Points](/plugins/sdk-entrypoints)                                     |
| HTTP routes          | `api.registerHttpRoute(...)`                  | [Internals](/plugins/architecture#gateway-http-routes)                       |
| CLI subcommands      | `api.registerCli(...)`                        | [Entry Points](/plugins/sdk-entrypoints)                                     |

For the full registration API, see [SDK Overview](/plugins/sdk-overview#plugin-kinds).

## Registering agent tools

Tools are typed functions the LLM can call. They can be required (always
available) or optional (user opt-in):

```typescript
register(api) {
  // Required tool — always available
  api.registerTool({
    name: "my_tool",
    description: "Do a thing",
    parameters: Type.Object({ input: Type.String() }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: params.input }] };
    },
  });

  // Optional tool — user must add to allowlist
  api.registerTool(
    {
      name: "workflow_tool",
      description: "Run a workflow",
      parameters: Type.Object({ pipeline: Type.String() }),
      async execute(_id, params) {
        return { content: [{ type: "text", text: params.pipeline }] };
      },
    },
    { optional: true },
  );
}
```

Users enable optional tools in config:

```json5
{
  tools: { allow: ["workflow_tool"] },
}
```

- Tool names must not clash with core tools (conflicts are skipped)
- Use `optional: true` for tools with side effects or extra binary requirements
- Users can enable all tools from a plugin by adding the plugin id to `tools.allow`

## Import conventions

Always import from focused `openclaw/plugin-sdk/<subpath>` paths:

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

// Wrong: monolithic root (deprecated, will be removed)
import { ... } from "openclaw/plugin-sdk";
```

For the full subpath reference, see [SDK Overview](/plugins/sdk-overview).

Within your plugin, use local barrel files (`api.ts`, `runtime-api.ts`) for
internal imports — never import your own plugin through its SDK path.

## Pre-submission checklist

<Check>**package.json** has correct `openclaw` metadata</Check>
<Check>**openclaw.plugin.json** manifest is present and valid</Check>
<Check>Entry point uses `defineChannelPluginEntry` or `definePluginEntry`</Check>
<Check>All imports use focused `plugin-sdk/<subpath>` paths</Check>
<Check>Internal imports use local modules, not SDK self-imports</Check>
<Check>Tests pass (`pnpm test -- extensions/my-plugin/`)</Check>
<Check>`pnpm check` passes (in-repo plugins)</Check>

## Next steps

- [Channel Plugins](/plugins/sdk-channel-plugins) — build a messaging channel
- [Provider Plugins](/plugins/sdk-provider-plugins) — build a model provider
- [SDK Overview](/plugins/sdk-overview) — import map and registration API reference
- [SDK Runtime](/plugins/sdk-runtime) — `api.runtime` helpers (TTS, search, subagent)
- [SDK Setup](/plugins/sdk-setup) — packaging, manifests, setup wizards
- [SDK Testing](/plugins/sdk-testing) — test utilities and patterns
- [SDK Migration](/plugins/sdk-migration) — migrating from deprecated surfaces
- [Plugin Manifest](/plugins/manifest) — full manifest schema
- [Plugin Internals](/plugins/architecture) — deep architecture reference
- [Community Plugins](/plugins/community) — listing and quality bar
