// Layered pixel-art avatar painter (chibi proportions: big head, small body).
// Pure and DOM-free: it returns a grid of hex colors so it can be unit
// tested and reused by the map (Pixi texture) and the profile preview.
import type { AvatarConfig } from "./config";

export type Facing = "front" | "back" | "right" | "left";
/** 0 = standing, 1 = left foot up, 2 = right foot up. */
export type Frame = 0 | 1 | 2;

export const AVATAR_W = 16;
export const AVATAR_H = 28;
/** Brand Carbón: outlines and eyes. */
const INK = "#2c2c33";

export interface PixelGrid {
  w: number;
  h: number;
  /** Row-major; "" = transparent. */
  px: string[];
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (s: number) =>
    Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

class Canvas {
  px: string[];
  constructor(
    public w: number,
    public h: number,
  ) {
    this.px = new Array<string>(w * h).fill("");
  }
  set(x: number, y: number, c: string) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  get(x: number, y: number): string {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : "";
  }
  /** Inclusive rectangle. */
  rect(x0: number, y0: number, x1: number, y1: number, c: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  /** Horizontal run on one row. */
  row(y: number, x0: number, x1: number, c: string) {
    this.rect(x0, y, x1, y, c);
  }
}

interface Layout {
  hT: number; // head top row
  tT: number; // torso top row
  T: number; // torso rows
  lT: number; // legs top row
  L: number; // leg rows (above the shoe row)
  shoe: number; // shoe row
  hw: number; // torso half width
}

function layout(cfg: AvatarConfig): Layout {
  const T = cfg.height === "alta" ? 6 : 5;
  const L = cfg.height === "baja" ? 3 : cfg.height === "media" ? 4 : 5;
  const hw = cfg.build === "delgada" ? 3 : 4;
  const shoe = AVATAR_H - 1;
  const lT = shoe - L;
  const tT = lT - T;
  const hT = tT - 10;
  return { hT, tT, T, lT, L, shoe, hw };
}

function drawHead(c: Canvas, l: Layout, skin: string) {
  const { hT } = l;
  c.row(hT, 5, 10, skin);
  c.row(hT + 1, 4, 11, skin);
  c.rect(3, hT + 2, 12, hT + 7, skin);
  c.row(hT + 8, 4, 11, skin);
  c.row(hT + 9, 5, 10, skin);
  // Soft shadow on the right cheek.
  c.rect(12, hT + 3, 12, hT + 6, shade(skin, -0.08));
}

function drawFace(c: Canvas, l: Layout, cfg: AvatarConfig, facing: Facing) {
  const { hT } = l;
  const blush = mix(cfg.skin, "#ef7f8f", 0.35);
  const mouth = shade(cfg.skin, -0.3);
  const eyes = facing === "front" ? [5, 10] : facing === "right" ? [8, 11] : [4, 7];
  for (const x of eyes) c.rect(x, hT + 5, x, hT + 6, INK);
  if (cfg.body === "femenino") {
    if (facing === "front") {
      c.set(4, hT + 5, INK);
      c.set(11, hT + 5, INK);
    } else c.set(facing === "right" ? 12 : 3, hT + 5, INK);
  }
  if (facing === "front") {
    c.set(4, hT + 7, blush);
    c.set(11, hT + 7, blush);
    c.row(hT + 8, 7, 8, mouth);
  } else {
    const mx = facing === "right" ? 10 : 5;
    c.set(mx, hT + 8, mouth);
    c.set(facing === "right" ? 12 : 3, hT + 7, blush);
  }
}

function drawFacialHair(c: Canvas, l: Layout, cfg: AvatarConfig, facing: Facing) {
  if (cfg.facialHair === "ninguna" || facing === "back") return;
  const { hT } = l;
  const h = cfg.hairColor;
  if (cfg.facialHair === "bigote") {
    if (facing === "front") c.row(hT + 7, 6, 9, h);
    else c.row(hT + 7, facing === "right" ? 9 : 4, facing === "right" ? 11 : 6, h);
    return;
  }
  // Full beard: sideburns, jaw and chin, mouth stays visible.
  c.rect(3, hT + 5, 3, hT + 7, h);
  c.rect(12, hT + 5, 12, hT + 7, h);
  c.row(hT + 7, 4, 11, h);
  c.row(hT + 8, 4, 11, h);
  c.row(hT + 9, 5, 10, h);
  c.row(hT + 10, 6, 9, h);
  if (facing === "front") c.row(hT + 8, 7, 8, shade(cfg.skin, -0.3));
}

function hairCap(c: Canvas, l: Layout, color: string, withSides: boolean) {
  const { hT } = l;
  c.row(hT - 1, 5, 10, color);
  c.row(hT, 4, 11, color);
  c.rect(3, hT + 1, 12, hT + 2, color);
  c.row(hT + 3, 3, 5, color);
  c.row(hT + 3, 9, 12, color);
  if (withSides) {
    c.rect(3, hT + 4, 3, hT + 5, color);
    c.rect(12, hT + 4, 12, hT + 5, color);
  }
}

function drawHair(c: Canvas, l: Layout, cfg: AvatarConfig, facing: Facing) {
  const { hT, tT } = l;
  const col = cfg.hairColor;
  const hi = shade(col, 0.35);
  const back = facing === "back";
  switch (cfg.hair) {
    case "calvo":
      c.row(hT + 1, 5, 6, shade(cfg.skin, 0.18));
      return;
    case "rapado":
      c.row(hT, 5, 10, col);
      c.row(hT + 1, 4, 11, col);
      c.set(3, hT + 2, col);
      c.set(12, hT + 2, col);
      if (back) c.rect(3, hT + 2, 12, hT + 6, col);
      return;
    case "corto":
      hairCap(c, l, col, true);
      if (back) c.rect(3, hT + 3, 12, hT + 7, col);
      break;
    case "crespo":
      c.row(hT - 2, 4, 11, col);
      c.row(hT - 1, 2, 13, col);
      c.rect(1, hT, 14, hT + 3, col);
      c.rect(1, hT + 4, 2, hT + 7, col);
      c.rect(13, hT + 4, 14, hT + 7, col);
      c.row(hT + 4, 3, 4, col);
      c.row(hT + 4, 11, 12, col);
      if (back) c.rect(1, hT + 4, 14, hT + 8, col);
      // Curl texture.
      for (const [x, y] of [[3, hT], [7, hT - 1], [11, hT + 1], [5, hT + 2], [9, hT + 3]])
        c.set(x, y, shade(col, -0.18));
      break;
    case "melena":
      hairCap(c, l, col, false);
      c.row(hT + 3, 3, 12, col);
      c.rect(2, hT + 1, 3, hT + 9, col);
      c.rect(12, hT + 1, 13, hT + 9, col);
      if (back) c.rect(2, hT + 3, 13, hT + 9, col);
      break;
    case "largo":
      hairCap(c, l, col, false);
      c.rect(2, hT + 1, 3, tT + 3, col);
      c.rect(12, hT + 1, 13, tT + 3, col);
      if (back) c.rect(2, hT + 3, 13, tT + 3, col);
      break;
    case "cola":
      hairCap(c, l, col, false);
      if (back) {
        c.rect(3, hT + 3, 12, hT + 6, col);
        c.rect(7, hT + 7, 8, tT + 2, col);
      } else if (facing === "front") {
        c.rect(13, hT + 2, 14, hT + 6, col);
      } else {
        const x = facing === "right" ? 1 : 13;
        c.rect(x, hT + 2, x + 1, tT + 1, col);
      }
      break;
    case "mono":
      hairCap(c, l, col, false);
      c.row(hT - 4, 6, 9, col);
      c.rect(5, hT - 3, 10, hT - 2, col);
      if (back) c.rect(3, hT + 3, 12, hT + 6, col);
      break;
  }
  if (!back) c.row(hT, 5, 6, hi);
  else c.row(hT, 6, 9, hi);
}

function drawAccessory(c: Canvas, l: Layout, cfg: AvatarConfig, facing: Facing) {
  const { hT } = l;
  if (cfg.accessory === "audifonos") {
    c.row(hT - 2, 5, 10, INK);
    c.set(4, hT - 1, INK);
    c.set(11, hT - 1, INK);
    c.rect(2, hT + 3, 3, hT + 6, INK);
    c.rect(12, hT + 3, 13, hT + 6, INK);
    c.set(2, hT + 4, "#18d3b8");
    c.set(13, hT + 4, "#18d3b8");
    return;
  }
  if (cfg.accessory === "gafas" && facing !== "back") {
    const lens = "#cfe7f5";
    if (facing === "front") {
      for (const x0 of [4, 9]) {
        c.row(hT + 4, x0, x0 + 2, INK);
        c.set(x0, hT + 5, INK);
        c.set(x0 + 2, hT + 5, INK);
        c.set(x0 + 1, hT + 6, lens);
      }
      c.row(hT + 4, 7, 8, INK);
    } else {
      const x0 = facing === "right" ? 9 : 4;
      c.row(hT + 4, x0, x0 + 2, INK);
      c.set(x0, hT + 5, INK);
      c.set(x0 + 2, hT + 5, INK);
      c.row(hT + 4, facing === "right" ? 4 : 7, facing === "right" ? 8 : 11, INK);
    }
  }
}

function drawTorsoAndArms(c: Canvas, l: Layout, cfg: AvatarConfig, facing: Facing) {
  const { tT, T, hw } = l;
  const x0 = 8 - hw;
  const x1 = 7 + hw;
  const top = cfg.topColor;
  const dark = shade(top, -0.18);
  const longSleeves = cfg.top === "camisa" || cfg.top === "buzo";
  const sleeveRows = longSleeves ? T - 2 : 1;

  // Arms (behind the torso edges).
  const arms = facing === "front" || facing === "back" ? [x0 - 2, x1 + 1] : [facing === "right" ? 6 : 8];
  for (const ax of arms) {
    for (let y = tT; y < tT + T; y++) {
      const isHand = y === tT + T - 1;
      const sleeve = y - tT <= sleeveRows;
      const color = isHand ? cfg.skin : sleeve ? top : cfg.skin;
      c.rect(ax, y, ax + 1, y, color);
    }
  }
  if (cfg.body === "femenino" && (facing === "front" || facing === "back")) {
    c.set(x0 - 2, tT, "");
    c.set(x1 + 2, tT, "");
  }

  // Torso.
  c.rect(x0, tT, x1, tT + T - 1, top);
  if (cfg.build === "robusta") {
    c.rect(x0 - 1, tT + 2, x0 - 1, tT + T - 2, top);
    c.rect(x1 + 1, tT + 2, x1 + 1, tT + T - 2, top);
  }
  c.rect(x1, tT + 1, x1, tT + T - 1, dark);

  if (facing === "back") {
    if (cfg.top === "buzo") c.row(tT, x0 + 1, x1 - 1, dark); // hood
    return;
  }
  const cx = facing === "front" ? 7 : facing === "right" ? 8 : 6;
  switch (cfg.top) {
    case "camiseta":
      c.row(tT, cx, cx + 1, cfg.skin);
      break;
    case "camisa":
      c.set(cx - 1, tT, "#f4f4f6");
      c.set(cx + 2, tT, "#f4f4f6");
      c.row(tT, cx, cx + 1, cfg.skin);
      for (let y = tT + 1; y < tT + T; y += 2) c.set(cx + 1, y, dark);
      break;
    case "buzo":
      c.set(cx, tT + 1, "#f4f4f6");
      c.set(cx + 1, tT + 1, "#f4f4f6");
      c.row(tT + T - 2, x0 + 1, x1 - 1, dark);
      break;
    case "blusa":
      c.row(tT, cx, cx + 1, cfg.skin);
      c.row(tT + 1, cx, cx + 1, cfg.skin);
      c.row(tT + T - 1, x0, x1, dark);
      break;
    case "vestido":
      c.row(tT, cx, cx + 1, cfg.skin);
      c.row(tT + 2, x0, x1, dark);
      break;
  }
}

function drawLegs(c: Canvas, l: Layout, cfg: AvatarConfig, facing: Facing, frame: Frame) {
  const { lT, L, shoe, hw } = l;
  const x0 = 8 - hw;
  const x1 = 7 + hw;
  const dress = cfg.top === "vestido";
  const skirtColor = dress ? cfg.topColor : cfg.bottomColor;
  const skirt = dress || cfg.bottom === "falda";
  const shortRows = cfg.bottom === "short" ? 1 : L;
  const pants = cfg.bottomColor;

  // Side view: legs overlap into a single column pair.
  const legs: [number, number, number][] =
    facing === "front" || facing === "back"
      ? [
          [x0, 7 - (hw > 3 ? 1 : 0), frame === 1 ? 1 : 0],
          [8 + (hw > 3 ? 1 : 0), x1, frame === 2 ? 1 : 0],
        ]
      : [[6, 9, frame === 0 ? 0 : 1]];

  // Hip row spans the full torso width.
  c.row(lT, x0, x1, skirt ? skirtColor : pants);
  for (const [a, b, lift] of legs) {
    for (let y = lT + 1; y < lT + L; y++) {
      const covered = !skirt && y - lT < shortRows;
      c.row(y - (y >= shoe - lift ? lift : 0), a, b, covered ? pants : cfg.skin);
    }
    // Shoe, raised one row when that foot is lifted.
    const sy = shoe - lift;
    const toe = facing === "right" ? 1 : facing === "left" ? -1 : 0;
    c.row(sy, Math.min(a, a + toe), Math.max(b, b + toe), cfg.shoesColor);
  }
  if (skirt) {
    const rows = Math.min(2, L);
    for (let y = lT; y < lT + rows; y++) c.row(y, x0 - (y - lT), x1 + (y - lT), skirtColor);
    c.row(lT + rows - 1, x0 - rows + 1, x1 + rows - 1, shade(skirtColor, -0.15));
  } else if (cfg.bottom === "jean") {
    c.set(x0, lT, shade(pants, 0.25));
    c.set(x1, lT, shade(pants, 0.25));
  }
}

function outline(c: Canvas) {
  const filled = c.px.map((p) => p !== "");
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (filled[y * c.w + x]) continue;
      const near =
        (x > 0 && filled[y * c.w + x - 1]) ||
        (x < c.w - 1 && filled[y * c.w + x + 1]) ||
        (y > 0 && filled[(y - 1) * c.w + x]) ||
        (y < c.h - 1 && filled[(y + 1) * c.w + x]);
      if (near) c.set(x, y, INK);
    }
  }
}

