import { describe, expect, it } from "vitest";
import {
  markdownToTelegramHtml,
  renderTelegramHtmlText,
  wrapFileReferencesInHtml,
} from "./format.js";

describe("wrapFileReferencesInHtml", () => {
  it("wraps .md filenames in code tags", () => {
    expect(wrapFileReferencesInHtml("Check README.md")).toContain("Check <code>README.md</code>");
    expect(wrapFileReferencesInHtml("See HEARTBEAT.md for status")).toContain(
      "See <code>HEARTBEAT.md</code> for status",
    );
  });

  it("wraps .go filenames", () => {
    expect(wrapFileReferencesInHtml("Check main.go")).toContain("Check <code>main.go</code>");
  });

  it("wraps .py filenames", () => {
    expect(wrapFileReferencesInHtml("Run script.py")).toContain("Run <code>script.py</code>");
  });

  it("wraps .pl filenames", () => {
    expect(wrapFileReferencesInHtml("Check backup.pl")).toContain("Check <code>backup.pl</code>");
  });

  it("wraps file paths", () => {
    expect(wrapFileReferencesInHtml("Look at squad/friday/HEARTBEAT.md")).toContain(
      "Look at <code>squad/friday/HEARTBEAT.md</code>",
    );
  });

  it("does not wrap inside existing code tags", () => {
    const input = "Already <code>wrapped.md</code> here";
    const result = wrapFileReferencesInHtml(input);
    expect(result).toBe(input);
    expect(result).not.toContain("<code><code>");
  });

  it("does not wrap inside pre tags", () => {
    const input = "<pre><code>README.md</code></pre>";
    const result = wrapFileReferencesInHtml(input);
    expect(result).toBe(input);
  });

  it("does not wrap inside anchor tags", () => {
    const input = '<a href="README.md">Link</a>';
    const result = wrapFileReferencesInHtml(input);
    expect(result).toBe(input);
  });

  it("does not wrap in URLs", () => {
    const result = wrapFileReferencesInHtml("Visit https://example.com/README.md");
    expect(result).toContain('href="https://example.com/README.md"');
    expect(result).not.toContain("<code>README.md</code>");
  });

  it("handles mixed content correctly", () => {
    const result = wrapFileReferencesInHtml("Check README.md and CONTRIBUTING.md");
    expect(result).toContain("<code>README.md</code>");
    expect(result).toContain("<code>CONTRIBUTING.md</code>");
  });

  it("handles edge cases", () => {
    expect(wrapFileReferencesInHtml("No markdown files here")).not.toContain("<code>");
    expect(wrapFileReferencesInHtml("File.md at start")).toContain("<code>File.md</code>");
    expect(wrapFileReferencesInHtml("Ends with file.md")).toContain("<code>file.md</code>");
  });
});

describe("renderTelegramHtmlText - file reference wrapping", () => {
  it("wraps file references in markdown mode", () => {
    const result = renderTelegramHtmlText("Check README.md");
    expect(result).toContain("<code>README.md</code>");
  });

  it("wraps file references in HTML mode", () => {
    const result = renderTelegramHtmlText("Check README.md", { textMode: "html" });
    expect(result).toContain("<code>README.md</code>");
  });

  it("does not double-wrap already code-formatted content", () => {
    const result = renderTelegramHtmlText("Already `wrapped.md` here");
    // Should have code tags but not nested
    expect(result).toContain("<code>");
    expect(result).not.toContain("<code><code>");
  });
});

describe("markdownToTelegramHtml - file reference wrapping", () => {
  it("wraps file references by default", () => {
    const result = markdownToTelegramHtml("Check README.md");
    expect(result).toContain("<code>README.md</code>");
  });

  it("can skip wrapping when requested", () => {
    const result = markdownToTelegramHtml("Check README.md", { wrapFileRefs: false });
    expect(result).not.toContain("<code>README.md</code>");
  });
});
