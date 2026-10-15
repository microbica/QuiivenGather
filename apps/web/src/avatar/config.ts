// Avatar configuration: the catalog of options a person can pick in their
// profile, plus helpers to validate, randomize and persist a choice.

export type Body = "femenino" | "masculino";
export type Height = "baja" | "media" | "alta";
export type Build = "delgada" | "media" | "robusta";
export type HairStyle =
  | "calvo"
  | "rapado"
  | "corto"
  | "crespo"
  | "melena"
  | "largo"
  | "cola"
  | "mono";
export type FacialHair = "ninguna" | "bigote" | "barba";
export type Top = "camiseta" | "camisa" | "buzo" | "blusa" | "vestido";
export type Bottom = "pantalon" | "jean" | "falda" | "short";
export type Accessory = "ninguno" | "gafas" | "audifonos";

export interface AvatarConfig {
  body: Body;
  height: Height;
  build: Build;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  facialHair: FacialHair;
  top: Top;
  topColor: string;
  bottom: Bottom;
  bottomColor: string;
  shoesColor: string;
  accessory: Accessory;
}

export interface Option<T extends string> {
  id: T;
  label: string;
}

export const BODIES: Option<Body>[] = [
  { id: "femenino", label: "Femenino" },
  { id: "masculino", label: "Masculino" },
];
export const HEIGHTS: Option<Height>[] = [
  { id: "baja", label: "Baja" },
  { id: "media", label: "Media" },
  { id: "alta", label: "Alta" },
];
export const BUILDS: Option<Build>[] = [
  { id: "delgada", label: "Delgada" },
  { id: "media", label: "Media" },
  { id: "robusta", label: "Robusta" },
];
export const HAIR_STYLES: Option<HairStyle>[] = [
  { id: "calvo", label: "Calvo" },
  { id: "rapado", label: "Rapado" },
  { id: "corto", label: "Corto" },
  { id: "crespo", label: "Crespo" },
  { id: "melena", label: "Melena" },
  { id: "largo", label: "Largo" },
  { id: "cola", label: "Cola" },
  { id: "mono", label: "Moño" },
];
export const FACIAL_HAIR: Option<FacialHair>[] = [
  { id: "ninguna", label: "Sin barba" },
  { id: "bigote", label: "Bigote" },
  { id: "barba", label: "Barba" },
];
export const TOPS: Option<Top>[] = [
  { id: "camiseta", label: "Camiseta" },
  { id: "camisa", label: "Camisa" },
  { id: "buzo", label: "Buzo" },
  { id: "blusa", label: "Blusa" },
  { id: "vestido", label: "Vestido" },
];
export const BOTTOMS: Option<Bottom>[] = [
  { id: "pantalon", label: "Pantalón" },
  { id: "jean", label: "Jean" },
  { id: "falda", label: "Falda" },
  { id: "short", label: "Short" },
];
export const ACCESSORIES: Option<Accessory>[] = [
  { id: "ninguno", label: "Ninguno" },
  { id: "gafas", label: "Gafas" },
  { id: "audifonos", label: "Audífonos" },
];

/** Skin tones from light to deep. */
export const SKIN_TONES = ["#ffe1c9", "#f6c9a3", "#e3aa80", "#c98a5c", "#9c6440", "#6b432a"];
/** Natural hair colors first, then a few playful ones. */
export const HAIR_COLORS = [
  "#1f1b1c",
  "#4a2e22",
  "#7a4a2c",
  "#b07a45",
  "#e2c07a",
  "#b5452a",
  "#a9a9b2",
  "#f4f4f6",
  "#18d3b8",
  "#349ce2",
  "#e66fa6",
  "#8a5cd6",
];
/** Clothes: Quiiven area colors, then neutrals and a few extras. */
export const CLOTH_COLORS = [
  "#ffae00",
  "#18d3b8",
  "#349ce2",
  "#ff7442",
  "#0ead9a",
  "#066abc",
  "#2c2c33",
  "#f4f4f6",
  "#a9a9b2",
  "#c94f6d",
  "#7c5cc4",
  "#5d8a3a",
];
export const DENIM = "#3c5d8f";
export const SHOE_COLORS = ["#2c2c33", "#f4f4f6", "#6b432a", "#ffae00", "#349ce2"];

export const DEFAULT_AVATAR: AvatarConfig = {
  body: "femenino",
  height: "media",
  build: "media",
  skin: SKIN_TONES[2],
  hair: "melena",
  hairColor: HAIR_COLORS[1],
  facialHair: "ninguna",
  top: "camiseta",
  topColor: CLOTH_COLORS[1],
  bottom: "jean",
  bottomColor: DENIM,
  shoesColor: SHOE_COLORS[0],
  accessory: "ninguno",
};

const HEX = /^#[0-9a-f]{6}$/i;

function pick<T extends string>(opts: Option<T>[], v: unknown, fallback: T): T {
  return opts.some((o) => o.id === v) ? (v as T) : fallback;
}
function color(v: unknown, fallback: string): string {
  return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback;
}

/** Accepts anything (stored JSON, network data) and returns a safe config. */
export function sanitizeAvatar(raw: unknown): AvatarConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_AVATAR;
  return {
    body: pick(BODIES, r.body, d.body),
    height: pick(HEIGHTS, r.height, d.height),
    build: pick(BUILDS, r.build, d.build),
    skin: color(r.skin, d.skin),
    hair: pick(HAIR_STYLES, r.hair, d.hair),
    hairColor: color(r.hairColor, d.hairColor),
    facialHair: pick(FACIAL_HAIR, r.facialHair, d.facialHair),
    top: pick(TOPS, r.top, d.top),
    topColor: color(r.topColor, d.topColor),
    bottom: pick(BOTTOMS, r.bottom, d.bottom),
    bottomColor: color(r.bottomColor, d.bottomColor),
    shoesColor: color(r.shoesColor, d.shoesColor),
    accessory: pick(ACCESSORIES, r.accessory, d.accessory),
  };
}

/** Small deterministic PRNG so the same seed always gives the same avatar. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Random avatar; pass a seed (e.g. a name) to make it deterministic. */
export function randomAvatar(seed?: string): AvatarConfig {
  const rnd = mulberry32(seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : hashString(seed));
  const one = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const body = one(BODIES).id;
  const naturalHair = HAIR_COLORS.slice(0, 8);
  return {
    body,
    height: one(HEIGHTS).id,
    build: one(BUILDS).id,
    skin: one(SKIN_TONES),
    hair: one(HAIR_STYLES).id,
    hairColor: rnd() < 0.85 ? one(naturalHair) : one(HAIR_COLORS),
    facialHair: body === "masculino" && rnd() < 0.4 ? one(FACIAL_HAIR.slice(1)).id : "ninguna",
    top: body === "femenino" ? one(TOPS).id : one(TOPS.filter((t) => t.id !== "vestido")).id,
    topColor: one(CLOTH_COLORS),
    bottom: one(BOTTOMS).id,
    bottomColor: rnd() < 0.5 ? DENIM : one(CLOTH_COLORS),
    shoesColor: one(SHOE_COLORS),
    accessory: rnd() < 0.7 ? "ninguno" : one(ACCESSORIES.slice(1)).id,
  };
}

const STORAGE_KEY = "quiiven.avatar.v1";

export function loadAvatar(): AvatarConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeAvatar(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveAvatar(cfg: AvatarConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* storage unavailable: the choice lives only for this session */
  }
}

/** Stable key used to cache rendered textures. */
export function avatarKey(cfg: AvatarConfig): string {
  return JSON.stringify(cfg);
}
