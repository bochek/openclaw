import path from "node:path";

const ansi = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
} as const;

function useColor() {
  return Boolean(process.stdout.isTTY) && process.env.NO_COLOR !== "1";
}

function paint(text: string, ...codes: string[]) {
  if (!useColor() || codes.length === 0) {
    return text;
  }
  return `${codes.join("")}${text}${ansi.reset}`;
}

export function headline(text: string) {
  return paint(text, ansi.bold);
}

export function sectionTitle(text: string) {
  return paint(text, ansi.bold);
}

export function pageHeader(title: string, subtitle?: string, detail?: string) {
  return [headline(title), subtitle ? muted(subtitle) : "", detail ? muted(detail) : ""].filter(
    Boolean,
  );
}

export function muted(text: string) {
  return text;
}

function toneColor(tone: "neutral" | "success" | "warning" | "danger" | "info" = "neutral") {
  return tone === "success"
    ? ansi.green
    : tone === "warning"
      ? ansi.yellow
      : tone === "danger"
        ? ansi.red
        : tone === "info"
          ? ansi.cyan
          : ansi.gray;
}

export function toneWord(
  text: string,
  tone: "neutral" | "success" | "warning" | "danger" | "info" = "neutral",
) {
  return paint(text.toUpperCase(), ansi.bold, toneColor(tone));
}

export function badge(
  text: string,
  tone: "neutral" | "success" | "warning" | "danger" | "info" = "neutral",
) {
  return paint(`[${text}]`, ansi.bold, toneColor(tone));
}

export function verdictBadge(verdict: string) {
  switch (verdict) {
    case "pass":
      return toneWord("pass", "success");
    case "fail":
      return toneWord("fail", "danger");
    case "blocked":
      return toneWord("blocked", "warning");
    case "degraded":
      return toneWord("degraded", "warning");
    case "flaky":
      return toneWord("flaky", "warning");
    case "skipped":
      return toneWord("skipped", "neutral");
    default:
      return toneWord(verdict, "neutral");
  }
}

export function comparisonBadge(kind: string) {
  return toneWord(kind, kind === "comparable" ? "success" : "info");
}

export function interpretationBadge(kind: string) {
  switch (kind) {
    case "regression":
      return toneWord("regression", "danger");
    case "improvement":
      return toneWord("improvement", "success");
    case "compatibility-delta":
      return toneWord("compat", "info");
    case "mixed-change":
      return toneWord("mixed", "warning");
    default:
      return toneWord("info", "neutral");
  }
}

export function keyValueBlock(rows: Array<[string, string | number | boolean | undefined | null]>) {
  const visibleRows = rows.filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  const width = visibleRows.reduce((max, [label]) => Math.max(max, label.length), 0);
  return visibleRows.map(
    ([label, value]) => `${paint(`${label.padEnd(width)}:`, ansi.bold)} ${String(value)}`,
  );
}

export function bulletList(items: string[], prefix = "-") {
  return items.map((item) => `${prefix} ${item}`);
}

export function indent(lines: string[], spaces = 2) {
  const pad = " ".repeat(spaces);
  return lines.map((line) => `${pad}${line}`);
}

export function block(title: string, lines: string[]) {
  if (lines.length === 0) {
    return [];
  }
  return [sectionTitle(title), ...lines];
}

export function table(headers: string[], rows: string[][]) {
  const filteredRows = rows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (filteredRows.length === 0) {
    return [];
  }
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...filteredRows.map((row) => (row[index] ?? "").length)),
  );
  const renderRow = (row: string[], header = false) =>
    row
      .map((cell, index) => {
        const value = (cell ?? "").padEnd(widths[index] ?? 0);
        return header ? paint(value, ansi.bold) : value;
      })
      .join("  ");
  return [renderRow(headers, true), ...filteredRows.map((row) => renderRow(row))];
}

export function joinBlocks(blocks: string[][]) {
  return `${blocks
    .filter((block) => block.length > 0)
    .map((block) => block.join("\n"))
    .join("\n\n")}\n`;
}

export function displayPath(value: string) {
  if (!path.isAbsolute(value)) {
    return value;
  }
  const relative = path.relative(process.cwd(), value);
  return relative && !relative.startsWith("..") ? relative : value;
}

export function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = durationMs / 1000;
  return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
}

export function formatIsoTimestamp(value: string | undefined) {
  if (!value) {
    return "unknown";
  }
  const normalized = value.replace("T", " ").replace(/\.\d+Z$/, "Z");
  return normalized.endsWith("Z") ? normalized.slice(0, -1) : normalized;
}
