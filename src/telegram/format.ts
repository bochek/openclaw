import type { MarkdownTableMode } from "../config/types.base.js";
import {
  chunkMarkdownIR,
  markdownToIR,
  type MarkdownLinkSpan,
  type MarkdownIR,
} from "../markdown/ir.js";
import { renderMarkdownWithMarkers } from "../markdown/render.js";

export type TelegramFormattedChunk = {
  html: string;
  text: string;
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function buildTelegramLink(link: MarkdownLinkSpan, _text: string) {
  const href = link.href.trim();
  if (!href) {
    return null;
  }
  if (link.start === link.end) {
    return null;
  }
  const safeHref = escapeHtmlAttr(href);
  return {
    start: link.start,
    end: link.end,
    open: `<a href="${safeHref}">`,
    close: "</a>",
  };
}

function renderTelegramHtml(ir: MarkdownIR): string {
  return renderMarkdownWithMarkers(ir, {
    styleMarkers: {
      bold: { open: "<b>", close: "</b>" },
      italic: { open: "<i>", close: "</i>" },
      strikethrough: { open: "<s>", close: "</s>" },
      code: { open: "<code>", close: "</code>" },
      code_block: { open: "<pre><code>", close: "</code></pre>" },
    },
    escapeText: escapeHtml,
    buildLink: buildTelegramLink,
  });
}

export function markdownToTelegramHtml(
  markdown: string,
  options: { tableMode?: MarkdownTableMode; wrapFileRefs?: boolean } = {},
): string {
  const ir = markdownToIR(markdown ?? "", {
    linkify: true,
    headingStyle: "none",
    blockquotePrefix: "",
    tableMode: options.tableMode,
  });
  const html = renderTelegramHtml(ir);
  // Apply file reference wrapping if requested (for chunked rendering)
  if (options.wrapFileRefs !== false) {
    return wrapFileReferencesInHtml(html);
  }
  return html;
}

/**
 * File extensions that share TLDs and commonly appear in code/documentation.
 * These are wrapped in <code> tags to prevent Telegram from generating
 * spurious domain registrar previews.
 */
const FILE_EXTENSIONS_WITH_TLD = new Set([
  // High priority - commonly referenced in messages
  "md", // Markdown (Moldova)
  "go", // Go language
  "py", // Python (Paraguay)
  "pl", // Perl (Poland)
  "ai", // Adobe Illustrator (Anguilla)
  "sh", // Shell (Saint Helena)
  // Medium priority - sometimes referenced
  "io", // Tuvalu (often used for tech projects)
  "tv", // Tuvalu (video files)
  "fm", // Federated States of Micronesia (audio)
  "am", // Armenia
  "at", // Austria
  "be", // Belgium
  "cc", // Cocos Islands
  "co", // Colombia
]);

/**
 * Wraps standalone file references (with TLD extensions) in <code> tags.
 * This prevents Telegram from treating them as URLs and generating
 * irrelevant domain registrar previews.
 *
 * Runs AFTER markdown→HTML conversion to avoid modifying HTML attributes.
 * Skips content inside <code>, <pre>, and <a> tags to avoid nesting issues.
 */
export function wrapFileReferencesInHtml(html: string): string {
  // Build regex pattern for all tracked extensions
  const extensionsPattern = Array.from(FILE_EXTENSIONS_WITH_TLD).join("|");
  const filePattern = new RegExp(
    `(^|>|[\\s])([a-zA-Z0-9_.\\-./]+\\.(?:${extensionsPattern}))(?=$|[\\s<])`,
    "gi",
  );

  // Track if we're inside tags that should not be modified
  let inCode = false;
  let inPre = false;
  let inAnchor = false;
  let result = "";
  let lastIndex = 0;

  // Process the HTML token by token to respect tag boundaries
  const tagPattern = /(<\/?)(code|pre|a)\b[^>]*?>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(html)) !== null) {
    const tagStart = match.index;
    const tagEnd = tagPattern.lastIndex;
    const isClosing = match[1] === "/";
    const tagName = match[2].toLowerCase();

    // Process text before this tag
    const textBefore = html.slice(lastIndex, tagStart);
    result += textBefore.replace(filePattern, (m, prefix, filename) => {
      // Skip if inside protected tags or if it's a URL
      if (inCode || inPre || inAnchor) {
        return m;
      }
      if (filename.startsWith("//")) {
        return m;
      }
      if (/https?:\/\/$/i.test(prefix)) {
        return m;
      }
      return `${prefix}<code>${filename}</code>`;
    });

    // Update tag state
    if (tagName === "code") {
      inCode = !isClosing;
    } else if (tagName === "pre") {
      inPre = !isClosing;
    } else if (tagName === "a") {
      inAnchor = !isClosing;
    }

    // Add the tag itself
    result += html.slice(tagStart, tagEnd);
    lastIndex = tagEnd;
  }

  // Process remaining text
  const remainingText = html.slice(lastIndex);
  result += remainingText.replace(filePattern, (m, prefix, filename) => {
    if (inCode || inPre || inAnchor) {
      return m;
    }
    if (filename.startsWith("//")) {
      return m;
    }
    if (/https?:\/\/$/i.test(prefix)) {
      return m;
    }
    return `${prefix}<code>${filename}</code>`;
  });

  return result;
}

export function renderTelegramHtmlText(
  text: string,
  options: { textMode?: "markdown" | "html"; tableMode?: MarkdownTableMode } = {},
): string {
  const textMode = options.textMode ?? "markdown";
  if (textMode === "html") {
    // For HTML mode, still wrap file references in the HTML
    return wrapFileReferencesInHtml(text);
  }
  const html = markdownToTelegramHtml(text, { tableMode: options.tableMode });
  // Wrap file references after markdown→HTML conversion
  // This ensures we only transform text nodes, not HTML attributes
  return wrapFileReferencesInHtml(html);
}

export function markdownToTelegramChunks(
  markdown: string,
  limit: number,
  options: { tableMode?: MarkdownTableMode } = {},
): TelegramFormattedChunk[] {
  const ir = markdownToIR(markdown ?? "", {
    linkify: true,
    headingStyle: "none",
    blockquotePrefix: "",
    tableMode: options.tableMode,
  });
  const chunks = chunkMarkdownIR(ir, limit);
  return chunks.map((chunk) => ({
    html: wrapFileReferencesInHtml(renderTelegramHtml(chunk)),
    text: chunk.text,
  }));
}

export function markdownToTelegramHtmlChunks(markdown: string, limit: number): string[] {
  return markdownToTelegramChunks(markdown, limit).map((chunk) => chunk.html);
}
