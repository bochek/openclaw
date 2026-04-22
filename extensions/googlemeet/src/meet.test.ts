import { describe, expect, it } from "vitest";
import { buildGoogleMeetPreflightReport, normalizeGoogleMeetSpaceName } from "./meet.js";

describe("normalizeGoogleMeetSpaceName", () => {
  it("accepts canonical spaces ids, meeting codes, and meet urls", () => {
    expect(normalizeGoogleMeetSpaceName("spaces/jQCFfuBOdN5z")).toBe("spaces/jQCFfuBOdN5z");
    expect(normalizeGoogleMeetSpaceName("abc-defg-hij")).toBe("spaces/abc-defg-hij");
    expect(normalizeGoogleMeetSpaceName("https://meet.google.com/pdq-bixx-kjf")).toBe(
      "spaces/pdq-bixx-kjf",
    );
  });

  it("rejects non-Meet urls", () => {
    expect(() => normalizeGoogleMeetSpaceName("https://example.com/not-meet")).toThrow(
      /Expected a meet\.google\.com URL/,
    );
  });
});

describe("buildGoogleMeetPreflightReport", () => {
  it("surfaces preview acknowledgment blockers", () => {
    const report = buildGoogleMeetPreflightReport({
      input: "https://meet.google.com/pdq-bixx-kjf",
      space: {
        name: "spaces/jQCFfuBOdN5z",
        meetingCode: "pdq-bixx-kjf",
      },
      previewAcknowledged: false,
      tokenSource: "refresh-token",
    });

    expect(report.blockers).toHaveLength(1);
    expect(report.hasActiveConference).toBe(false);
  });
});
