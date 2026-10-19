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
// sit/drink/stretch: poses from using furniture (chairs, coffee, mats).
export const ANIMS = ["idle", "walk", "sit", "drink", "stretch"] as const;

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

export const SIGNAL_KINDS = ["offer", "answer", "ice"] as const;

export const OBJECT_KINDS = [
  "meet",
  "board",
  "generic",
  "wall",
  "window",
  "door",
] as const;
export const OBJECT_MATERIALS = ["wood", "metal", "glass", "stone"] as const;
export const OBJECT_ROTATIONS = [0, 90, 180, 270] as const;

export function validKind(k: unknown): string {
  if (typeof k !== "string") return "generic";
  return (OBJECT_KINDS as readonly string[]).includes(k) ? k : "generic";
}

export function validMaterial(m: unknown): string {
  if (typeof m !== "string") return "wood";
  return (OBJECT_MATERIALS as readonly string[]).includes(m) ? m : "wood";
}

/** Snap rotación a múltiplo de 30° y normaliza a [0, 360). */
export function validRotation(r: unknown): number {
  const n = Number(r);
  if (!Number.isFinite(n)) return 0;
  const snapped = Math.round(n / 30) * 30;
  return ((snapped % 360) + 360) % 360;
}

export interface RelaySignal {
  to: string;
  kind: string;
  sdp?: unknown;
  candidate?: unknown;
}

/**
 * Valida un mensaje de señalización: destino conectado y kind conocido.
 * El contenido (sdp/candidate) se reenvía opaco, con tope de tamaño.
 */
export function validSignal(
  msg: { to?: unknown; kind?: unknown; sdp?: unknown; candidate?: unknown },
  sessions: Set<string> | Map<string, unknown>,
): RelaySignal | null {
  if (typeof msg.to !== "string" || !sessions.has(msg.to)) return null;
  if (typeof msg.kind !== "string" || !(SIGNAL_KINDS as readonly string[]).includes(msg.kind)) {
    return null;
  }
  const body = JSON.stringify(msg.sdp ?? msg.candidate ?? "");
  if (body.length > 8192) return null;
  return { to: msg.to, kind: msg.kind, sdp: msg.sdp, candidate: msg.candidate };
}

/** Estados de presencia (mirror de apps/web game/status.ts). */
export const STATUSES = ["available", "meeting", "busy", "focus", "away"] as const;

/** Allowlist de presencia; lo desconocido cae a "available". */
export function sanitizeStatus(s: unknown): string {
  return typeof s === "string" && (STATUSES as readonly string[]).includes(s)
    ? s
    : "available";
}

/** Pizarras colaborativas (mirror de apps/web game/boards.ts). */
export const BOARD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const BOARD_MAX_ELEMENTS = 5000;

export function validBoardId(id: unknown): string | null {
  return typeof id === "string" && BOARD_ID_RE.test(id) ? id : null;
}

/** Documento de escena Excalidraw mínimo: objeto con elements acotado. */
export function validBoardDoc(scene: unknown): boolean {
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) return false;
  const elements = (scene as { elements?: unknown }).elements;
  return Array.isArray(elements) && elements.length <= BOARD_MAX_ELEMENTS;
}

export interface BoardSceneMsg {
  boardId: string;
  elements: readonly unknown[];
}

/**
 * Valida el relay de pizarra: id conocido y elementos acotados.
 * El contenido se reenvía opaco (igual que la señalización WebRTC).
 */
export function sanitizeBoardScene(msg: {
  boardId?: unknown;
  elements?: unknown;
}): BoardSceneMsg | null {
  const boardId = validBoardId(msg?.boardId);
  if (!boardId) return null;
  if (!Array.isArray(msg.elements) || msg.elements.length > BOARD_MAX_ELEMENTS) {
    return null;
  }
  return { boardId, elements: msg.elements };
}

