// "Mi escritorio": a desk a person claims and decorates. Painted as pixel art
// (1 cell = 2 map px, so a 2x1-tile desk is a 32x16 grid) to match avatars.

export type DeskMaterial = "clara" | "roble" | "blanco" | "carbon";
export type DeskItem =
  | "ninguno"
  | "suculenta"
  | "monstera"
  | "cactus"
  | "flores"
  | "lampara"
  | "libros"
  | "foto"
  | "taza"
  | "patito"
  | "bandera-col"
  | "bandera-gt"
  | "bandera-mx"
  | "monitor";

export interface DeskCustom {
  /** Decor id of the desk in the map (stable, from the generator). */
  deskId: number;
  material: DeskMaterial;
  chairColor: string;
  left: DeskItem;
  right: DeskItem;
}

export const DESK_MATERIALS: { id: DeskMaterial; label: string; top: string }[] = [
  { id: "clara", label: "Madera clara", top: "#f1e6d3" },
  { id: "roble", label: "Roble", top: "#c89b6d" },
  { id: "blanco", label: "Blanco", top: "#fafafa" },
  { id: "carbon", label: "Carbón", top: "#4a4a55" },
];
export const DESK_ITEMS: { id: DeskItem; label: string; group: "Plantas" | "Objetos" | "Bandera" }[] = [
  { id: "suculenta", label: "Suculenta", group: "Plantas" },
  { id: "monstera", label: "Monstera", group: "Plantas" },
  { id: "cactus", label: "Cactus", group: "Plantas" },
  { id: "flores", label: "Flores", group: "Plantas" },
  { id: "lampara", label: "Lámpara", group: "Objetos" },
  { id: "libros", label: "Libros", group: "Objetos" },
  { id: "foto", label: "Foto", group: "Objetos" },
  { id: "taza", label: "Taza", group: "Objetos" },
  { id: "patito", label: "Patito", group: "Objetos" },
  { id: "monitor", label: "2º monitor", group: "Objetos" },
  { id: "bandera-col", label: "Colombia", group: "Bandera" },
  { id: "bandera-gt", label: "Guatemala", group: "Bandera" },
  { id: "bandera-mx", label: "México", group: "Bandera" },
];
/** Chair colors: Quiiven area colors plus neutrals. */
export const CHAIR_COLORS = ["#ffae00", "#18d3b8", "#349ce2", "#ff7442", "#2c2c33", "#a9a9b2", "#e66fa6", "#7c5cc4"];

export const DESK_W = 32;
export const DESK_H = 16;
const INK = "#2c2c33";

export function defaultDesk(deskId: number, areaColor = "#18d3b8"): DeskCustom {
  return { deskId, material: "clara", chairColor: areaColor, left: "suculenta", right: "taza" };
}

/** Paints one item into a 9x11 cell box whose bottom-left is (x, y). */
function paintItem(set: (x: number, y: number, c: string) => void, item: DeskItem, x: number, y: number) {
  const r = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) set(x + xx, y - yy, c);
  };
  switch (item) {
    case "suculenta":
      r(2, 0, 6, 2, "#f4f4f6");
      r(1, 3, 7, 4, "#3fbf78");
      r(3, 5, 5, 6, "#2e9e63");
      set(x + 4, y - 7, "#3fbf78");
      break;
    case "monstera":
      r(2, 0, 6, 2, INK);
      r(0, 4, 3, 7, "#2e9e63");
      r(5, 5, 8, 8, "#2e9e63");
      r(3, 7, 5, 10, "#3fbf78");
      r(4, 3, 4, 6, "#2e9e63");
      break;
    case "cactus":
      r(2, 0, 6, 2, "#dd582f");
      r(3, 3, 5, 9, "#3fbf78");
      r(1, 5, 2, 7, "#3fbf78");
      r(6, 6, 7, 8, "#3fbf78");
      set(x + 4, y - 10, "#e66fa6");
      break;
    case "flores":
      r(2, 0, 6, 3, "#6cc9e8");
      r(3, 4, 3, 6, "#2e9e63");
      r(5, 4, 5, 7, "#2e9e63");
      r(2, 7, 3, 8, "#ffae00");
      r(5, 8, 6, 9, "#ff7442");
      r(4, 6, 4, 6, "#e66fa6");
      break;
    case "lampara":
      r(2, 0, 6, 0, INK);
      r(4, 1, 4, 6, INK);
      r(2, 7, 7, 9, "#ffae00");
      r(3, 6, 6, 6, "#fff4c2");
      break;
    case "libros":
      r(0, 0, 7, 1, "#349ce2");
      r(1, 2, 7, 3, "#ffae00");
      r(0, 4, 6, 5, "#18d3b8");
      r(1, 6, 6, 7, "#ff7442");
      break;
    case "foto":
      r(1, 0, 7, 7, INK);
      r(2, 1, 6, 6, "#a9e3f4");
      r(2, 1, 6, 2, "#3fbf78");
      r(5, 4, 5, 5, "#ffae00");
      break;
    case "taza":
      r(2, 0, 6, 5, "#f4f4f6");
      r(3, 5, 5, 5, "#7a4a2c");
      r(7, 2, 7, 3, "#f4f4f6");
      set(x + 3, y - 7, "#d8d8de");
      set(x + 5, y - 8, "#d8d8de");
      break;
    case "patito":
      r(1, 0, 6, 3, "#ffd23f");
      r(4, 4, 6, 6, "#ffd23f");
      set(x + 7, y - 5, "#ff7442");
      set(x + 5, y - 5, INK);
      break;
    case "bandera-col":
    case "bandera-gt":
    case "bandera-mx": {
      r(1, 0, 4, 0, INK);
      r(2, 1, 2, 9, INK);
      const stripes =
        item === "bandera-col"
          ? ["#ffd23f", "#ffd23f", "#2f5fb3", "#d63b3b"]
          : item === "bandera-gt"
            ? ["#4aa3e0", "#ffffff", "#4aa3e0"]
            : ["#2e9e63", "#ffffff", "#d63b3b"];
      if (item === "bandera-col") stripes.forEach((c, i) => r(3, 9 - i, 8, 9 - i, c));
      else stripes.forEach((c, i) => r(3 + i * 2, 6, 4 + i * 2, 9, c));
      break;
    }
    case "monitor":
      r(3, 0, 5, 1, INK);
      r(0, 2, 8, 7, INK);
      r(1, 3, 7, 6, "#349ce2");
      break;
    case "ninguno":
      break;
  }
}

