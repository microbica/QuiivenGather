import { describe, expect, it } from "vitest";
import { canHear, emitsAudio, gainFor, normalizeStatus } from "./status";

describe("normalizeStatus", () => {
  it("acepta los 5 estados y cae a available con basura", () => {
    expect(normalizeStatus("focus")).toBe("focus");
    expect(normalizeStatus("")).toBe("available");
    expect(normalizeStatus("invisible")).toBe("available");
    expect(normalizeStatus(undefined)).toBe("available");
  });
});

describe("compuertas de audio por estado", () => {
  it("meeting/focus/away bloquean en ambos sentidos", () => {
    for (const s of ["meeting", "focus", "away"] as const) {
      expect(canHear(s)).toBe(false);
      expect(emitsAudio(s)).toBe(false);
      expect(gainFor(s)).toBe(0);
    }
  });

  it("available escucha y emite a volumen normal; busy atenuado", () => {
    expect(canHear("available")).toBe(true);
    expect(gainFor("available")).toBe(1);
    expect(canHear("busy")).toBe(true);
    expect(emitsAudio("busy")).toBe(true);
    expect(gainFor("busy")).toBe(0.5);
  });
});
