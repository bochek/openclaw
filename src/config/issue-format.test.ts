import { describe, expect, it } from "vitest";
import {
  formatConfigIssueLine,
  formatConfigIssueLines,
  normalizeConfigIssue,
  normalizeConfigIssuePath,
  normalizeConfigIssues,
} from "./issue-format.js";

describe("config issue format", () => {
  it("normalizes empty paths to <root>", () => {
    expect(normalizeConfigIssuePath("")).toBe("<root>");
    expect(normalizeConfigIssuePath("   ")).toBe("<root>");
    expect(normalizeConfigIssuePath(null)).toBe("<root>");
    expect(normalizeConfigIssuePath(undefined)).toBe("<root>");
  });

  it("formats issue lines with and without markers", () => {
    expect(formatConfigIssueLine({ path: "", message: "broken" }, "-")).toBe("- : broken");
    expect(
      formatConfigIssueLine({ path: "", message: "broken" }, "-", { normalizeRoot: true }),
    ).toBe("- <root>: broken");
    expect(formatConfigIssueLine({ path: "gateway.bind", message: "invalid" }, "")).toBe(
      "gateway.bind: invalid",
    );
    expect(
      formatConfigIssueLines(
        [
          { path: "", message: "first" },
          { path: "channels.signal.dmPolicy", message: "second" },
        ],
        "×",
        { normalizeRoot: true },
      ),
    ).toEqual(["× <root>: first", "× channels.signal.dmPolicy: second"]);
  });

  it("normalizes issue metadata for machine output", () => {
    expect(
      normalizeConfigIssue({
        path: "",
        message: "invalid",
        allowedValues: ["stable", "beta"],
        allowedValuesHiddenCount: 0,
      }),
    ).toEqual({
      path: "<root>",
      message: "invalid",
      allowedValues: ["stable", "beta"],
    });

    expect(
      normalizeConfigIssues([
        {
          path: "update.channel",
          message: "invalid",
          allowedValues: [],
          allowedValuesHiddenCount: 2,
        },
      ]),
    ).toEqual([
      {
        path: "update.channel",
        message: "invalid",
        allowedValuesHiddenCount: 2,
      },
    ]);
  });
});
