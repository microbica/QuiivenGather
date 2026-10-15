// Generates apps/web/public/maps/demo.tmj deterministically.
// 100x60 tiles @32px = 3200x1920px. Capacidad ~100 personas.
// Layout: PATIO (top, outdoor) + edificio de oficinas con corredor central.
// Run: node scripts/gen-map.mjs  (repo root)
import { writeFileSync } from "node:fs";

const TW = 32;
const W = 100;
const H = 60;
const idx = (x, y) => y * W + x;

const ground = new Array(W * H).fill(1);
const walls = new Array(W * H).fill(0);
const roof = new Array(W * H).fill(0);

// ============ Bordes exteriores ============
for (let x = 0; x < W; x++) {
  walls[idx(x, 0)] = 2;
  walls[idx(x, H - 1)] = 2;
}
for (let y = 0; y < H; y++) {
  walls[idx(0, y)] = 2;
  walls[idx(W - 1, y)] = 2;
}

// ============ Patio (filas 1-9, sin paredes internas) ============
// Suelo del patio: mismo ground (gid=1). Sin paredes.
// Awning sobre la entrada al edificio (filas 5-7, cols 48-52)
for (let x = 48; x <= 52; x++) {
  for (let y = 5; y <= 7; y++) roof[idx(x, y)] = 3;
}

// ============ Muro entre patio y edificio (fila 10) ============
for (let x = 1; x < W - 1; x++) walls[idx(x, 10)] = 2;
// Puerta de acceso al patio (centro)
walls[idx(50, 10)] = 0;

// ============ Corredor central horizontal (filas 30-32) ============
for (let x = 1; x < W - 1; x++) {
  walls[idx(x, 30)] = 2;
  walls[idx(x, 32)] = 2;
}
// Puertas del corredor a las salas (cada 10 cols)
for (const dx of [5, 15, 25, 35, 45, 55, 65, 75, 85, 95]) {
  walls[idx(dx, 30)] = 0;
  walls[idx(dx, 32)] = 0;
}

// ============ Divisiones verticales (lado norte, filas 11-29) ============
const northDividers = [10, 20, 30, 40, 50, 60, 70, 80, 90];
for (const x of northDividers) {
  for (let y = 11; y < 30; y++) walls[idx(x, y)] = 2;
}

// ============ Divisiones verticales (lado sur, filas 33-58) ============
const southDividers = [10, 20, 30, 40, 50, 60, 70, 80, 90];
for (const x of southDividers) {
  for (let y = 33; y < H - 1; y++) walls[idx(x, y)] = 2;
}

// ============ Roofs/awnings sobre corredores y zonas clave ============
// Awning del corredor (cubre parcialmente para dar sombra visual)
for (let x = 1; x < W - 1; x += 4) {
  roof[idx(x, 30)] = 3;
  roof[idx(x, 32)] = 3;
}

// ============ Collisions: se generan a partir de walls (optimizado) ============
// Agrupamos runs horizontales de paredes contiguas para reducir objetos.
const collisionRects = [];

function rect(x, y, w, h, name) {
  collisionRects.push({ x: x * TW, y: y * TW, w: w * TW, h: h * TW, name });
}

// Bordes
rect(0, 0, W, 1, "border-top");
rect(0, H - 1, W, 1, "border-bottom");
rect(0, 0, 1, H, "border-left");
rect(W - 1, 0, 1, H, "border-right");
// Muro patio
rect(1, 10, 49, 1, "patio-wall-left");
rect(51, 10, 48, 1, "patio-wall-right");
// Corredor
rect(1, 30, 4, 1, "corridor-top-1");
rect(6, 30, 9, 1, "corridor-top-2");
rect(16, 30, 9, 1, "corridor-top-3");
rect(26, 30, 9, 1, "corridor-top-4");
rect(36, 30, 9, 1, "corridor-top-5");
rect(46, 30, 9, 1, "corridor-top-6");
rect(56, 30, 9, 1, "corridor-top-7");
rect(66, 30, 9, 1, "corridor-top-8");
rect(76, 30, 9, 1, "corridor-top-9");
rect(86, 30, 9, 1, "corridor-top-10");
rect(96, 30, 3, 1, "corridor-top-11");

rect(1, 32, 4, 1, "corridor-bot-1");
rect(6, 32, 9, 1, "corridor-bot-2");
rect(16, 32, 9, 1, "corridor-bot-3");
rect(26, 32, 9, 1, "corridor-bot-4");
rect(36, 32, 9, 1, "corridor-bot-5");
rect(46, 32, 9, 1, "corridor-bot-6");
rect(56, 32, 9, 1, "corridor-bot-7");
rect(66, 32, 9, 1, "corridor-bot-8");
rect(76, 32, 9, 1, "corridor-bot-9");
rect(86, 32, 9, 1, "corridor-bot-10");
rect(96, 32, 3, 1, "corridor-bot-11");

// Divisiones verticales norte (filas 11-29, cada 10 cols)
for (const x of northDividers) rect(x, 11, 1, 19, `north-div-${x}`);
// Divisiones verticales sur (filas 33-58)
for (const x of southDividers) rect(x, 33, 1, 26, `south-div-${x}`);