/**
 * Paints the avatar. Layers go back to front: long hair behind, legs, arms
 * and torso, head, face, facial hair, hair, accessories, then a Carbón outline.
 */
export function paintAvatar(cfg: AvatarConfig, facing: Facing = "front", frame: Frame = 0): PixelGrid {
  const c = new Canvas(AVATAR_W, AVATAR_H);
  const l = layout(cfg);
  const longHair = cfg.hair === "largo" && facing !== "back";
  if (longHair) {
    c.rect(2, l.hT + 4, 13, l.tT + 3, cfg.hairColor);
  }
  drawLegs(c, l, cfg, facing, frame);
  drawTorsoAndArms(c, l, cfg, facing);
  drawHead(c, l, cfg.skin);
  if (facing !== "back") drawFace(c, l, cfg, facing);
  drawFacialHair(c, l, cfg, facing);
  drawHair(c, l, cfg, facing);
  drawAccessory(c, l, cfg, facing);
  outline(c);
  return { w: c.w, h: c.h, px: c.px };
}

/** Converts a grid to a canvas (1 px per cell; scale it with CSS/Pixi). */
export function gridToCanvas(grid: PixelGrid, doc: Document = document): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = grid.w;
  canvas.height = grid.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  for (let i = 0; i < grid.px.length; i++) {
    const p = grid.px[i];
    if (!p) continue;
    ctx.fillStyle = p;
    ctx.fillRect(i % grid.w, Math.floor(i / grid.w), 1, 1);
  }
  return canvas;
}
