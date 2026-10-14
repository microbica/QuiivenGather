// Smart Objects registry + proximity detection (Fase 4, pure, tested).
// An object activates when the avatar center is within `radius` px of its rect.

export type SmartKind = "meet" | "board" | "generic";

export interface SmartObject {
  id: string;
  label: string;
  kind: SmartKind;
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  url: string;
}

const KINDS: SmartKind[] = ["meet", "board", "generic"];

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Validate raw registry entries. `meetUrl` (from VITE_MEET_URL) overrides
 * the url of every `meet` object — real Meet links are per-meeting.
 */
export function resolveObjects(raw: unknown, meetUrl: string): SmartObject[] {
  if (!Array.isArray(raw)) return [];
  const out: SmartObject[] = [];
  for (const o of raw) {
    if (typeof o !== "object" || o === null) continue;
    const r = o as Record<string, unknown>;
    const kind: SmartKind = KINDS.includes(r.kind as SmartKind)
      ? (r.kind as SmartKind)
      : "generic";
    const id = str(r.id).trim();
    if (!id) continue;
    out.push({
      id,
      label: str(r.label, id),
      kind,
      x: num(r.x),
      y: num(r.y),
      w: Math.max(8, num(r.w, 32)),
      h: Math.max(8, num(r.h, 32)),
      radius: Math.max(16, num(r.radius, 96)),
      url: kind === "meet" && meetUrl ? meetUrl : str(r.url),
    });
  }
  return out;
}

export function distToRect(px: number, py: number, o: SmartObject): number {
  const dx = Math.max(o.x - px, 0, px - (o.x + o.w));
  const dy = Math.max(o.y - py, 0, py - (o.y + o.h));
  return Math.hypot(dx, dy);
}

/** Closest object within its radius, or null. */
export function nearestObject(
  pos: { x: number; y: number },
  objects: SmartObject[],
): SmartObject | null {
  let best: SmartObject | null = null;
  let bestD = Infinity;
  for (const o of objects) {
    const d = distToRect(pos.x, pos.y, o);
    if (d <= o.radius && d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

/** Origin for postMessage validation + iframe targetOrigin. "" if invalid. */
export function objectOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
