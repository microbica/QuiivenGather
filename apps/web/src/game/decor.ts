// Procedural furniture for the Quiiven office (no external assets).
// Flat colors with a Carbón outline so it sits with the pixel-art avatars.
import { Container, Graphics, Text } from "pixi.js";
import type { DecorItem } from "./mapLoader";

const INK = 0x2c2c33;
const AREA_STRIPES = [0xffae00, 0x18d3b8, 0x349ce2, 0xff7442];
const FONT = "Cera Pro, Montserrat, sans-serif";

const hex = (c: string | undefined, fallback: number): number =>
  c && /^#[0-9a-f]{6}$/i.test(c) ? parseInt(c.slice(1), 16) : fallback;

/** Light colors get Carbón text; dark ones get white. */
function readableOn(color: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? INK : 0xffffff;
}

function label(text: string, size: number, fill: number, weight: "500" | "700" = "700"): Text {
  return new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: weight, fill }, resolution: 2 });
}

function chair(g: Graphics, x: number, y: number, w: number, color: number) {
  g.roundRect(x, y, w, 14, 5).fill({ color: 0x4a4a55 }).stroke({ color: INK, width: 1 });
  g.roundRect(x + 3, y + 3, w - 6, 8, 3).fill({ color });
}

function plant(g: Graphics, x: number, y: number) {
  g.roundRect(x + 10, y + 18, 12, 11, 3).fill({ color: 0xf4f4f6 }).stroke({ color: INK, width: 1 });
  g.circle(x + 16, y + 13, 9).fill({ color: 0x2e9e63 }).stroke({ color: INK, width: 1 });
  g.circle(x + 11, y + 10, 5).fill({ color: 0x3fbf78 });
  g.circle(x + 20, y + 8, 4).fill({ color: 0x3fbf78 });
}

/**
 * Draws one decor item. Returns what goes below avatars and, for tall things
 * like tree canopies, what goes above them.
 */