/** Trim + cap zone ids reportadas por el cliente (max 32 chars). */
export function sanitizeZone(zone: unknown): string {
  if (typeof zone !== "string") return "";
  return zone.trim().slice(0, 32);
}
/** Trim + cap player names (max 24 chars). */
export function sanitizeName(name: unknown, fallback: string): string {
  if (typeof name !== "string") return fallback;
  const t = name.trim().slice(0, 24);
  return t.length > 0 ? t : fallback;
}

// Avatar catalog (mirrors apps/web avatar/config.ts). The server allowlists
// every field so clients cannot inject garbage into everyone's synced state.
const AVATAR_ENUMS: Record<string, readonly string[]> = {
  body: ["femenino", "masculino"],
  height: ["baja", "media", "alta"],
  build: ["delgada", "media", "robusta"],
  hair: ["calvo", "rapado", "corto", "crespo", "melena", "largo", "cola", "mono"],
  facialHair: ["ninguna", "bigote", "barba"],
  top: ["camiseta", "camisa", "buzo", "blusa", "vestido"],
  bottom: ["pantalon", "jean", "falda", "short"],
  pet: [
    "ninguna", "perro", "gato", "conejo", "loro", "vaca", "caballo",
    "cerdo", "oveja", "cabra", "pato", "gallina", "llama",
  ],
};
const AVATAR_ACCESSORIES = [
  "gafas", "gafas-sol", "audifonos", "gorra", "gorro", "bufanda", "lazo",
] as const;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export interface SanitizedAvatar {
  body: string;
  height: string;
  build: string;
  skin: string;
  hair: string;
  hairColor: string;
  facialHair: string;
  top: string;
  topColor: string;
  bottom: string;
  bottomColor: string;
  shoesColor: string;
  pet: string;
  petColor: string;
  accessories: string[];
}

/** Allowlist a client-reported avatar; unknown/invalid values become "". */
export function sanitizeAvatarMsg(raw: unknown): SanitizedAvatar {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (key: string): string => {
    const v = r[key];
    return typeof v === "string" && (AVATAR_ENUMS[key] as readonly string[]).includes(v) ? v : "";
  };
  const color = (key: string): string => {
    const v = r[key];
    return typeof v === "string" && HEX_COLOR.test(v) ? v.toLowerCase() : "";
  };
  const accessories = Array.isArray(r.accessories)
    ? [...new Set(
        r.accessories.filter(
          (a): a is string =>
            typeof a === "string" && (AVATAR_ACCESSORIES as readonly string[]).includes(a),
        ),
      )]
    : [];
  return {
    body: pick("body"),
    height: pick("height"),
    build: pick("build"),
    skin: color("skin"),
    hair: pick("hair"),
    hairColor: color("hairColor"),
    facialHair: pick("facialHair"),
    top: pick("top"),
    topColor: color("topColor"),
    bottom: pick("bottom"),
    bottomColor: color("bottomColor"),
    shoesColor: color("shoesColor"),
    pet: pick("pet"),
    petColor: color("petColor"),
    accessories,
  };
}

/** Desk ids come from the map generator: 100000 + tileX * 100 + tileY. */
export function validDeskId(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 100000 && v < 200000 ? v : null;
}

const DESK_KEYS = ["material", "setup", "chairStyle", "chairColor", "left", "right", "floor"] as const;

/**
 * Desk decoration: only known keys with short slug values (or #rrggbb for
 * the chair color). The client keeps the catalog; unknown slugs render as
 * "nothing", so the server only needs to bound the shape and size.
 */
export function sanitizeDeskConfig(raw: unknown): string {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const k of DESK_KEYS) {
      const v = r[k];
      if (typeof v !== "string") continue;
      if (k === "chairColor" ? /^#[0-9a-f]{6}$/i.test(v) : /^[a-z0-9-]{1,24}$/.test(v)) out[k] = v;
    }
  }
  return JSON.stringify(out);
}
