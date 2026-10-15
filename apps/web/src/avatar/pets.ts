// Pixel-art pets (and farm friends) that follow their owner around the office.
// Same approach as the avatar painter: a pure grid of colors + Carbón outline.
// Every animal is drawn facing right on a 20x16 grid; left is a mirror.
import type { Pet } from "./config";
import type { PixelGrid } from "./render";

export const PET_W = 20;
export const PET_H = 16;
const INK = "#2c2c33";
const COLLAR = "#349ce2";
const PINK = "#f5a9b8";
const BEAK = "#ffae00";

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

/** Natural default coat per animal (used by "Aleatorio" and as first suggestion). */
export const PET_DEFAULT_COLOR: Record<Exclude<Pet, "ninguna">, string> = {
  perro: "#d9a05b",
  gato: "#a9a9b2",
  conejo: "#f4f4f6",
  loro: "#3fbf78",
  vaca: "#f4f4f6",
  caballo: "#8a5a3a",
  cerdo: "#f5a9b8",
  oveja: "#f4f4f6",
  cabra: "#c9a77c",
  pato: "#f4f4f6",
  gallina: "#f4f4f6",
  llama: "#e2c9a0",
};

/**
 * Paints a pet facing right (mirrored when facingLeft). frame 0/1 alternates
 * legs while walking; birds hop instead.
 */
