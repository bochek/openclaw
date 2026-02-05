import { describe, expect, it } from "vitest";
import {
  markdownToTelegramChunks,
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

  it("wraps .sh filenames", () => {
    expect(wrapFileReferencesInHtml("Run backup.sh")).toContain("Run <code>backup.sh</code>");
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

  it("does not wrap file refs inside real URL anchor tags", () => {
    const input = 'Visit <a href="https://example.com/README.md">example.com/README.md</a>';
    const result = wrapFileReferencesInHtml(input);
    expect(result).toBe(input);
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

  it("de-linkifies auto-linkified file ref anchors", () => {
    const input = '<a href="http://README.md">README.md</a>';
    expect(wrapFileReferencesInHtml(input)).toBe("<code>README.md</code>");
  });

  it("de-linkifies auto-linkified path anchors", () => {
    const input = '<a href="http://squad/friday/HEARTBEAT.md">squad/friday/HEARTBEAT.md</a>';
    expect(wrapFileReferencesInHtml(input)).toBe("<code>squad/friday/HEARTBEAT.md</code>");
  });

  it("preserves explicit links where label differs from href", () => {
    const input = '<a href="http://README.md">click here</a>';
    expect(wrapFileReferencesInHtml(input)).toBe(input);
  });

  it("wraps file ref after closing anchor tag", () => {
    const input = '<a href="https://example.com">link</a> then README.md';
    const result = wrapFileReferencesInHtml(input);
    expect(result).toContain("</a> then <code>README.md</code>");
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

  it("wraps multiple file types in a single message", () => {
    const result = markdownToTelegramHtml("Edit main.go and script.py");
    expect(result).toContain("<code>main.go</code>");
    expect(result).toContain("<code>script.py</code>");
  });

  it("preserves real URLs as anchor tags", () => {
    const result = markdownToTelegramHtml("Visit https://example.com");
    expect(result).toContain('<a href="https://example.com">');
  });

  it("preserves explicit markdown links even when href looks like a file ref", () => {
    const result = markdownToTelegramHtml("[docs](http://README.md)");
    expect(result).toContain('<a href="http://README.md">docs</a>');
  });

  it("wraps file ref after real URL in same message", () => {
    const result = markdownToTelegramHtml("Visit https://example.com and README.md");
    expect(result).toContain('<a href="https://example.com">');
    expect(result).toContain("<code>README.md</code>");
  });
});

describe("markdownToTelegramChunks - file reference wrapping", () => {
  it("wraps file references in chunked output", () => {
    const chunks = markdownToTelegramChunks("Check README.md and backup.sh", 4096);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].html).toContain("<code>README.md</code>");
    expect(chunks[0].html).toContain("<code>backup.sh</code>");
  });
});
