// Sprites procedurales (CC0: solo código, sin assets externos).
// Para enriquecer el visual de objetos y avatar sin dependencias.
import { Container, Graphics, Text } from "pixi.js";
import type { Material, SmartKind } from "./objects";

/** Avatar: cuerpo con gradiente + cabeza + sombra. */
export function makeAvatarSprite(
  bodyColor: number,
  name: string,
): { c: Container; label: Text; nub: Graphics; ring: Graphics } {
  const W = 20;
  const H = 28;
  const c = new Container();
  const body = new Graphics();
  // Sombra
  body.ellipse(W / 2, H + 1, W / 2, 3).fill({ color: 0x000000, alpha: 0.3 });
  // Cuerpo con borde
  body.roundRect(0, 0, W, H, 6).fill({ color: bodyColor }).stroke({ color: 0x1a1f2e, width: 1.5 });
  // Cabeza
  body.circle(W / 2, 7, 5).fill({ color: 0xf2d4b6 }).stroke({ color: 0x1a1f2e, width: 1 });
  // Ojos
  body.rect(W / 2 - 2, 6, 1, 2).fill({ color: 0x1a1f2e });
  body.rect(W / 2 + 1, 6, 1, 2).fill({ color: 0x1a1f2e });
  // Brillo en el cuerpo
  body.roundRect(2, 4, 3, H - 8, 1).fill({ color: 0xffffff, alpha: 0.15 });

  const nub = new Graphics();
  const ring = new Graphics();
  const label = new Text({
    text: name,
    style: {
      fontSize: 11,
      fill: 0xffffff,
      fontFamily: "system-ui, sans-serif",
      stroke: { color: 0x000000, width: 3 },
    },
  });
  label.anchor.set(0.5, 1);
  label.position.set(W / 2, -4);
  c.addChild(body, nub, ring, label);
  return { c, label, nub, ring };
}

/** Dibuja un sprite procedural según el kind del objeto, centrado en (0,0) con tamaño w×h. */
export function makeObjectSprite(
  kind: SmartKind,
  w: number,
  h: number,
  material: Material = "wood",
): Graphics {
  const g = new Graphics();
  switch (kind) {
    case "meet":
      drawTV(g, w, h);
      break;
    case "board":
      drawBoard(g, w, h);
      break;
    case "wall":
      drawWall(g, w, h, material);
      break;
    case "window":
      drawWindow(g, w, h, material);
      break;
    case "door":
      drawDoor(g, w, h, material);
      break;
    default:
      drawGeneric(g, w, h);
  }
  return g;
}

function drawTV(g: Graphics, w: number, h: number): void {
  // Marco oscuro
  g.roundRect(0, 0, w, h, 4).fill({ color: 0x1a1f2e }).stroke({ color: 0x0a0d14, width: 1.5 });
  // Bisel interior
  g.roundRect(2, 2, w - 4, h - 6, 2).fill({ color: 0x2a3040 });
  // Pantalla con gradiente simulado (capas)
  g.roundRect(4, 4, w - 8, h - 10, 1).fill({ color: 0x0d1b2a });
  g.roundRect(4, 4, w - 8, h - 10, 1).fill({ color: 0x1e3a5f, alpha: 0.6 });
  // Icono "play" Meet (cámara de video)
  const cx = w / 2;
  const cy = (h - 6) / 2 + 2;
  g.rect(cx - 3, cy - 2, 6, 4).fill({ color: 0x4a8ff7 });
  g.poly([cx + 2, cy - 2, cx + 6, cy - 4, cx + 6, cy + 4, cx + 2, cy + 2]).fill({ color: 0x4a8ff7 });
  // Base/soporte
  g.rect(w / 2 - 6, h - 4, 12, 3).fill({ color: 0x2a3040 });
  g.rect(w / 2 - 8, h - 1, 16, 2).fill({ color: 0x1a1f2e });
}

