import type { CalendarEvent } from "../api/google";

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Mediodía local (evita que el huso horario mueva el día). */
export function localNoon(day: string): number {
  return new Date(`${day}T12:00:00`).getTime();
}

/**
 * Rango legible de un evento:
 * - Un día: "mar, 13 oct · Todo el día" / "mar, 13 oct · 14:30–15:30".
 * - Varios días: "13 → 16 oct · Todo el día" (Google trae `end` exclusivo).
 */
export function formatRange(e: CalendarEvent): string {
  const dayFmt = new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeFmt = new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (DATE_ONLY.test(e.start)) {
    const s = localNoon(e.start);
    if (Number.isNaN(s)) return "";
    if (DATE_ONLY.test(e.end)) {
      const last = new Date(localNoon(e.end));
      last.setDate(last.getDate() - 1); // end exclusivo → último día real
      if (!Number.isNaN(last.getTime()) && last.getTime() !== s) {
        const from = new Date(s);
        const range =
          last.getMonth() === from.getMonth()
            ? `${from.getDate()} → ${dayFmt.format(last)}`
            : `${new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(from)} → ${dayFmt.format(last)}`;
        return `${range} · Todo el día`;
      }
    }
    return `${dayFmt.format(new Date(s))} · Todo el día`;
  }
  const s = new Date(e.start);
  if (Number.isNaN(s.getTime())) return "";
  let when = `${dayFmt.format(s)} · ${timeFmt.format(s)}`;
  const end = new Date(e.end);
  if (!Number.isNaN(end.getTime()) && end.getTime() > s.getTime()) {
    when += end.toDateString() === s.toDateString() ? `–${timeFmt.format(end)}` : ` → ${dayFmt.format(end)} · ${timeFmt.format(end)}`;
  }
  return when;
}

/** "ahora mismo" / "hace 3 min" / "hace 2 h" (última sincronización). */
export function formatAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "ahora mismo";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

/** Gracia tras el fin para alcanzar el Meet aunque ya haya cerrado. */
export const EXPIRED_GRACE_MS = 5 * 60_000;

/** True si el evento ya venció (usa `end`; si falta, usa `start`). */
export function isExpired(e: CalendarEvent, now: number): boolean {
  const end = DATE_ONLY.test(e.end)
    ? new Date(`${e.end}T00:00:00`).getTime() // end exclusivo: el evento cubre hasta ese día
    : Date.parse(e.end);
  if (!Number.isNaN(end)) return end < now - EXPIRED_GRACE_MS;
  const start = DATE_ONLY.test(e.start) ? localNoon(e.start) : Date.parse(e.start);
  if (Number.isNaN(start)) return true;
  return start < now - EXPIRED_GRACE_MS;
}

/** True si el evento está ocurriendo ahora (explica por qué sigue visible). */
export function isLive(e: CalendarEvent, now: number): boolean {
  if (DATE_ONLY.test(e.start)) {
    const s = new Date(`${e.start}T00:00:00`).getTime();
    if (Number.isNaN(s)) return false;
    const endMs = DATE_ONLY.test(e.end)
      ? new Date(`${e.end}T00:00:00`).getTime()
      : s + 24 * 60_000;
    return s <= now && now < endMs;
  }
  const s = Date.parse(e.start);
  if (Number.isNaN(s)) return false;
  const parsedEnd = Date.parse(e.end);
  const endMs = Number.isNaN(parsedEnd) ? s + 60 * 60_000 : parsedEnd;
  return s <= now && now <= endMs + EXPIRED_GRACE_MS;
}
