import { describe, expect, it } from "vitest";
import { validMeetUrl } from "./google.js";

describe("validMeetUrl", () => {
  it("accepts https meet urls", () => {
    expect(validMeetUrl("https://meet.google.com/abc-defg-hij")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("rejects http / other hosts", () => {
    expect(validMeetUrl("http://meet.google.com/abc")).toBeNull();
    expect(validMeetUrl("https://evil.com/abc")).toBeNull();
    expect(validMeetUrl("https://meet.google.com.evil.com/x")).toBeNull();
  });

  it("rejects non-strings and oversized", () => {
    expect(validMeetUrl("")).toBeNull();
    expect(validMeetUrl(null)).toBeNull();
    expect(validMeetUrl(123)).toBeNull();
    expect(validMeetUrl("https://meet.google.com/" + "a".repeat(300))).toBeNull();
  });
});