export function drawDecor(d: DecorItem): { below: Container; above?: Container } {
  const below = new Container();
  const g = new Graphics();
  below.addChild(g);
  below.position.set(d.x, d.y);
  const { w, h } = d;
  const color = hex(d.props.color, INK);
  const multi = d.props.color === "gradient";

  switch (d.type) {
    case "plate": {
      const bg = multi ? INK : color;
      const t = label(d.label, 10, readableOn(bg));
      const pw = Math.min(t.width + 16, Math.max(w, 64));
      g.roundRect(2, 7, pw, 19, 9).fill({ color: bg }).stroke({ color: INK, width: 1, alpha: 0.4 });
      if (multi) AREA_STRIPES.forEach((c, i) => g.rect(10 + i * ((pw - 16) / 4), 23, (pw - 16) / 4, 2).fill({ color: c }));
      t.position.set(10, 10);
      below.addChild(t);
      break;
    }
    case "rug":
      g.roundRect(-4, -2, w + 8, h + 4, 10).fill({ color, alpha: 0.1 }).stroke({ color, width: 2, alpha: 0.35 });
      break;
    case "desk": {
      const exec = d.props.exec === "true";
      const top = exec ? 0x6b4a32 : 0xf1e6d3;
      g.roundRect(1, 2, w - 2, h - 4, 4).fill({ color: top }).stroke({ color: INK, width: 1.2 });
      const down = d.props.facing === "down";
      // Monitor on the far edge from the chair, with an area-colored glow.
      const my = down ? h - 12 : 4;
      const mx = w / 2 - 10;
      g.roundRect(mx, my, 20, 6, 1.5).fill({ color: INK });
      g.rect(mx + 2, down ? my + 1 : my + 3, 16, 2).fill({ color: exec ? 0xffae00 : color, alpha: 0.9 });
      g.roundRect(w / 2 - 7, down ? 6 : h - 11, 14, 4, 1).fill({ color: 0xd8d8de });
      break;
    }
    case "chair": {
      const cw = Math.min(w - 8, 22);
      for (let x = 0; x + 32 <= w; x += 32) chair(g, x + (32 - cw) / 2, 9, cw, color === INK ? 0x8a8a96 : color);
      if (w < 32) chair(g, (w - cw) / 2, 9, cw, color === INK ? 0x8a8a96 : color);
      break;
    }
    case "table":
      g.roundRect(2, 2, w - 4, h - 4, 10).fill({ color: 0xfafafa }).stroke({ color: INK, width: 1.4 });
      if (multi) AREA_STRIPES.forEach((c, i) => g.rect(10 + i * ((w - 20) / 4), h / 2 - 1.5, (w - 20) / 4, 3).fill({ color: c }));
      else g.rect(10, h / 2 - 1.5, w - 20, 3).fill({ color, alpha: 0.8 });
      break;
    case "round-table":
      g.circle(w / 2, h / 2, w / 2 - 6).fill({ color: 0xfafafa }).stroke({ color: INK, width: 1.4 });
      g.circle(w / 2, h / 2, 6).fill({ color: 0x18d3b8 });
      break;
    case "screen":
      g.roundRect(4, 2, w - 8, 8, 2).fill({ color: INK });
      g.rect(8, 4, w - 16, 3).fill({ color: 0x349ce2, alpha: 0.8 });
      break;
    case "whiteboard":
      g.roundRect(2, 3, w - 4, 10, 2).fill({ color: 0xffffff }).stroke({ color: INK, width: 1.2 });
      [0x18d3b8, 0xffae00, 0x349ce2].forEach((c, i) => g.rect(8 + i * 18, 6, 12, 2).fill({ color: c }));
      break;
    case "plant":
      plant(g, 0, 0);
      break;
    case "stage":
      g.roundRect(0, 0, w, h - 8, 6).fill({ color: 0x3a3a44 }).stroke({ color: INK, width: 1.5 });
      AREA_STRIPES.forEach((c, i) => g.rect(i * (w / 4), h - 14, w / 4, 6).fill({ color: c }));
      break;
    case "screen-big": {
      g.roundRect(0, 4, w, 26, 3).fill({ color: INK });
      const quii = label("Quii", 16, 0xffffff);
      const ven = label("Ven", 16, 0xffae00);
      quii.position.set(w / 2 - (quii.width + ven.width) / 2, 7);
      ven.position.set(quii.x + quii.width, 7);
      below.addChild(quii, ven);
      break;
    }
    case "podium":
      g.roundRect(14, 6, w - 28, 20, 3).fill({ color: 0xf1e6d3 }).stroke({ color: INK, width: 1.2 });
      break;
    case "seat":
      g.roundRect(5, 8, 22, 18, 5).fill({ color }).stroke({ color: INK, width: 1.2 });
      g.roundRect(5, 4, 22, 7, 3).fill({ color: 0x4a4a55 }).stroke({ color: INK, width: 1 });
      break;
    case "carpet-aisle":
      g.rect(8, 0, w - 16, h).fill({ color: 0x5a5a66, alpha: 0.6 });
      AREA_STRIPES.forEach((c, i) => g.rect(8 + i * ((w - 16) / 4), 0, (w - 16) / 4, 3).fill({ color: c }));
      break;
    case "fountain":
      g.circle(w / 2, h / 2, w / 2 - 4).fill({ color: 0xdcd6c8 }).stroke({ color: INK, width: 1.5 });
      g.circle(w / 2, h / 2, w / 2 - 14).fill({ color: 0x6cc9e8 });
      g.circle(w / 2, h / 2, 8).fill({ color: 0xdcd6c8 }).stroke({ color: INK, width: 1 });
      g.circle(w / 2 - 14, h / 2 - 10, 3).fill({ color: 0xffffff, alpha: 0.8 });
      break;
    case "tree": {
      g.roundRect(w / 2 - 5, h - 22, 10, 18, 3).fill({ color: 0x7a4a2c }).stroke({ color: INK, width: 1 });
      g.ellipse(w / 2, h - 4, 16, 4).fill({ color: INK, alpha: 0.15 });
      const above = new Container();
      above.position.set(d.x, d.y);
      const c = new Graphics();
      c.circle(w / 2, h / 2 - 8, 26).fill({ color: 0x2e9e63 }).stroke({ color: INK, width: 1.5 });
      c.circle(w / 2 - 10, h / 2 - 16, 12).fill({ color: 0x3fbf78 });
      c.circle(w / 2 + 12, h / 2 - 4, 9).fill({ color: 0x3fbf78 });
      c.alpha = 0.95;
      above.addChild(c);
      return { below, above };
    }
    case "bench":
      for (let y = 6; y < 26; y += 7) g.roundRect(4, y, w - 8, 5, 2).fill({ color: 0xc89b6d }).stroke({ color: INK, width: 1 });
      break;
    case "flowers": {
      g.roundRect(0, 0, w, h, 8).fill({ color: 0x6b8a3a }).stroke({ color: INK, width: 1 });
      let i = 0;
      for (let y = 8; y < h - 4; y += 10)
        for (let x = 8; x < w - 4; x += 10) g.circle(x, y, 3.5).fill({ color: [0xffae00, 0xff7442, 0xffffff, 0xe66fa6][i++ % 4] });
      break;
    }
    case "hedge":
      g.roundRect(1, 4, w - 2, h - 8, 8).fill({ color: 0x2e8b57 }).stroke({ color: INK, width: 1 });
      g.circle(10, 12, 4).fill({ color: 0x3fbf78 });
      break;
    case "counter": {
      g.roundRect(0, 2, w, h - 4, 4).fill({ color: 0xfafafa }).stroke({ color: INK, width: 1.4 });
      const foods = [0xffae00, 0xff7442, 0x3fbf78, 0xdd582f, 0xf4c567];
      for (let x = 16, i = 0; x < w - 10; x += 26, i++) {
        g.circle(x, h / 2, 7).fill({ color: 0xffffff }).stroke({ color: INK, width: 1 });
        g.circle(x, h / 2, 4).fill({ color: foods[i % foods.length] });
      }
      break;
    }
    case "coffee":
      g.roundRect(4, 4, w - 8, h - 8, 3).fill({ color: INK });
      g.rect(9, 10, w - 18, 6).fill({ color: 0xff7442 });
      g.circle(w / 2, h - 16, 4).fill({ color: 0xffffff });
      break;
    case "mat":
      g.roundRect(4, 4, w - 8, h - 8, 6).fill({ color, alpha: 0.85 }).stroke({ color: INK, width: 1 });
      g.rect(8, h / 2 - 1, w - 16, 2).fill({ color: 0xffffff, alpha: 0.5 });
      break;
    case "bike":
      g.circle(10, 18, 8).stroke({ color: INK, width: 2 });
      g.circle(w - 10, 18, 8).stroke({ color: INK, width: 2 });
      g.moveTo(10, 18).lineTo(w / 2, 8).lineTo(w - 10, 18).stroke({ color: 0x349ce2, width: 3 });
      break;
    case "water":
      g.roundRect(6, 10, 20, 20, 3).fill({ color: 0xf4f4f6 }).stroke({ color: INK, width: 1 });
      g.roundRect(9, 0, 14, 12, 4).fill({ color: 0x6cc9e8 }).stroke({ color: INK, width: 1 });
      break;
    case "logo-wall": {
      g.roundRect(0, 0, w, h, 10).fill({ color: 0xffffff }).stroke({ color: INK, width: 1.5 });
      AREA_STRIPES.forEach((c, i) => g.rect(16 + i * ((w - 32) / 4), h - 8, (w - 32) / 4, 4).fill({ color: c }));
      const quii = label("Quii", 30, INK);
      const ven = label("Ven", 30, 0xffae00);
      quii.position.set(w / 2 - (quii.width + ven.width) / 2, 10);
      ven.position.set(quii.x + quii.width, 10);
      below.addChild(quii, ven);
      break;
    }
    case "reception":
      g.roundRect(0, 4, w, h - 8, 18).fill({ color: 0xfafafa }).stroke({ color: INK, width: 1.6 });
      g.roundRect(8, 10, w - 16, 6, 3).fill({ color: INK });
      AREA_STRIPES.forEach((c, i) => g.rect(24 + i * ((w - 48) / 4), h - 16, (w - 48) / 4, 4).fill({ color: c }));
      break;
    case "sofa": {
      const vertical = d.props.vertical === "true";
      g.roundRect(2, 2, w - 4, h - 4, 8).fill({ color }).stroke({ color: INK, width: 1.4 });
      if (vertical) g.roundRect(w - 12, 6, 6, h - 12, 3).fill({ color: 0xffffff, alpha: 0.35 });
      else g.roundRect(6, 6, w - 12, 6, 3).fill({ color: 0xffffff, alpha: 0.35 });
      break;
    }
    case "coffee-table":
      g.roundRect(8, 8, w - 16, h - 16, 6).fill({ color: 0xc89b6d }).stroke({ color: INK, width: 1.2 });
      break;
    case "bookshelf": {
      g.roundRect(0, 2, w, h - 4, 3).fill({ color: 0x7a4a2c }).stroke({ color: INK, width: 1.2 });
      const books = [0xffae00, 0x18d3b8, 0x349ce2, 0xff7442, 0xf4f4f6];
      for (let x = 4, i = 0; x < w - 6; x += 6, i++) g.rect(x, 6, 4, h - 12).fill({ color: books[i % books.length] });
      break;
    }
    case "entrance": {
      g.roundRect(0, 0, w, h - 8, 8).fill({ color: INK, alpha: 0.85 });
      const t = label("Bienvenidos", 12, 0xffffff, "500");
      t.position.set(w / 2 - t.width / 2, (h - 8) / 2 - t.height / 2);
      below.addChild(t);
      break;
    }
    case "door":
      // Threshold so openings read as doors.
      g.rect(2, 2, w - 4, h - 4).fill({ color: 0xffffff, alpha: 0.35 });
      break;
    default:
      break;
  }
  return { below };
}

