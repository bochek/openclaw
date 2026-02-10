import { describe, expect, it } from "vitest";
import { buildExplorerSnapshot } from "./schema-spike.ts";

describe("buildExplorerSnapshot", () => {
  it("builds ordered sections and field metadata", () => {
    const snapshot = buildExplorerSnapshot();

    expect(snapshot.sectionCount).toBeGreaterThan(0);
    expect(snapshot.fieldCount).toBeGreaterThan(0);
    expect(snapshot.sections[0]?.order).toBeLessThanOrEqual(snapshot.sections.at(-1)?.order ?? 0);

    const gatewaySection = snapshot.sections.find((section) => section.id === "gateway");
    expect(gatewaySection).toBeTruthy();
    expect(gatewaySection?.fields.some((field) => field.path === "gateway.auth.token")).toBe(true);

    const tokenField = gatewaySection?.fields.find((field) => field.path === "gateway.auth.token");
    expect(tokenField?.sensitive).toBe(true);
  });
});
