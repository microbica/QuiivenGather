// Pure server-side validation for movement and chat.
// Kept dependency-free (only protocol consts) so it is unit-testable.
import {
  CHAT_MAX_LEN,
  MAP_H,
  MAP_W,
  MAX_SPEED,
  PLAYER_H,
  PLAYER_W,
} from "@quiiven/protocol";

export const DIRS = ["up", "down", "left", "right"] as const;
export const ANIMS = ["idle", "walk"] as const;

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Clamp a client-proposed position: inside map bounds and within
 * MAX_SPEED * dt of the last authoritative position (anti-teleport).
 * dtMs is capped at 1s so a lagging client is not punished forever.
 */
export function clampMove(
  prev: { x: number; y: number },
  proposed: { x: number; y: number },
  dtMs: number,
): { x: number; y: number } {
  const dt = clamp(num(dtMs, 66), 0, 1000) / 1000;
  const allowed = MAX_SPEED * dt + 6; // +6px slack for rounding
  let x = clamp(num(proposed.x, prev.x), 0, MAP_W - PLAYER_W);
  let y = clamp(num(proposed.y, prev.y), 0, MAP_H - PLAYER_H);
  const dx = x - prev.x;
  const dy = y - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist > allowed && dist > 0) {
    const k = allowed / dist;
    x = prev.x + dx * k;
    y = prev.y + dy * k;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

export function validDir(d: unknown, fallback: string): string {
  return typeof d === "string" && (DIRS as readonly string[]).includes(d)
    ? d
    : fallback;
}

export function validAnim(a: unknown, fallback: string): string {
  return typeof a === "string" && (ANIMS as readonly string[]).includes(a)
    ? a
    : fallback;
}

/** Trim + cap chat text. Returns null when there is nothing to send. */
export function sanitizeChat(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim().slice(0, CHAT_MAX_LEN);
  return t.length > 0 ? t : null;
}

/** Trim + cap player names (max 24 chars). */
export function sanitizeName(name: unknown, fallback: string): string {
  if (typeof name !== "string") return fallback;
  const t = name.trim().slice(0, 24);
  return t.length > 0 ? t : fallback;
}
