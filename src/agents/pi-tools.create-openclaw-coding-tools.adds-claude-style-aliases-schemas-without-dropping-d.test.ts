import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { afterEach, describe, expect, it } from "vitest";
import "./test-helpers/fast-coding-tools.js";
import { createOpenClawCodingTools } from "./pi-tools.js";
import { __testing as piToolsReadTesting } from "./pi-tools.read.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { createHostSandboxFsBridge } from "./test-helpers/host-sandbox-fs-bridge.js";
import { createPiToolsSandboxContext } from "./test-helpers/pi-tools-sandbox-context.js";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2f7z8AAAAASUVORK5CYII=";
const tinyPngBuffer = Buffer.from(TINY_PNG_BASE64, "base64");

afterEach(() => {
  piToolsReadTesting.setDepsForTest();
});

describe("createOpenClawCodingTools", () => {
  it("returns image metadata for images and text-only blocks for text files", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-"));
    try {
      piToolsReadTesting.setDepsForTest({
        createReadTool: () =>
          ({
            name: "read",
            label: "read",
            description: "test read tool",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string" },
              },
              required: ["path"],
            },
            execute: async (_toolCallId, args) => {
              const filePath =
                args && typeof args === "object" && typeof args.path === "string" ? args.path : "";
              if (filePath.endsWith(".png")) {
                return {
                  content: [
                    { type: "text", text: "Read image file [image/png]" },
                    { type: "image", data: TINY_PNG_BASE64, mimeType: "image/png" },
                  ],
                } satisfies AgentToolResult<unknown>;
              }
              const contents = await fs.readFile(filePath, "utf8");
              return {
                content: [{ type: "text", text: contents }],
              } satisfies AgentToolResult<unknown>;
            },
          }) satisfies AnyAgentTool,
      });
      const sandbox = createPiToolsSandboxContext({
        workspaceDir: tmpDir,
        agentWorkspaceDir: tmpDir,
        workspaceAccess: "rw",
        fsBridge: createHostSandboxFsBridge(tmpDir),
        tools: {
          allow: ["read"],
          deny: [],
        },
      });
      const readTool = createOpenClawCodingTools({ sandbox }).find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      const imagePath = path.join(tmpDir, "sample.png");
      await fs.writeFile(imagePath, tinyPngBuffer);

      const imageResult = await readTool?.execute("tool-1", {
        path: imagePath,
      });

      expect(imageResult?.content?.some((block) => block.type === "image")).toBe(true);
      const imageText = imageResult?.content?.find((block) => block.type === "text") as
        | { text?: string }
        | undefined;
      expect(imageText?.text ?? "").toContain("Read image file [image/png]");
      const image = imageResult?.content?.find((block) => block.type === "image") as
        | { mimeType?: string }
        | undefined;
      expect(image?.mimeType).toBe("image/png");

      const textPath = path.join(tmpDir, "sample.txt");
      const contents = "Hello from openclaw read tool.";
      await fs.writeFile(textPath, contents, "utf8");

      const textResult = await readTool?.execute("tool-2", {
        path: textPath,
      });

      expect(textResult?.content?.some((block) => block.type === "image")).toBe(false);
      const textBlocks = textResult?.content?.filter((block) => block.type === "text") as
        | Array<{ text?: string }>
        | undefined;
      expect(textBlocks?.length ?? 0).toBeGreaterThan(0);
      const combinedText = textBlocks?.map((block) => block.text ?? "").join("\n");
      expect(combinedText).toContain(contents);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
  it("filters tools by sandbox policy", () => {
    const sandboxDir = path.join(os.tmpdir(), "moltbot-sandbox");
    const sandbox = createPiToolsSandboxContext({
      workspaceDir: sandboxDir,
      agentWorkspaceDir: path.join(os.tmpdir(), "moltbot-workspace"),
      workspaceAccess: "none" as const,
      fsBridge: createHostSandboxFsBridge(sandboxDir),
      tools: {
        allow: ["bash"],
        deny: ["browser"],
      },
    });
    const tools = createOpenClawCodingTools({ sandbox });
    expect(tools.some((tool) => tool.name === "exec")).toBe(true);
    expect(tools.some((tool) => tool.name === "read")).toBe(false);
    expect(tools.some((tool) => tool.name === "browser")).toBe(false);
  });
  it("hard-disables write/edit when sandbox workspaceAccess is ro", () => {
    const sandboxDir = path.join(os.tmpdir(), "moltbot-sandbox");
    const sandbox = createPiToolsSandboxContext({
      workspaceDir: sandboxDir,
      agentWorkspaceDir: path.join(os.tmpdir(), "moltbot-workspace"),
      workspaceAccess: "ro" as const,
      fsBridge: createHostSandboxFsBridge(sandboxDir),
      tools: {
        allow: ["read", "write", "edit"],
        deny: [],
      },
    });
    const tools = createOpenClawCodingTools({ sandbox });
    expect(tools.some((tool) => tool.name === "read")).toBe(true);
    expect(tools.some((tool) => tool.name === "write")).toBe(false);
    expect(tools.some((tool) => tool.name === "edit")).toBe(false);
  });
});
