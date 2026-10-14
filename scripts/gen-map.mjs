// Generates apps/web/public/maps/demo.tmj deterministically.
// Run: node scripts/gen-map.mjs  (repo root)
// Fase 1: 40x30 tiles @32px. Renderer draws procedurally; tileset image unused.
import { writeFileSync } from "node:fs";

const TW = 32;
const W = 40;
const H = 30;
const idx = (x, y) => y * W + x;

const ground = new Array(W * H).fill(1);
const walls = new Array(W * H).fill(0);
const roof = new Array(W * H).fill(0);

// Border walls
for (let x = 0; x < W; x++) {
  walls[idx(x, 0)] = 2;
  walls[idx(x, H - 1)] = 2;
}
for (let y = 0; y < H; y++) {
  walls[idx(0, y)] = 2;
  walls[idx(W - 1, y)] = 2;
}
// Interior horizontal wall y=12, x=8..24, door gap at x=15,16
for (let x = 8; x <= 24; x++) {
  if (x === 15 || x === 16) continue;
  walls[idx(x, 12)] = 2;
}
// Interior vertical wall x=28, y=5..20, gap at y=12,13
for (let y = 5; y <= 20; y++) {
  if (y === 12 || y === 13) continue;
  walls[idx(28, y)] = 2;
}
// Desks (2x1 blocks)
for (const [dx, dy] of [[18, 20], [19, 20], [10, 22], [11, 22]]) {
  walls[idx(dx, dy)] = 2;
}
// Roof awning over top area x=4..9, y=4..5 (drawn above avatars)
for (let x = 4; x <= 9; x++) {
  for (let y = 4; y <= 5; y++) roof[idx(x, y)] = 3;
}

const rect = (x, y, w, h) => ({ x: x * TW, y: y * TW, w: w * TW, h: h * TW });

// Collision rects mirror wall tiles (merged runs where trivial)
const collisions = [
  { name: "border-top", ...rect(0, 0, W, 1) },
  { name: "border-bottom", ...rect(0, H - 1, W, 1) },
  { name: "border-left", ...rect(0, 0, 1, H) },
  { name: "border-right", ...rect(W - 1, 0, 1, H) },
  { name: "hwall-left", ...rect(8, 12, 7, 1) },
  { name: "hwall-right", ...rect(17, 12, 8, 1) },
  { name: "vwall-top", ...rect(28, 5, 1, 7) },
  { name: "vwall-bottom", ...rect(28, 14, 1, 7) },
  { name: "desk1", ...rect(18, 20, 2, 1) },
  { name: "desk2", ...rect(10, 22, 2, 1) },
];

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
      // NOTE Fase 1: resolved procedurally by the client, file not required.
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
      objects: collisions.map((c, i) => ({
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
        {
          id: 101,
          name: "Sala 1",
          type: "private",
          x: 2 * TW,
          y: 2 * TW,
          width: 8 * TW,
          height: 5 * TW,
          rectangle: true,
          properties: [{ name: "zoneId", type: "string", value: "sala-1" }],
        },
        {
          id: 102,
          name: "spawn",
          type: "spawn",
          x: 20 * TW,
          y: 24 * TW,
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
console.log("demo.tmj written:", W, "x", H, "tiles");
