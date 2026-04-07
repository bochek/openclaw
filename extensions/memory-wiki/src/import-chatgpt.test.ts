import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChatGptExportFile } from "./import-chatgpt.js";
import { createMemoryWikiTestHarness } from "./test-helpers.js";

const { createTempDir } = createMemoryWikiTestHarness();

describe("parseChatGptExportFile", () => {
  it("parses conversation arrays into transcript artifacts", async () => {
    const dir = await createTempDir("memory-wiki-chatgpt-export-");
    const exportPath = path.join(dir, "chatgpt-export.json");
    await fs.writeFile(
      exportPath,
      JSON.stringify([
        {
          id: "conv-alpha",
          title: "Alpha thread",
          create_time: 1_710_000_000,
          update_time: 1_710_000_100,
          mapping: {
            "2": {
              message: {
                author: { role: "assistant" },
                create_time: 1_710_000_020,
                content: { parts: ["hi there"] },
              },
            },
            "1": {
              message: {
                author: { role: "user" },
                create_time: 1_710_000_010,
                content: { parts: ["hello alpha"] },
              },
            },
          },
        },
      ]),
      "utf8",
    );

    const conversations = await parseChatGptExportFile(exportPath);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      conversationId: "conv-alpha",
      title: "Alpha thread",
      relativePath: expect.stringMatching(/^alpha-thread-/),
      messageCount: 2,
      participantRoles: ["assistant", "user"],
    });
    expect(conversations[0]?.transcriptBody).toContain("### User");
    expect(conversations[0]?.transcriptBody).toContain("hello alpha");
    expect(conversations[0]?.transcriptBody).toContain("### Assistant");
    expect(conversations[0]?.transcriptBody).toContain("hi there");
  });

  it("parses conversations envelopes", async () => {
    const dir = await createTempDir("memory-wiki-chatgpt-envelope-");
    const exportPath = path.join(dir, "export.json");
    await fs.writeFile(
      exportPath,
      JSON.stringify({
        conversations: [
          {
            conversation_id: "conv-envelope",
            title: "Envelope thread",
            mapping: {
              root: {
                message: {
                  author: { role: "user" },
                  content: { parts: ["hello from envelope"] },
                },
              },
            },
          },
        ],
      }),
      "utf8",
    );

    const conversations = await parseChatGptExportFile(exportPath);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      conversationId: "conv-envelope",
      title: "Envelope thread",
      messageCount: 1,
    });
  });

  it("prefers the current_node branch instead of flattening alternate branches", async () => {
    const dir = await createTempDir("memory-wiki-chatgpt-branch-");
    const exportPath = path.join(dir, "export.json");
    await fs.writeFile(
      exportPath,
      JSON.stringify([
        {
          id: "conv-branch",
          title: "Branch thread",
          current_node: "assistant-good",
          mapping: {
            user: {
              parent: null,
              message: {
                author: { role: "user" },
                create_time: 1_710_000_010,
                content: { parts: ["pick the right branch"] },
              },
            },
            "assistant-bad": {
              parent: "user",
              message: {
                author: { role: "assistant" },
                create_time: 1_710_000_020,
                content: { parts: ["wrong branch answer"] },
              },
            },
            "assistant-good": {
              parent: "user",
              message: {
                author: { role: "assistant" },
                create_time: 1_710_000_030,
                content: { parts: ["correct branch answer"] },
              },
            },
          },
        },
      ]),
      "utf8",
    );

    const conversations = await parseChatGptExportFile(exportPath);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      conversationId: "conv-branch",
      messageCount: 2,
    });
    expect(conversations[0]?.transcriptBody).toContain("pick the right branch");
    expect(conversations[0]?.transcriptBody).toContain("correct branch answer");
    expect(conversations[0]?.transcriptBody).not.toContain("wrong branch answer");
  });

  it("extracts readable text from object-shaped content parts", async () => {
    const dir = await createTempDir("memory-wiki-chatgpt-rich-parts-");
    const exportPath = path.join(dir, "export.json");
    await fs.writeFile(
      exportPath,
      JSON.stringify([
        {
          id: "conv-rich",
          title: "Rich parts thread",
          mapping: {
            root: {
              message: {
                author: { role: "assistant" },
                content: {
                  parts: [
                    { text: "first rich paragraph" },
                    { content: { text: "second rich paragraph" } },
                  ],
                },
              },
            },
          },
        },
      ]),
      "utf8",
    );

    const conversations = await parseChatGptExportFile(exportPath);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.transcriptBody).toContain("first rich paragraph");
    expect(conversations[0]?.transcriptBody).toContain("second rich paragraph");
  });

  it("preserves lineage order when current_node messages have missing timestamps", async () => {
    const dir = await createTempDir("memory-wiki-chatgpt-no-times-");
    const exportPath = path.join(dir, "export.json");
    await fs.writeFile(
      exportPath,
      JSON.stringify([
        {
          id: "conv-no-times",
          title: "No times thread",
          current_node: "assistant-final",
          mapping: {
            user: {
              parent: null,
              message: {
                author: { role: "user" },
                content: { parts: ["first turn"] },
              },
            },
            "assistant-final": {
              parent: "user",
              message: {
                author: { role: "assistant" },
                content: { parts: ["second turn"] },
              },
            },
          },
        },
      ]),
      "utf8",
    );

    const conversations = await parseChatGptExportFile(exportPath);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.transcriptBody.indexOf("first turn")).toBeLessThan(
      conversations[0]?.transcriptBody.indexOf("second turn") ?? -1,
    );
  });

  it("preserves source order when fallback transcript messages share the same timestamp", async () => {
    const dir = await createTempDir("memory-wiki-chatgpt-same-times-");
    const exportPath = path.join(dir, "export.json");
    await fs.writeFile(
      exportPath,
      JSON.stringify([
        {
          id: "conv-same-times",
          title: "Same times thread",
          mapping: {
            "1": {
              message: {
                author: { role: "assistant" },
                create_time: 1_710_000_010,
                content: { parts: ["first exported message"] },
              },
            },
            "2": {
              message: {
                author: { role: "user" },
                create_time: 1_710_000_010,
                content: { parts: ["second exported message"] },
              },
            },
          },
        },
      ]),
      "utf8",
    );

    const conversations = await parseChatGptExportFile(exportPath);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.transcriptBody.indexOf("first exported message")).toBeLessThan(
      conversations[0]?.transcriptBody.indexOf("second exported message") ?? -1,
    );
  });

  it("skips hidden and tool messages from imported transcripts", async () => {
    const dir = await createTempDir("memory-wiki-chatgpt-hidden-tool-");
    const exportPath = path.join(dir, "export.json");
    await fs.writeFile(
      exportPath,
      JSON.stringify([
        {
          id: "conv-hidden-tool",
          title: "Hidden tool thread",
          mapping: {
            visible: {
              message: {
                author: { role: "user" },
                content: { parts: ["visible user turn"] },
              },
            },
            hidden: {
              message: {
                author: { role: "assistant" },
                metadata: { is_visually_hidden_from_conversation: true },
                content: { parts: ["hidden assistant turn"] },
              },
            },
            tool: {
              message: {
                author: { role: "tool" },
                content: { parts: ["tool output"] },
              },
            },
          },
        },
      ]),
      "utf8",
    );

    const conversations = await parseChatGptExportFile(exportPath);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.transcriptBody).toContain("visible user turn");
    expect(conversations[0]?.transcriptBody).not.toContain("hidden assistant turn");
    expect(conversations[0]?.transcriptBody).not.toContain("tool output");
  });

  it("drops conversations with no readable visible messages", async () => {
    const dir = await createTempDir("memory-wiki-chatgpt-empty-visible-");
    const exportPath = path.join(dir, "export.json");
    await fs.writeFile(
      exportPath,
      JSON.stringify([
        {
          id: "conv-empty",
          title: "Empty visible thread",
          mapping: {
            hidden: {
              message: {
                author: { role: "assistant" },
                metadata: { is_visually_hidden_from_conversation: true },
                content: { parts: ["hidden assistant turn"] },
              },
            },
            tool: {
              message: {
                author: { role: "tool" },
                content: { parts: ["tool output"] },
              },
            },
          },
        },
        {
          id: "conv-visible",
          title: "Visible thread",
          mapping: {
            root: {
              message: {
                author: { role: "user" },
                content: { parts: ["keep me"] },
              },
            },
          },
        },
      ]),
      "utf8",
    );

    const conversations = await parseChatGptExportFile(exportPath);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      conversationId: "conv-visible",
      title: "Visible thread",
    });
  });
});
