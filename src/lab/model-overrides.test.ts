import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import { makeTempWorkspace } from "../test-helpers/workspace.js";
import {
  appendLabsAgentsOverrideFiles,
  hasTruncatedLabsAgentsOverrideFiles,
  isLabsModelOverridesEnabled,
  listActiveLabsAgentsOverridePaths,
  loadLabsAgentsOverrides,
  resolveLabsAgentAgentsOverridePath,
  resolveLabsModelAgentsOverridePath,
} from "./model-overrides.js";

describe("lab model overrides", () => {
  it("loads model and agent AGENTS addenda only when the Lab feature is enabled", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-lab-");
    const modelOverridePath = resolveLabsModelAgentsOverridePath(workspaceDir, "gpt-5.4");
    const agentOverridePath = resolveLabsAgentAgentsOverridePath(
      workspaceDir,
      "reviewer",
      "gpt-5.4",
    );
    await fs.mkdir(path.dirname(modelOverridePath), { recursive: true });
    await fs.mkdir(path.dirname(agentOverridePath), { recursive: true });
    await fs.writeFile(modelOverridePath, "gpt-5.4 guidance", "utf8");
    await fs.writeFile(agentOverridePath, "reviewer guidance", "utf8");

    expect(
      isLabsModelOverridesEnabled({
        plugins: {
          entries: {
            lab: {
              enabled: true,
              config: {
                modelOverrides: {
                  enabled: true,
                },
              },
            },
          },
        },
      }),
    ).toBe(true);

    await expect(
      loadLabsAgentsOverrides({
        workspaceDir,
        modelId: "gpt-5.4",
        agentId: "reviewer",
        cfg: {
          plugins: {
            entries: {
              lab: {
                enabled: true,
                config: {
                  modelOverrides: {
                    enabled: true,
                  },
                },
              },
            },
          },
        },
      }),
    ).resolves.toMatchObject([
      {
        name: "AGENTS.md",
        path: modelOverridePath,
        content: "gpt-5.4 guidance",
        missing: false,
        labsKind: "model",
      },
      {
        name: "AGENTS.md",
        path: agentOverridePath,
        content: "reviewer guidance",
        missing: false,
        labsKind: "agent",
      },
    ]);

    await expect(
      loadLabsAgentsOverrides({
        workspaceDir,
        modelId: "gpt-5.4",
        agentId: "reviewer",
        cfg: {
          plugins: {
            entries: {
              lab: {
                enabled: true,
                config: {
                  modelOverrides: {
                    enabled: false,
                  },
                },
              },
            },
          },
        },
      }),
    ).resolves.toEqual([]);
  });

  it("keeps Lab addenda separate and inserts model then agent before the root AGENTS.md", () => {
    const files = appendLabsAgentsOverrideFiles({
      files: [
        { name: "AGENTS.md", path: "/tmp/workspace/AGENTS.md", content: "base", missing: false },
        { name: "USER.md", path: "/tmp/workspace/USER.md", content: "user", missing: false },
      ],
      overrideFiles: [
        {
          name: "AGENTS.md",
          path: "/tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md",
          content: "lab",
          missing: false,
        },
        {
          name: "AGENTS.md",
          path: "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
          content: "reviewer",
          missing: false,
        },
      ],
    });

    expect(files.map((file) => file.path)).toEqual([
      "/tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md",
      "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
      "/tmp/workspace/AGENTS.md",
      "/tmp/workspace/USER.md",
    ]);
  });

  it("lists active override paths in model then agent precedence order", () => {
    expect(
      listActiveLabsAgentsOverridePaths({
        workspaceDir: "/tmp/workspace",
        modelId: "gpt-5.4",
        agentId: "reviewer",
      }),
    ).toEqual([
      "/tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md",
      "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
    ]);
  });

  it("detects truncation for Lab AGENTS addenda by explicit paths or Lab pattern", () => {
    const report: SessionSystemPromptReport = {
      source: "run",
      generatedAt: Date.now(),
      systemPrompt: {
        chars: 100,
        projectContextChars: 60,
        nonProjectContextChars: 40,
      },
      injectedWorkspaceFiles: [
        {
          name: "AGENTS.md",
          path: "/tmp/workspace/AGENTS.md",
          missing: false,
          rawChars: 50,
          injectedChars: 50,
          truncated: false,
        },
        {
          name: "AGENTS.md",
          path: "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
          missing: false,
          rawChars: 500,
          injectedChars: 120,
          truncated: true,
        },
      ],
      skills: { promptChars: 0, entries: [] },
      tools: { listChars: 0, schemaChars: 0, entries: [] },
    };

    expect(
      hasTruncatedLabsAgentsOverrideFiles(report, [
        "/tmp/workspace/.openclaw/lab/overrides/gpt-5.4/AGENTS.md",
        "/tmp/workspace/.openclaw/lab/agents/reviewer/overrides/gpt-5.4/AGENTS.md",
      ]),
    ).toBe(true);
    expect(hasTruncatedLabsAgentsOverrideFiles(report)).toBe(true);
  });
});
