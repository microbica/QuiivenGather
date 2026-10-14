import { describe, expect, it } from "vitest";
import { isEmailAllowed, validMeetUrl } from "./google.js";

describe("isEmailAllowed (login @quiiven.com)", () => {
  it("allows @quiiven.com and rejects other domains", () => {
    expect(isEmailAllowed("alejandro.moreno@quiiven.com")).toBe(true);
    expect(isEmailAllowed("x@gmail.com")).toBe(false);
    expect(isEmailAllowed("x@quiiven.com.evil.com")).toBe(false);
  });
});

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