/**
 * Paints the claimed desk. facing "down" = chair above, screen at the bottom
 * edge (seen from the person's side); "up" = mirrored vertically.
 */
export function paintDesk(custom: DeskCustom, facing: "down" | "up", glow = "#18d3b8"): { w: number; h: number; px: string[] } {
  const w = DESK_W;
  const h = DESK_H;
  const px = new Array<string>(w * h).fill("");
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c;
  };
  const top = DESK_MATERIALS.find((m) => m.id === custom.material)?.top ?? "#f1e6d3";
  // Desk surface with a 1-cell Carbón border and rounded corners.
  for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) set(x, y, top);
  for (let x = 1; x < w - 1; x++) {
    set(x, 0, top);
    set(x, h - 1, top);
  }
  // Main monitor in the middle, keyboard toward the chair.
  const far = facing === "down" ? h - 4 : 1;
  for (let x = 12; x <= 19; x++) for (let y = far; y <= far + 2; y++) set(x, y, INK);
  for (let x = 13; x <= 18; x++) set(x, facing === "down" ? far : far + 2, glow);
  const kb = facing === "down" ? 3 : h - 5;
  for (let x = 13; x <= 18; x++) for (let y = kb; y <= kb + 1; y++) set(x, y, "#d8d8de");
  // Name-plate dot strip toward the chair side.
  // Items: left and right slots, standing on the far edge so they read from above.
  const base = facing === "down" ? h - 2 : 12;
  paintItem(set, custom.left, 1, base);
  paintItem(set, custom.right, 22, base);
  // Outline everything in Carbón (inside the grid; the desk edge is the border).
  const filled = px.map((p) => p !== "");
  const out = px.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!filled[i]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) out[i] = INK;
    }
  return { w, h, px: out };
}

const STORAGE_KEY = "quiiven.desk.v1";
const ITEM_IDS = new Set(DESK_ITEMS.map((i) => i.id).concat("ninguno"));
const MATERIAL_IDS = new Set(DESK_MATERIALS.map((m) => m.id));

export function sanitizeDesk(raw: unknown): DeskCustom | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.deskId !== "number" || !Number.isFinite(r.deskId)) return null;
  const item = (v: unknown): DeskItem => (typeof v === "string" && ITEM_IDS.has(v as DeskItem) ? (v as DeskItem) : "ninguno");
  return {
    deskId: r.deskId,
    material: typeof r.material === "string" && MATERIAL_IDS.has(r.material as DeskMaterial) ? (r.material as DeskMaterial) : "clara",
    chairColor: typeof r.chairColor === "string" && /^#[0-9a-f]{6}$/i.test(r.chairColor) ? r.chairColor : CHAIR_COLORS[1],
    left: item(r.left),
    right: item(r.right),
  };
}

export function loadDesk(): DeskCustom | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeDesk(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveDesk(desk: DeskCustom | null): void {
  try {
    if (desk) localStorage.setItem(STORAGE_KEY, JSON.stringify(desk));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
