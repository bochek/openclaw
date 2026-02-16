import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  collectCommandSelectorCandidates,
  rankCommandSelectorCandidates,
} from "./command-selector.js";

describe("command-selector", () => {
  it("collects nested command paths", () => {
    const program = new Command();
    const message = program.command("message").description("Manage messages");
    message.command("send").description("Send a message");
    message.command("read").description("Read messages");
    program.command("status").description("Show status");

    const candidates = collectCommandSelectorCandidates(program);
    const labels = candidates.map((candidate) => candidate.label);

    expect(labels).toContain("message");
    expect(labels).toContain("message send");
    expect(labels).toContain("message read");
    expect(labels).toContain("status");
  });

  it("skips hidden commands", () => {
    const program = new Command();
    program.command("visible").description("Visible command");
    const secret = program.command("secret").description("Secret command");
    (secret as Command & { _hidden?: boolean })._hidden = true;

    const candidates = collectCommandSelectorCandidates(program);
    const labels = candidates.map((candidate) => candidate.label);

    expect(labels).toContain("visible");
    expect(labels).not.toContain("secret");
  });

  it("supports fuzzy ranking", () => {
    const program = new Command();
    const message = program.command("message").description("Manage messages");
    message.command("send").description("Send a message");
    message.command("search").description("Search messages");
    program.command("status").description("Show status");

    const candidates = collectCommandSelectorCandidates(program);
    const ranked = rankCommandSelectorCandidates(candidates, "msg snd");

    expect(ranked[0]?.label).toBe("message send");
    expect(ranked.some((candidate) => candidate.label === "status")).toBe(false);
  });
});
