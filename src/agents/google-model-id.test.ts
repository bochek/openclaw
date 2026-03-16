import { describe, expect, it } from "vitest";
import { normalizeGoogleModelId } from "./google-model-id.js";

describe("normalizeGoogleModelId", () => {
  it("preserves compatibility with legacy Gemini aliases", () => {
    expect(normalizeGoogleModelId("gemini-3.1-flash")).toBe("gemini-3-flash-preview");
    expect(normalizeGoogleModelId("gemini-3.1-flash-preview")).toBe("gemini-3-flash-preview");
    expect(normalizeGoogleModelId("gemini-3.1-flash-lite")).toBe("gemini-3.1-flash-lite-preview");
    expect(normalizeGoogleModelId("gemini-3-pro")).toBe("gemini-3-pro-preview");
  });
});