// ============ Zones ============
// Patio: zona pública grande
const zones = [
  { id: "patio", name: "Patio", kind: "public", x: 1, y: 1, w: W - 2, h: 9 },
  { id: "corridor", name: "Corredor", kind: "public", x: 1, y: 31, w: W - 2, h: 1 },
  // Salas norte (filas 11-29, entre divisores cada 10 cols)
  { id: "room-n1", name: "Sala N1", kind: "private", x: 1, y: 11, w: 9, h: 19 },
  { id: "room-n2", name: "Sala N2", kind: "private", x: 11, y: 11, w: 9, h: 19 },
  { id: "room-n3", name: "Sala N3", kind: "private", x: 21, y: 11, w: 9, h: 19 },
  { id: "room-n4", name: "Sala N4", kind: "private", x: 31, y: 11, w: 9, h: 19 },
  { id: "room-n5", name: "Sala N5", kind: "private", x: 41, y: 11, w: 9, h: 19 },
  { id: "room-n6", name: "Sala N6", kind: "private", x: 51, y: 11, w: 9, h: 19 },
  { id: "room-n7", name: "Sala N7", kind: "private", x: 61, y: 11, w: 9, h: 19 },
  { id: "room-n8", name: "Sala N8", kind: "private", x: 71, y: 11, w: 9, h: 19 },
  { id: "room-n9", name: "Sala N9", kind: "private", x: 81, y: 11, w: 9, h: 19 },
  // Salas sur
  { id: "room-s1", name: "Sala S1", kind: "private", x: 1, y: 33, w: 9, h: 26 },
  { id: "room-s2", name: "Sala S2", kind: "private", x: 11, y: 33, w: 9, h: 26 },
  { id: "room-s3", name: "Sala S3", kind: "private", x: 21, y: 33, w: 9, h: 26 },
  { id: "room-s4", name: "Sala S4", kind: "private", x: 31, y: 33, w: 9, h: 26 },
  { id: "room-s5", name: "Sala S5", kind: "private", x: 41, y: 33, w: 9, h: 26 },
  { id: "room-s6", name: "Sala S6", kind: "private", x: 51, y: 33, w: 9, h: 26 },
  { id: "room-s7", name: "Sala S7", kind: "private", x: 61, y: 33, w: 9, h: 26 },
  { id: "room-s8", name: "Sala S8", kind: "private", x: 71, y: 33, w: 9, h: 26 },
  { id: "room-s9", name: "Sala S9", kind: "private", x: 81, y: 33, w: 9, h: 26 },
];

// ============ TMJ map ============
const map = {
  type: "map",
  tiledversion: "1.11.0",
  orientation: "orthogonal",
  renderorder: "right-down",
  width: W,
  height: H,
  tilewidth: TW,
  tileheight: TW,
  tilesets: [
    {
      name: "placeholder",
      firstgid: 1,
      tilewidth: TW,
      tileheight: TW,
      tilecount: 3,
      columns: 3,
      image: "../tiles/placeholder.png",
      imagewidth: 96,
      imageheight: 32,
    },
  ],
  layers: [
    { id: 1, name: "ground", type: "tilelayer", width: W, height: H, data: ground },
    { id: 2, name: "walls", type: "tilelayer", width: W, height: H, data: walls },
    { id: 3, name: "roof", type: "tilelayer", width: W, height: H, data: roof },
    {
      id: 4,
      name: "collision",
      type: "objectgroup",
      objects: collisionRects.map((c, i) => ({
        id: i + 1,
        name: c.name,
        type: "collision",
        x: c.x,
        y: c.y,
        width: c.w,
        height: c.h,
        rectangle: true,
      })),
    },
    {
      id: 5,
      name: "zones",
      type: "objectgroup",
      objects: [
        ...zones.map((z, i) => ({
          id: 100 + i,
          name: z.name,
          type: z.kind,
          x: z.x * TW,
          y: z.y * TW,
          width: z.w * TW,
          height: z.h * TW,
          rectangle: true,
          properties: [{ name: "zoneId", type: "string", value: z.id }],
        })),
        {
          id: 200,
          name: "spawn",
          type: "spawn",
          x: 50 * TW,
          y: 31 * TW,
          width: TW,
          height: TW,
          rectangle: true,
          point: false,
        },
      ],
    },
  ],
};

writeFileSync(
  new URL("../apps/web/public/maps/demo.tmj", import.meta.url),
  JSON.stringify(map),
);
console.log("demo.tmj written:", W, "x", H, "tiles (", W * TW, "x", H * TW, "px)");

// Muros interiores como objetos admin (editables: mover/borrar desde el canvas).
// Se siembran en la DB en el primer arranque. Los tiles visuales se mantienen
// (limitación: al borrar, el tile visual queda pero la colisión desaparece).
const wallObjects = [];
for (const x of northDividers) {
  wallObjects.push({
    id: `wall-n${x}`,
    label: `Muro N${x}`,
    kind: "wall",
    material: "wood",
    x: x * TW,
    y: 11 * TW,
    w: TW,
    h: 19 * TW,
    radius: 0,
    url: "",
  });
}
for (const x of southDividers) {
  wallObjects.push({
    id: `wall-s${x}`,
    label: `Muro S${x}`,
    kind: "wall",
    material: "wood",
    x: x * TW,
    y: 33 * TW,
    w: TW,
    h: 26 * TW,
    radius: 0,
    url: "",
  });
}
writeFileSync(
  new URL("../apps/web/public/walls.json", import.meta.url),
  JSON.stringify(wallObjects, null, 2),
);
console.log("walls.json written:", wallObjects.length, "wall objects");