/** Floor tiles for the generated office (gids from scripts/gen-map.mjs). */
export function drawFloor(g: Graphics, gid: number, px: number, py: number, t: number): boolean {
  const even = (px / t + py / t) % 2 === 0;
  const tile = (a: number, b: number) => g.rect(px, py, t, t).fill({ color: even ? a : b });
  switch (gid) {
    case 10: // Ventas
      tile(0xfff6dc, 0xfff0cc);
      return true;
    case 11: // Marketing
      tile(0xe6f8f4, 0xdaf4ee);
      return true;
    case 12: // Tech
      tile(0xe6f1fb, 0xdbeaf8);
      return true;
    case 13: // Personas
      tile(0xffeee6, 0xffe5da);
      return true;
    case 14: // Operaciones / Finanzas
      tile(0xf2f2f5, 0xeaeaef);
      return true;
    case 15: // Auditorium carpet
      g.rect(px, py, t, t).fill({ color: 0x44444f });
      g.circle(px + 8, py + 8, 1.2).fill({ color: 0x55555f });
      g.circle(px + 24, py + 24, 1.2).fill({ color: 0x55555f });
      return true;
    case 16: // Meeting rooms
      tile(0xefedf6, 0xe8e6f1);
      return true;
    case 17: // Grass
      g.rect(px, py, t, t).fill({ color: even ? 0x92d38f : 0x89cc86 });
      g.rect(px + ((px * 7 + py) % 20) + 4, py + ((py * 3 + px) % 20) + 4, 2, 4).fill({ color: 0x6fb86c });
      return true;
    case 18: // Stone path
      g.rect(px, py, t, t).fill({ color: 0xebe5d7 });
      g.rect(px, py, t, 1).fill({ color: 0xdcd4c2 });
      g.rect(px + (even ? 0 : t / 2), py, 1, t).fill({ color: 0xdcd4c2 });
      return true;
    case 19: // Water
      g.rect(px, py, t, t).fill({ color: 0x6cc9e8 });
      g.rect(px + 6, py + (even ? 10 : 20), 10, 2).fill({ color: 0xa9e3f4 });
      return true;
    case 20: // Restaurant tiles
      tile(0xffffff, 0xf3ebe1);
      return true;
    case 21: // Active-break rubber floor
      g.rect(px, py, t, t).fill({ color: 0xffe9de });
      g.circle(px + 16, py + 16, 1.5).fill({ color: 0xffd2bf });
      return true;
    case 22: // Lobby
      tile(0xf9f9fb, 0xf3f3f6);
      return true;
    case 23: // Wood parquet (CEO)
      g.rect(px, py, t, t).fill({ color: even ? 0xead7bd : 0xe4cfb2 });
      g.rect(px, py + t / 2, t, 1).fill({ color: 0xd6bf9f });
      return true;
    default:
      return false;
  }
}