function drawBoard(g: Graphics, w: number, h: number): void {
  // Marco de madera
  g.roundRect(0, 0, w, h, 3).fill({ color: 0x8a5f3c }).stroke({ color: 0x5c3f25, width: 2 });
  // Superficie blanca
  g.roundRect(4, 4, w - 8, h - 8, 2).fill({ color: 0xf5f1e8 }).stroke({ color: 0xc4b896, width: 1 });
  // Líneas de pizarrón (tiza)
  const lineW = w - 16;
  g.moveTo(8, h * 0.3).lineTo(8 + lineW * 0.7, h * 0.3).stroke({ color: 0x6b8aa0, width: 1, alpha: 0.6 });
  g.moveTo(8, h * 0.5).lineTo(8 + lineW * 0.9, h * 0.5).stroke({ color: 0x6b8aa0, width: 1, alpha: 0.6 });
  g.moveTo(8, h * 0.7).lineTo(8 + lineW * 0.5, h * 0.7).stroke({ color: 0x6b8aa0, width: 1, alpha: 0.6 });
  // Líneas verticales de margen
  g.moveTo(w - 8, 6).lineTo(w - 8, h - 6).stroke({ color: 0xc4b896, width: 1, alpha: 0.5 });
  // Soporte / bandeja
  g.rect(2, h - 2, w - 4, 2).fill({ color: 0x5c3f25 });
}

function drawGeneric(g: Graphics, w: number, h: number): void {
  // Caja genérica
  g.roundRect(0, 0, w, h, 4).fill({ color: 0x4a5265 }).stroke({ color: 0x2a3040, width: 1.5 });
  g.roundRect(4, 4, w - 8, h - 8, 2).fill({ color: 0x6b7589, alpha: 0.5 });
  // "?" en el centro
  g.setStrokeStyle({ width: 2, color: 0x2a3040 });
  g.beginPath();
  g.moveTo(w / 2 - 4, h / 2 - 4);
  g.lineTo(w / 2 + 4, h / 2 - 4);
  g.lineTo(w / 2 + 4, h / 2);
  g.lineTo(w / 2, h / 2);
  g.lineTo(w / 2, h / 2 + 4);
  g.stroke();
  g.circle(w / 2, h / 2 + 7, 1.5).fill({ color: 0x2a3040 });
}

// Paletas de materiales
interface Palette {
  fill: number;
  detail: number;
  shadow: number;
  grain?: number;
  accent?: number;
}
const PALETTES: Record<Material, Palette> = {
  wood:  { fill: 0x8a5f3c, detail: 0x5c3f25, shadow: 0x6b4a2a, grain: 0x6b4a2a, accent: 0xb98a5a },
  metal: { fill: 0x6b7589, detail: 0x3a4252, shadow: 0x2a3040, grain: 0x8a96ad },
  // Quiiven office: glass partitions tinted with Tech blue, solid walls in Carbón.
  glass: { fill: 0xcfe8f6, detail: 0x349ce2, shadow: 0x066abc, accent: 0xeaf6fc },
  stone: { fill: 0x3a3a44, detail: 0x2c2c33, shadow: 0x1f1f25, grain: 0x4a4a55 },
};

function drawWall(g: Graphics, w: number, h: number, m: Material): void {
  const p = PALETTES[m];
  // Cuerpo
  g.rect(0, 0, w, h).fill({ color: p.fill }).stroke({ color: p.detail, width: 1.5 });
  // Borde oscuro inferior
  g.rect(0, h - 2, w, 2).fill({ color: p.shadow, alpha: 0.6 });
  // Veta/textura según material
  if (m === "wood") {
    for (let y = 4; y < h - 2; y += 6) {
      g.moveTo(2, y).lineTo(w - 2, y).stroke({ color: p.grain!, width: 0.5, alpha: 0.5 });
    }
    g.moveTo(w * 0.3, 0).lineTo(w * 0.3, h).stroke({ color: p.grain!, width: 0.5, alpha: 0.4 });
  } else if (m === "metal") {
    // Remaches en las esquinas
    g.circle(3, 3, 1).fill({ color: 0x1a1f2e });
    g.circle(w - 3, 3, 1).fill({ color: 0x1a1f2e });
    g.circle(3, h - 3, 1).fill({ color: 0x1a1f2e });
    g.circle(w - 3, h - 3, 1).fill({ color: 0x1a1f2e });
    g.moveTo(0, h / 2).lineTo(w, h / 2).stroke({ color: p.grain!, width: 0.5, alpha: 0.3 });
  } else if (m === "stone") {
    // Ladrillos
    const bw = w / 2;
    const bh = h / 4;
    g.moveTo(bw, 0).lineTo(bw, h).stroke({ color: p.grain!, width: 0.5, alpha: 0.5 });
    for (let y = 0; y < h; y += bh) {
      g.moveTo(0, y).lineTo(w, y).stroke({ color: p.grain!, width: 0.5, alpha: 0.5 });
    }
  }
}