export function paintPet(pet: Pet, color: string, facingLeft = false, frame: 0 | 1 = 0): PixelGrid {
  const w = PET_W;
  const h = PET_H;
  const px = new Array<string>(w * h).fill("");
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  const dark = shade(color, -0.25);
  const light = shade(color, 0.22);
  const ground = h - 1;
  /** Legs reaching the ground; alternate pairs lift while walking. */
  const legs = (xs: number[], top: number, c = dark, hoof?: string) =>
    xs.forEach((x, i) => {
      const lift = frame === 1 && i % 2 === 0 ? 1 : 0;
      rect(x, top, x, ground - lift, c);
      if (hoof) set(x, ground - lift, hoof);
    });
  const hop = frame === 1 ? 1 : 0;

  switch (pet) {
    case "perro":
      rect(4, 8, 13, 11, color); // body
      rect(5, 8, 11, 8, light);
      rect(12, 4, 17, 9, color); // head
      rect(17, 7, 18, 8, color); // snout
      set(18, 7, INK); // nose
      set(15, 6, INK); // eye
      rect(12, 3, 13, 5, dark); // ear
      rect(12, 9, 14, 9, COLLAR); // collar
      rect(2, 6, 3, 7, color); // tail up
      set(3, 8, color);
      legs([5, 7, 11, 13], 12);
      break;
    case "gato":
      rect(4, 9, 13, 11, color);
      rect(12, 5, 17, 10, color);
      set(12, 4, color); // ears
      set(13, 4, color);
      set(16, 4, color);
      set(17, 4, color);
      set(16, 7, INK);
      set(17, 8, PINK);
      rect(12, 10, 14, 10, COLLAR);
      rect(2, 4, 2, 9, color); // tail
      set(3, 4, color);
      rect(5, 9, 9, 9, light);
      legs([5, 7, 11, 13], 12);
      break;
    case "conejo":
      rect(5, 9, 12, 13, color);
      rect(11, 6, 16, 10, color);
      rect(12, 1, 12, 5, color); // ears
      rect(14, 1, 14, 5, color);
      set(12, 2, PINK);
      set(14, 2, PINK);
      set(15, 7, INK);
      set(16, 9, PINK);
      rect(3, 9, 4, 10, "#ffffff"); // cotton tail
      legs([6, 11], 14);
      break;
    case "loro":
      rect(7, 5 - hop, 12, 11 - hop, color);
      rect(11, 3 - hop, 15, 7 - hop, color);
      set(13, 4 - hop, INK);
      rect(16, 5 - hop, 16, 6 - hop, BEAK);
      rect(7, 7 - hop, 10, 10 - hop, dark); // wing
      rect(4, 10 - hop, 7, 13 - hop, shade(color, -0.4)); // tail
      rect(9, 12 - hop, 9, ground, BEAK);
      rect(11, 12 - hop, 11, ground, BEAK);
      break;
    case "vaca": {
      rect(3, 5, 14, 10, color); // body
      for (const [x, y] of [[5, 6], [6, 6], [6, 7], [10, 8], [11, 8], [11, 9], [13, 5]]) set(x, y, INK); // spots
      rect(14, 3, 18, 8, color); // head
      rect(16, 7, 19, 9, PINK); // muzzle
      set(17, 5, INK);
      set(14, 2, "#e2c07a"); // horns
      set(18, 2, "#e2c07a");
      rect(7, 11, 9, 11, PINK); // udder
      rect(2, 5, 2, 9, color); // tail
      set(2, 10, INK);
      legs([4, 6, 12, 14], 11, color, INK);
      break;
    }
    case "caballo":
      rect(3, 6, 13, 10, color);
      rect(13, 1, 15, 7, color); // neck
      rect(14, 1, 18, 4, color); // head
      rect(17, 3, 19, 5, shade(color, 0.15)); // muzzle
      set(16, 2, INK);
      rect(12, 0, 13, 6, INK); // mane
      rect(1, 6, 2, 11, INK); // tail
      legs([4, 6, 11, 13], 11, color, INK);
      break;
    case "cerdo":
      rect(4, 6, 14, 12, color);
      rect(14, 6, 17, 11, color); // head
      rect(18, 8, 19, 10, shade(color, -0.12)); // snout
      set(19, 9, INK);
      set(16, 7, INK);
      rect(14, 4, 15, 5, shade(color, -0.12)); // ear
      set(3, 6, color); // curly tail
      set(2, 5, color);
      set(3, 4, color);
      legs([5, 7, 12, 14], 13, dark);
      break;
    case "oveja":
      rect(3, 4, 14, 11, color); // wool
      for (const [x, y] of [[4, 4], [7, 4], [10, 4], [13, 4], [3, 7], [14, 9]]) set(x, y, shade(color, -0.1));
      rect(14, 5, 18, 10, "#3a3a44"); // face
      set(16, 7, "#ffffff");
      rect(13, 6, 13, 7, "#3a3a44"); // ear
      legs([5, 7, 11, 13], 12, "#3a3a44");
      break;
    case "cabra":
      rect(4, 6, 13, 10, color);
      rect(13, 3, 17, 8, color);
      rect(18, 6, 18, 7, color);
      set(16, 5, INK);
      rect(13, 1, 13, 2, dark); // horns
      rect(15, 1, 15, 2, dark);
      rect(16, 9, 16, 11, "#f4f4f6"); // beard
      set(3, 5, color); // tail
      legs([5, 7, 11, 13], 11, dark, INK);
      break;
    case "pato":
      rect(5, 8 - hop, 13, 12 - hop, color);
      rect(12, 3 - hop, 15, 8 - hop, color);
      set(14, 5 - hop, INK);
      rect(16, 6 - hop, 17, 7 - hop, BEAK);
      rect(6, 9 - hop, 10, 11 - hop, shade(color, -0.12)); // wing
      set(4, 8 - hop, color); // tail
      rect(8, 13 - hop, 8, ground, BEAK);
      rect(11, 13 - hop, 11, ground, BEAK);
      break;
    case "gallina":
      rect(5, 7 - hop, 12, 12 - hop, color);
      rect(11, 3 - hop, 14, 7 - hop, color);
      rect(12, 1 - hop, 13, 2 - hop, "#dd582f"); // comb
      set(14, 7 - hop, "#dd582f"); // wattle
      set(13, 4 - hop, INK);
      set(15, 5 - hop, BEAK);
      rect(3, 6 - hop, 5, 8 - hop, shade(color, -0.12)); // tail feathers
      rect(6, 9 - hop, 9, 11 - hop, shade(color, -0.12));
      rect(8, 13 - hop, 8, ground, BEAK);
      rect(10, 13 - hop, 10, ground, BEAK);
      break;
    case "llama":
      rect(3, 7, 12, 11, color);
      rect(11, 1, 13, 8, color); // long neck
      rect(12, 0, 16, 3, color); // head
      set(14, 1, INK);
      set(16, 2, dark);
      rect(11, 0, 11, 0, dark); // ear
      for (const [x, y] of [[4, 7], [7, 8], [10, 7], [5, 10]]) set(x, y, light); // fluffy wool
      set(2, 7, color); // tail
      legs([4, 6, 10, 12], 12, dark);
      break;
    case "ninguna":
      break;
  }

  // Carbón outline around every filled pixel.
  const filled = px.map((p) => p !== "");
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (filled[y * w + x]) continue;
      if (
        (x > 0 && filled[y * w + x - 1]) ||
        (x < w - 1 && filled[y * w + x + 1]) ||
        (y > 0 && filled[(y - 1) * w + x]) ||
        (y < h - 1 && filled[(y + 1) * w + x])
      )
        px[y * w + x] = INK;
    }

  if (facingLeft) {
    for (let y = 0; y < h; y++) {
      const row = px.slice(y * w, y * w + w).reverse();
      for (let x = 0; x < w; x++) px[y * w + x] = row[x];
    }
  }
  return { w, h, px };
}
