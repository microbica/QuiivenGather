// Presence status: what each mode shows and how proximity audio treats it.
// The server allowlists the ids (validate.ts); unknown values fall back to
// "available" on both ends.

export const STATUSES = ["available", "meeting", "busy", "focus", "away"] as const;
export type PresenceStatus = (typeof STATUSES)[number];

export interface StatusMeta {
  id: PresenceStatus;
  /** Spanish label for pickers and tooltips. */
  label: string;
  /** Dot/ring/badge color (CSS + Pixi number). */
  color: string;
  colorNum: number;
  /** One-line effect description for the picker. */
  desc: string;
}

export const STATUS_META: Record<PresenceStatus, StatusMeta> = {
  available: {
    id: "available",
    label: "Disponible",
    color: "#22c55e",
    colorNum: 0x22c55e,
    desc: "Te escuchan y escuchas con normalidad.",
  },
  meeting: {
    id: "meeting",
    label: "En reunión",
    color: "#ef4444",
    colorNum: 0xef4444,
    desc: "En un Meet: no te llega ni sale voz de proximidad.",
  },
  busy: {
    id: "busy",
    label: "Ocupado",
    color: "#f59e0b",
    colorNum: 0xf59e0b,
    desc: "Te escuchan a mitad de volumen.",
  },
  focus: {
    id: "focus",
    label: "Concentrado",
    color: "#a855f7",
    colorNum: 0xa855f7,
    desc: "Nadie te escucha y no escuchas a nadie.",
  },
  away: {
    id: "away",
    label: "Ausente",
    color: "#9ca3af",
    colorNum: 0x9ca3af,
    desc: "Como concentrado; tu avatar se atenúa.",
  },
};

export function isPresenceStatus(v: unknown): v is PresenceStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/** Unknown/empty schema values fall back to "available". */
export function normalizeStatus(v: unknown): PresenceStatus {
  return isPresenceStatus(v) ? v : "available";
}

/** Can this listener hear proximity audio? meeting/focus/away go deaf. */
export function canHear(s: PresenceStatus): boolean {
  return s === "available" || s === "busy";
}

/** Does this peer emit proximity audio? meeting/focus/away are muted. */
export function emitsAudio(s: PresenceStatus): boolean {
  return s === "available" || s === "busy";
}

/** Playback gain for a peer (busy is attenuated, blocked peers are silent). */
export function gainFor(s: PresenceStatus): number {
  if (!emitsAudio(s)) return 0;
  return s === "busy" ? 0.5 : 1;
}