function drawWindow(g: Graphics, w: number, h: number, m: Material): void {
  const p = PALETTES[m];
  // Marco
  g.rect(0, 0, w, h).fill({ color: p.fill }).stroke({ color: p.detail, width: 1.5 });
  // Vidrio
  const inset = 3;
  g.rect(inset, inset, w - inset * 2, h - inset * 2).fill({ color: 0xa8d8e8, alpha: 0.7 });
  g.rect(inset, inset, w - inset * 2, h - inset * 2).stroke({ color: 0x6090a8, width: 1 });
  // Cruceta central
  g.moveTo(w / 2, inset).lineTo(w / 2, h - inset).stroke({ color: p.detail, width: 1.5 });
  g.moveTo(inset, h / 2).lineTo(w - inset, h / 2).stroke({ color: p.detail, width: 1.5 });
  // Brillo
  g.moveTo(inset + 1, inset + 1).lineTo(w / 2 - 1, h / 2 - 1).stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
  // Alféizar
  g.rect(-1, h - 2, w + 2, 2).fill({ color: p.detail });
}

function drawDoor(g: Graphics, w: number, h: number, m: Material): void {
  const p = PALETTES[m];
  // Marco
  g.rect(0, 0, w, h).fill({ color: p.detail });
  // Panel de la puerta
  g.rect(2, 2, w - 4, h - 4).fill({ color: p.fill }).stroke({ color: p.shadow, width: 1 });
  // Panel interior
  g.rect(5, 5, w - 10, h * 0.55).fill({ color: p.fill, alpha: 0.7 }).stroke({ color: p.shadow, width: 0.5 });
  g.rect(5, h * 0.62, w - 10, h * 0.28).fill({ color: p.fill, alpha: 0.7 }).stroke({ color: p.shadow, width: 0.5 });
  // Pomo
  g.circle(w - 6, h / 2, 1.5).fill({ color: 0xf2c14a });
  g.circle(w - 6, h / 2, 0.5).fill({ color: 0x8a5f3c });
  // Veta si es madera
  if (m === "wood") {
    g.moveTo(3, 0).lineTo(3, h).stroke({ color: p.grain!, width: 0.5, alpha: 0.4 });
  }
  // Bisagras
  g.rect(0, 3, 2, 3).fill({ color: p.shadow });
  g.rect(0, h - 6, 2, 3).fill({ color: p.shadow });
}

/** Tile de suelo procedural con patrón alternado. */
export function makeTile(g: Graphics, px: number, py: number, t: number, gid: number): void {
  if (gid === 1) {
    g.rect(px, py, t, t).fill({ color: (px / t + py / t) % 2 === 0 ? 0x262c38 : 0x222834 });
  } else if (gid === 2) {
    g.rect(px, py, t, t).fill({ color: 0x4a5265 });
    g.rect(px, py, t, 5).fill({ color: 0x707a94 });
    g.rect(px, py + t - 3, t, 3).fill({ color: 0x333948 });
    g.rect(px, py, 2, t).fill({ color: 0x5a6376 });
    g.rect(px + t - 2, py, 2, t).fill({ color: 0x5a6376 });
  } else if (gid === 3) {
    g.rect(px, py, t, t).fill({ color: 0x8a5f3c, alpha: 0.92 });
    g.rect(px, py, t, 4).fill({ color: 0xb98a5a, alpha: 0.92 });
    g.rect(px, py, 2, t).fill({ color: 0x6b4a2a, alpha: 0.7 });
    g.rect(px + t - 2, py, 2, t).fill({ color: 0x6b4a2a, alpha: 0.7 });
  }
}
