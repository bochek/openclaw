import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat layout styles", () => {
  it("includes assistant text avatar styles for configured IDENTITY avatars", () => {
    const css = readFileSync(new URL("./layout.css", import.meta.url), "utf8");

    expect(css).toContain(".agent-chat__avatar--text");
    expect(css).toContain("font-size: 20px;");
    expect(css).toContain("place-items: center;");
  });
});
