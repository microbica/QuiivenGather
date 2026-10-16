import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../api/google";
import { dueReminder } from "./useMeetingReminders";

const MIN = 60_000;

function timed(id: string, startMs: number, durMs = 30 * MIN): CalendarEvent {
  return {
    id,
    summary: "Daily",
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + durMs).toISOString(),
    htmlLink: "",
    hangoutLink: "https://meet.google.com/abc",
  };
}

describe("dueReminder", () => {
  it("avisa a 15', luego a 5', luego al empezar (una vez cada uno)", () => {
    const now = Date.now();
    const e = timed("a", now + 60 * MIN);
    const fired = new Set<string>();
    expect(dueReminder(e, now, fired)).toBeNull(); // falta 1h

    const at15 = now + 45 * MIN + 1; // quedan 15'
    expect(dueReminder(e, at15, fired)).toBe("m15");
    fired.add("a:m15");
    expect(dueReminder(e, at15, fired)).toBeNull(); // no repite

    const at5 = now + 55 * MIN + 1; // quedan 5'
    expect(dueReminder(e, at5, fired)).toBe("m5");
    fired.add("a:m5");

    const live = now + 60 * MIN + 1; // en curso
    expect(dueReminder(e, live, fired)).toBe("now");
    fired.add("a:now");
    expect(dueReminder(e, live, fired)).toBeNull();
  });

  it("si la app se abre tarde, avisa lo más urgente sin spam", () => {
    const now = Date.now();
    const e = timed("b", now + 3 * MIN); // quedan 3'
    expect(dueReminder(e, now, new Set())).toBe("m5");
  });

  it("lo vencido nunca avisa", () => {
    const now = Date.now();
    expect(dueReminder(timed("c", now - 60 * MIN), now, new Set())).toBeNull();
  });

  it("todo-el-día nunca avisa (solo se ve en lista)", () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const today = `${d.getDate()}`.padStart(2, "0");
    const pad = (n: number) => `${n}`.padStart(2, "0");
    const e: CalendarEvent = {
      id: "d", summary: "Off", start: `${y}-${m}-${today}`, end: `${y}-${m}-${pad(d.getDate() + 1)}`,
      htmlLink: "", hangoutLink: "",
    };
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    expect(dueReminder(e, noon.getTime(), new Set())).toBeNull();
  });
});
