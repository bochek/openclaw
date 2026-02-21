import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontmatter, resolveOpenClawMetadata } from "./skills/frontmatter.js";

describe("skills/xurl frontmatter", () => {
  it("exposes a node installer for npm distribution", () => {
    const skillPath = path.join(process.cwd(), "skills", "xurl", "SKILL.md");
    const raw = fs.readFileSync(skillPath, "utf-8");
    const frontmatter = parseFrontmatter(raw);
    const metadata = resolveOpenClawMetadata(frontmatter);
    const install = metadata?.install ?? [];

    expect(
      install.some(
        (spec) =>
          spec.kind === "node" && spec.package === "@xdevplatform/xurl" && spec.id === "npm",
      ),
    ).toBe(true);
  });
});
