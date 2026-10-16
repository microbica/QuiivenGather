import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../api/google";
import { formatAgo, formatRange, isExpired, isLive } from "./eventTime";

const MIN = 60_000;

function timed(startMs: number, durMs = 30 * MIN): CalendarEvent {
  return {
    id: "t",
    summary: "Daily",
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + durMs).toISOString(),
    htmlLink: "",
    hangoutLink: "https://meet.google.com/abc",
  };
}

function dayStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("formatRange", () => {
  it("muestra inicio–fin el mismo día", () => {
    const now = Date.now();
    const label = formatRange(timed(now + MIN * 60));
    expect(label).toContain("–");
    expect(label).not.toContain("Todo el día");
  });

  it("un día completo muestra 'Todo el día'", () => {
    const e: CalendarEvent = {
      id: "a", summary: "Off", start: dayStr(1), end: dayStr(2), htmlLink: "", hangoutLink: "",
    };
    expect(formatRange(e)).toContain("Todo el día");
  });

  it("varios días muestra el rango", () => {
    const e: CalendarEvent = {
      id: "b", summary: "Off", start: dayStr(-2), end: dayStr(1), htmlLink: "", hangoutLink: "",
    };
    expect(formatRange(e)).toContain("→");
  });
});

describe("formatAgo", () => {
  it("dice ahora mismo, minutos y horas", () => {
    const now = Date.now();
    expect(formatAgo(now - 10_000, now)).toBe("ahora mismo");
    expect(formatAgo(now - 3 * 60_000, now)).toBe("hace 3 min");
    expect(formatAgo(now - 2 * 3_600_000, now)).toBe("hace 2 h");
  });
});

describe("isExpired", () => {
  it("lo futuro no vence y lo pasado sí", () => {
    const now = Date.now();
    expect(isExpired(timed(now + 10 * MIN), now)).toBe(false);
    expect(isExpired(timed(now - 60 * MIN), now)).toBe(true);
  });

  it("un todo-el-día de ayer ya venció", () => {
    const e: CalendarEvent = {
      id: "c", summary: "Ayer", start: dayStr(-1), end: dayStr(0), htmlLink: "", hangoutLink: "",
    };
    expect(isExpired(e, Date.now())).toBe(true);
  });
});

describe("isLive", () => {
  it("detecta reunión en curso y futura no", () => {
    const now = Date.now();
    expect(isLive(timed(now - 5 * MIN), now)).toBe(true);
    expect(isLive(timed(now + 10 * MIN), now)).toBe(false);
  });

  it("un todo-el-día de varios días está en curso a mitad", () => {
    const e: CalendarEvent = {
      id: "d", summary: "Off", start: dayStr(-2), end: dayStr(1), htmlLink: "", hangoutLink: "",
    };
    expect(isLive(e, Date.now())).toBe(true);
    expect(isExpired(e, Date.now())).toBe(false);
  });
});
