// Generates the Quiiven virtual office deterministically:
//   apps/web/public/maps/demo.tmj  (floors, outer shell, decor, zones, collisions)
//   apps/web/public/walls.json     (interior walls as admin-editable objects)
//   apps/web/public/objects.json   (smart objects: TVs and whiteboard)
// 100x60 tiles @32px = 3200x1920px (same bounds the server validates).
//
// Layout inspired by WorkAdventure's "great-place-to-work" preset, adapted to
// Quiiven: one office per team/cell (desks sized from Airtable "Usuarios"
// activos, Oct 2026), meeting rooms, an auditorium for everyone, garden,
// restaurant and active-break room. Floors and room plates use area colors.
//
// Run from repo root: node scripts/gen-map.mjs
import { writeFileSync } from "node:fs";

const TW = 32;
const W = 100;
const H = 60;
const idx = (x, y) => y * W + x;

// ---------------------------------------------------------------------------
// Areas: brand color per business area (Manual de marca 2026). Areas without
// an official color (Operaciones, Finanzas, Dirección) use the neutral Carbón.
// ---------------------------------------------------------------------------
const AREAS = {
  ventas: { color: "#ffae00", floor: 10 },
  marketing: { color: "#18d3b8", floor: 11 },
  tech: { color: "#349ce2", floor: 12 },
  personas: { color: "#ff7442", floor: 13 },
  operaciones: { color: "#2c2c33", floor: 14 },
  finanzas: { color: "#2c2c33", floor: 14 },
  direccion: { color: "#2c2c33", floor: 23 },
  general: { color: "gradient", floor: 16 },
};

// Floor gids (rendered procedurally in GameCanvas).
const G = {
  corridor: 1,
  wallTile: 2,
  auditorium: 15,
  meeting: 16,
  grass: 17,
  path: 18,
  water: 19,
  restaurant: 20,
  gym: 21,
  lobby: 22,
  wood: 23,
};

const ground = new Array(W * H).fill(G.corridor);
const walls = new Array(W * H).fill(0);
const roof = new Array(W * H).fill(0);
const wallGrid = new Array(W * H).fill(false); // interior walls (objects)
const decor = [];
const collisions = [];
const zones = [];
const smartObjects = [];

const fill = (x0, y0, x1, y1, gid) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ground[idx(x, y)] = gid;
};
const collide = (x, y, w, h, name) => collisions.push({ x: x * TW, y: y * TW, w: w * TW, h: h * TW, name });
const put = (type, x, y, w = 1, h = 1, props = {}) => decor.push({ type, x, y, w, h, props });

// ============ Outer shell (static tiles + collision) ============
for (let x = 0; x < W; x++) {
  walls[idx(x, 0)] = G.wallTile;
  walls[idx(x, H - 1)] = G.wallTile;
}
for (let y = 0; y < H; y++) {
  walls[idx(0, y)] = G.wallTile;
  walls[idx(W - 1, y)] = G.wallTile;
}
collide(0, 0, W, 1, "border-top");
collide(0, H - 1, W, 1, "border-bottom");
collide(0, 0, 1, H, "border-left");
collide(W - 1, 0, 1, H, "border-right");

// ============ Rooms ============
/**
 * A room is an inclusive tile rect whose border becomes wall. `doors` are
 * gaps: { side: "top"|"bottom"|"left"|"right", at, size }.
 */
function room(spec) {
  const { x0, y0, x1, y1, area, floor, doors = [] } = spec;
  fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, floor ?? AREAS[area].floor);
  const mark = (x, y) => {
    if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) return; // outer shell
    wallGrid[idx(x, y)] = true;
  };
  for (let x = x0; x <= x1; x++) {
    mark(x, y0);
    mark(x, y1);
  }
  for (let y = y0; y <= y1; y++) {
    mark(x0, y);
    mark(x1, y);
  }
  spec._doors = doors;
  zones.push({
    id: spec.id,
    name: spec.name,
    kind: spec.private === false ? "interact" : "private",
    x: x0 + 1,
    y: y0 + 1,
    w: x1 - x0 - 1,
    h: y1 - y0 - 1,
    area,
  });
  // Room plate (name + area color) on the inner side of the entrance wall.
  const d = doors[0];
  if (spec.plate !== false) {
    const px = d && (d.side === "top" || d.side === "bottom") ? Math.min(Math.max(d.at + d.size + 1, x0 + 1), x1 - 5) : x0 + 1;
    const py = d && d.side === "bottom" ? y1 - 1 : y0 + 1;
    put("plate", px, py, Math.min(6, x1 - px), 1, { label: spec.name, color: AREAS[area].color });
  }
  return spec;
}

function carveDoors(r) {
  for (const d of r._doors) {
    for (let i = 0; i < d.size; i++) {
      const [x, y] =
        d.side === "top" ? [d.at + i, r.y0] : d.side === "bottom" ? [d.at + i, r.y1] : d.side === "left" ? [r.x0, d.at + i] : [r.x1, d.at + i];
      wallGrid[idx(x, y)] = false;
      put("door", x, y, 1, 1, { side: d.side });
    }
  }
}

/** Desk pods: 2 desks facing 2 desks, chairs outside. Footprint 4x4 tiles. */
function desks(r, count, opts = {}) {
  const color = AREAS[r.area].color;
  const ix0 = r.x0 + 1;
  const ix1 = r.x1 - 1;
  const iy0 = r.y0 + 2 + (opts.top ?? 0); // leave the plate row free
  const iy1 = Math.min(r.y1 - 1, opts.maxY ?? Infinity);
  const podsPerRow = Math.max(1, Math.floor((ix1 - ix0 + 2) / 5));
  const rowW = podsPerRow * 5 - 1;
  const startX = ix0 + Math.floor((ix1 - ix0 + 1 - rowW) / 2);
  let placed = 0;
  for (let py = iy0; py + 3 <= iy1 && placed < count; py += 5) {
    for (let p = 0; p < podsPerRow && placed < count; p++) {
      const px = startX + p * 5;
      put("rug", px - 0, py, 4, 4, { color });
      for (const [dx, dy, facing] of [
        [0, 1, "down"],
        [2, 1, "down"],
        [0, 2, "up"],
        [2, 2, "up"],
      ]) {
        if (placed >= count) break;
        put("desk", px + dx, py + dy, 2, 1, { color, facing });
        put("chair", px + dx, facing === "down" ? py : py + 3, 2, 1, { color, facing });
        collide(px + dx, py + dy, 2, 1, `desk-${r.id}-${placed}`);
        placed++;
      }
    }
  }
  if (Number.isFinite(count) && placed < count) throw new Error(`${r.id}: only ${placed}/${count} desks fit`);
  return placed;
}

function meetingTable(r, seats, opts = {}) {
  const ix0 = r.x0 + 1;
  const ix1 = r.x1 - 1;
  const iy0 = r.y0 + 2;
  const iy1 = r.y1 - 1;
  const tw = opts.w ?? Math.max(2, Math.min(ix1 - ix0 - 3, Math.ceil(seats / 2)));
  const th = opts.h ?? 2;
  const tx = ix0 + Math.floor((ix1 - ix0 + 1 - tw) / 2);
  const ty = iy0 + Math.floor((iy1 - iy0 + 1 - th) / 2);
  put("table", tx, ty, tw, th, { color: AREAS[r.area].color });
  collide(tx, ty, tw, th, `table-${r.id}`);
  for (let i = 0; i < tw; i++) {
    put("chair", tx + i, ty - 1, 1, 1, { facing: "down", color: AREAS[r.area].color });
    put("chair", tx + i, ty + th, 1, 1, { facing: "up", color: AREAS[r.area].color });
  }
  put("screen", tx + Math.floor(tw / 2) - 1, r.y0 + 1, 2, 1, {});
  return { tx, ty, tw, th };
}

const plants = (...pts) => pts.forEach(([x, y]) => put("plant", x, y));

// ---------------------------------------------------------------------------
// Headcount (Airtable · Usuarios activos + equipos) -> desks = people + spare.
// ---------------------------------------------------------------------------
const rooms = [];

// ---- NORTH-WEST: VENTAS (y 0..20) ----
rooms.push(
  room({ id: "ventas-jenn", name: "Ventas · Equipo Jenn", area: "ventas", x0: 0, y0: 0, x1: 14, y1: 9, doors: [{ side: "bottom", at: 6, size: 2 }], people: 6 }),
  room({ id: "ventas-direccion", name: "Dirección Comercial", area: "ventas", x0: 14, y0: 0, x1: 23, y1: 9, doors: [{ side: "bottom", at: 18, size: 2 }], people: 1 }),
  room({ id: "ventas-bahamon", name: "Ventas · Equipo Bahamon", area: "ventas", x0: 23, y0: 0, x1: 32, y1: 9, doors: [{ side: "bottom", at: 27, size: 2 }], people: 2 }),
  room({ id: "ventas-juanfer", name: "Ventas · Equipo Juanfer", area: "ventas", x0: 0, y0: 12, x1: 12, y1: 20, doors: [{ side: "top", at: 5, size: 2 }], people: 4 }),
  room({ id: "ventas-juanes", name: "Ventas · Equipo Juanes", area: "ventas", x0: 12, y0: 12, x1: 22, y1: 20, doors: [{ side: "top", at: 16, size: 2 }], people: 3 }),
  room({ id: "ventas-sala", name: "Sala Ventas", area: "ventas", x0: 22, y0: 12, x1: 32, y1: 20, doors: [{ side: "top", at: 26, size: 2 }], meeting: 8 }),
);

// ---- NORTH-EAST: MARKETING (células) ----
rooms.push(
  room({ id: "mkt-col-c1", name: "MKT COL · Célula 1 Sara & Manu", area: "marketing", x0: 67, y0: 0, x1: 77, y1: 9, doors: [{ side: "bottom", at: 71, size: 2 }], people: 4 }),
  room({ id: "mkt-col-c2", name: "MKT COL · Célula 2 Juli & Bri", area: "marketing", x0: 77, y0: 0, x1: 88, y1: 9, doors: [{ side: "bottom", at: 82, size: 2 }], people: 4 }),
  room({ id: "mkt-c3-cin", name: "MKT COL+GT · Célula 3 Cin & Andrew", area: "marketing", x0: 88, y0: 0, x1: 99, y1: 9, doors: [{ side: "bottom", at: 93, size: 2 }], people: 2 }),
  room({ id: "mkt-gt-c1", name: "MKT GT+MX · Célula 1 Vivi & Mari", area: "marketing", x0: 67, y0: 12, x1: 77, y1: 20, doors: [{ side: "top", at: 71, size: 2 }], people: 2 }),
  room({ id: "mkt-gt-c2", name: "MKT GT+MX · Célula 2 JuanDa & Carlos", area: "marketing", x0: 77, y0: 12, x1: 88, y1: 20, doors: [{ side: "top", at: 82, size: 2 }], people: 3 }),
  room({ id: "mkt-gt-c3", name: "MKT GT+MX · Célula 3 Camilo & MariWar", area: "marketing", x0: 88, y0: 12, x1: 99, y1: 20, doors: [{ side: "top", at: 93, size: 2 }], people: 3 }),
);

// ---- NORTH-CENTER: AUDITORIO (todos) ----
const audi = room({
  id: "auditorio",
  name: "Auditorio Quiiven",
  area: "general",
  floor: G.auditorium,
  x0: 36,
  y0: 0,
  x1: 63,
  y1: 20,
  doors: [
    { side: "bottom", at: 48, size: 4 },
    { side: "left", at: 15, size: 2 },
    { side: "right", at: 15, size: 2 },
  ],
  plate: false,
});
rooms.push(audi);

// ---- MIDDLE-WEST: TECH + OPERACIONES ----
rooms.push(
  room({ id: "tech", name: "Tech", area: "tech", x0: 0, y0: 24, x1: 16, y1: 37, doors: [{ side: "top", at: 7, size: 2 }], people: 5 }),
  room({ id: "operaciones", name: "Operaciones", area: "operaciones", x0: 16, y0: 24, x1: 32, y1: 37, doors: [{ side: "top", at: 23, size: 2 }], people: 4 }),
);

// ---- MIDDLE-EAST: RESTAURANTE + PAUSA ACTIVA ----
const resto = room({ id: "restaurante", name: "Restaurante", area: "general", floor: G.restaurant, x0: 67, y0: 24, x1: 86, y1: 37, doors: [{ side: "top", at: 75, size: 3 }, { side: "left", at: 30, size: 2 }], private: false });
const pausa = room({ id: "pausa-activa", name: "Pausa activa", area: "personas", floor: G.gym, x0: 86, y0: 24, x1: 99, y1: 37, doors: [{ side: "top", at: 91, size: 2 }], private: false });
rooms.push(resto, pausa);

// ---- SOUTH-WEST: SALAS + FINANZAS + RRHH + CEO ----
rooms.push(
  room({ id: "sala-1", name: "Sala 1", area: "general", floor: G.meeting, x0: 0, y0: 41, x1: 8, y1: 48, doors: [{ side: "top", at: 3, size: 2 }], meeting: 6 }),
  room({ id: "sala-2", name: "Sala 2", area: "general", floor: G.meeting, x0: 8, y0: 41, x1: 16, y1: 48, doors: [{ side: "top", at: 11, size: 2 }], meeting: 6 }),
  room({ id: "sala-3", name: "Sala 3", area: "general", floor: G.meeting, x0: 16, y0: 41, x1: 24, y1: 48, doors: [{ side: "top", at: 19, size: 2 }], meeting: 6 }),
  room({ id: "sala-4", name: "Sala 4", area: "general", floor: G.meeting, x0: 24, y0: 41, x1: 32, y1: 48, doors: [{ side: "top", at: 27, size: 2 }], meeting: 6 }),
  room({ id: "finanzas", name: "Finanzas", area: "finanzas", x0: 0, y0: 51, x1: 13, y1: 59, doors: [{ side: "top", at: 6, size: 2 }], people: 4 }),
  room({ id: "rrhh", name: "Talento Humano", area: "personas", x0: 13, y0: 51, x1: 22, y1: 59, doors: [{ side: "top", at: 17, size: 2 }], people: 2 }),
  room({ id: "ceo", name: "Oficina CEO", area: "direccion", x0: 22, y0: 51, x1: 32, y1: 59, doors: [{ side: "top", at: 26, size: 2 }], ceo: true }),
);

// ---- SOUTH-EAST: JUNTAS + CREATIVA + SALAS + CABINAS ----
rooms.push(
  room({ id: "sala-juntas", name: "Sala de juntas", area: "general", floor: G.meeting, x0: 67, y0: 41, x1: 83, y1: 48, doors: [{ side: "top", at: 74, size: 2 }], meeting: 14 }),
  room({ id: "sala-creativa", name: "Sala creativa", area: "general", floor: G.meeting, x0: 83, y0: 41, x1: 99, y1: 48, doors: [{ side: "top", at: 90, size: 2 }], meeting: 10 }),
  room({ id: "sala-5", name: "Sala 5", area: "general", floor: G.meeting, x0: 67, y0: 51, x1: 77, y1: 59, doors: [{ side: "top", at: 71, size: 2 }], meeting: 6 }),
  room({ id: "sala-6", name: "Sala 6", area: "general", floor: G.meeting, x0: 77, y0: 51, x1: 87, y1: 59, doors: [{ side: "top", at: 81, size: 2 }], meeting: 6 }),
);
for (const [i, x0] of [87, 91, 95].entries()) {
  rooms.push(
    room({
      id: `cabina-${i + 1}`,
      name: `Cabina ${i + 1}`,
      area: "general",
      floor: G.meeting,
      x0,
      y0: 51,
      x1: i === 2 ? 99 : x0 + 4,
      y1: 59,
      doors: [{ side: "top", at: x0 + 2, size: 1 }],
      plate: false,
      booth: true,
    }),
  );
}

/** Stable desk id: 100000 + tileX * 100 + tileY. */
function deskId(d) {
  return 100000 + Math.round(d.x) * 100 + Math.round(d.y);
}

// ---- Furnish rooms ----
const deskCount = [];
for (const r of rooms) {
  // Every team room gets as many desks as fit: one per person plus free ones
  // for new people (Tech/Operaciones keep their lounge corner).
  if (r.people) {
    const n = desks(r, Infinity, { maxY: r.id === "tech" || r.id === "operaciones" ? 31 : undefined });
    if (n < r.people + 2) throw new Error(`${r.id}: ${n} desks for ${r.people} people`);
    deskCount.push([r.name, r.people, n]);
  }
  if (r.meeting) meetingTable(r, r.meeting);
  if (r.booth) {
    put("desk", r.x0 + 1, r.y0 + 3, 2, 1, { color: "#2c2c33", facing: "down" });
    put("chair", r.x0 + 1, r.y0 + 2, 2, 1, { facing: "down" });
    collide(r.x0 + 1, r.y0 + 3, 2, 1, `booth-${r.id}`);
    put("plate", r.x0 + 1, r.y0 + 6, 2, 1, { label: r.name.replace("Cabina ", "C"), color: "gradient" });
  }
}
// CEO office: executive desk, small round table, sofa.
{
  const r = rooms.find((x) => x.id === "ceo");
  put("rug", 24, 53, 6, 4, { color: "#2c2c33" });
  put("desk", 26, 54, 3, 1, { color: "#2c2c33", facing: "up", exec: true });
  put("chair", 27, 55, 1, 1, { facing: "up" });
  collide(26, 54, 3, 1, "desk-ceo");
  put("sofa", 23, 57, 3, 1, { color: "#2c2c33" });
  put("bookshelf", 30, 52, 2, 1, {});
  collide(30, 52, 2, 1, "shelf-ceo");
  plants([23, 52], [31, 57]);
  void r;
}
// Extra touches per team rooms.
plants([1, 8], [13, 8], [31, 8], [1, 19], [11, 19], [21, 19], [68, 8], [98, 8], [68, 19], [98, 19], [1, 36], [31, 36], [1, 58], [21, 58]);
put("whiteboard", 10, 25, 3, 1, {});
put("whiteboard", 26, 25, 3, 1, {});
// Lounge corners in the bigger team rooms (Tech, Operaciones).
for (const [x, color] of [[3, "#349ce2"], [19, "#8a8a96"]]) {
  put("rug", x, 32, 10, 4, { color });
  put("sofa", x, 34, 4, 1, { color });
  put("sofa", x + 6, 34, 4, 1, { color });
  put("coffee-table", x + 4, 32, 2, 2, {});
  collide(x + 4.25, 32.25, 1.5, 1.5, `ctable-${x}`);
  put("plant", x + 9, 32, 1, 1, {});
}

// ---- Auditorium: stage, screen, 80 seats (4 rows x 2 blocks of 10) + standing room ----
put("stage", 42, 1, 16, 4, {});
collide(42, 1, 16, 3, "stage");
put("screen-big", 45, 1, 10, 1, { label: "Quiiven" });
put("podium", 49, 3, 2, 1, {});
const seatColors = ["#ffae00", "#18d3b8", "#349ce2", "#ff7442"];
let seats = 0;
for (const [row, y] of [7, 9, 11, 13].entries()) {
  for (const x0 of [38, 52]) {
    for (let i = 0; i < 10; i++) {
      put("seat", x0 + i, y, 1, 1, { color: seatColors[row % seatColors.length] });
      seats++;
    }
  }
}
put("carpet-aisle", 48, 5, 4, 15, {});
plants([37, 1], [62, 1], [37, 19], [62, 19]);

// ---- Garden (open courtyard, x 36..63, y 24..37) ----
fill(36, 24, 63, 37, G.grass);
fill(36, 30, 63, 31, G.path); // E-W path
fill(49, 24, 50, 37, G.path); // N-S path
fill(46, 28, 53, 33, G.path); // plaza
put("fountain", 48, 29, 4, 4, {});
collide(48.5, 29.5, 3, 3, "fountain");
// Pond (NE corner) and trees.
fill(55, 25, 61, 28, G.water);
collide(55, 25, 7, 4, "pond");
for (const [x, y] of [[37, 25], [44, 25], [37, 35], [44, 36], [55, 35], [61, 33], [52, 25]]) {
  put("tree", x, y, 2, 2, {});
  collide(x + 0.5, y + 1.25, 1, 0.75, `tree-${x}-${y}`);
}
for (const [x, y] of [[40, 29], [56, 29], [40, 32], [56, 32]]) put("bench", x, y, 3, 1, {});
for (const [x, y, w, h] of [[38, 26, 4, 2], [57, 33, 3, 2], [39, 33, 4, 2]]) put("flowers", x, y, w, h, {});
// Hedges around the garden, open at the path ends.
for (let x = 36; x <= 63; x++) {
  if (x < 48 || x > 51) {
    put("hedge", x, 24, 1, 1, {});
    put("hedge", x, 37, 1, 1, {});
  }
}
collide(36, 24, 12, 1, "hedge-n1");
collide(52, 24, 12, 1, "hedge-n2");
collide(36, 37, 12, 1, "hedge-s1");
collide(52, 37, 12, 1, "hedge-s2");
zones.push({ id: "jardin", name: "Jardín", kind: "interact", x: 36, y: 24, w: 28, h: 14, area: "general" });

// ---- Restaurant ----
put("counter", 69, 26, 16, 1, { label: "Almuerzo" });
collide(69, 26, 16, 1, "buffet");
for (const ty of [29, 33]) {
  for (const tx of [69, 74, 79]) {
    put("round-table", tx + 1, ty + 1, 2, 2, {});
    collide(tx + 1, ty + 1, 2, 2, `rtable-${tx}-${ty}`);
    for (const [cx, cy] of [[tx + 1, ty], [tx + 2, ty], [tx + 1, ty + 3], [tx + 2, ty + 3]]) put("chair", cx, cy, 1, 1, { facing: cy === ty ? "down" : "up", color: "#ffae00" });
  }
}
put("coffee", 84, 29, 1, 2, {});
collide(84, 29, 1, 2, "coffee");
plants([68, 36], [85, 36]);

// ---- Active break ----
for (const [x, y] of [[88, 27], [91, 27], [94, 27], [88, 30], [91, 30], [94, 30]]) put("mat", x, y, 2, 2, { color: "#ff7442" });
for (const x of [88, 91, 94]) {
  put("bike", x, 34, 2, 1, {});
  collide(x, 34, 2, 1, `bike-${x}`);
}
put("water", 97, 26, 1, 1, {});
collide(97, 26, 1, 1, "water-cooler");
plants([97, 36], [87, 36]);

// ---- Lobby / recepción (open, x 36..63, y 41..58) ----
fill(36, 41, 63, 58, G.lobby);
put("logo-wall", 43, 42, 14, 2, {});
put("reception", 45, 46, 10, 2, {});
collide(45, 46, 10, 2, "reception");
put("sofa", 38, 49, 1, 4, { color: "#18d3b8", vertical: true });
put("sofa", 61, 49, 1, 4, { color: "#349ce2", vertical: true });
put("coffee-table", 39, 50, 2, 2, {});
put("coffee-table", 59, 50, 2, 2, {});
put("entrance", 47, 57, 6, 2, {});
plants([37, 42], [62, 42], [37, 57], [62, 57], [44, 53], [55, 53]);
zones.push({ id: "recepcion", name: "Recepción", kind: "interact", x: 36, y: 41, w: 28, h: 18, area: "general" });

// ---- Doors, then interior walls -> objects (horizontal runs, then vertical) ----
for (const r of rooms) carveDoors(r);
const used = new Array(W * H).fill(false);
const wallObjects = [];
const material = (x, y) => {
  const z = zones.find((z) => x >= z.x - 1 && x <= z.x + z.w && y >= z.y - 1 && y <= z.y + z.h && (z.id.startsWith("sala") || z.id.startsWith("cabina")));
  return z ? "glass" : "stone";
};
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!wallGrid[idx(x, y)] || used[idx(x, y)]) continue;
    let x2 = x;
    while (x2 + 1 < W && wallGrid[idx(x2 + 1, y)] && !used[idx(x2 + 1, y)]) x2++;
    if (x2 > x) {
      for (let i = x; i <= x2; i++) used[idx(i, y)] = true;
      wallObjects.push({ x, y, w: x2 - x + 1, h: 1 });
    }
  }
}
for (let x = 0; x < W; x++) {
  for (let y = 0; y < H; y++) {
    if (!wallGrid[idx(x, y)] || used[idx(x, y)]) continue;
    let y2 = y;
    while (y2 + 1 < H && wallGrid[idx(x, y2 + 1)] && !used[idx(x, y2 + 1)]) y2++;
    for (let i = y; i <= y2; i++) used[idx(x, i)] = true;
    wallObjects.push({ x, y, w: 1, h: y2 - y + 1 });
  }
}
const wallsJson = wallObjects.map((o, i) => ({
  id: `wall-${String(i + 1).padStart(3, "0")}`,
  label: `Muro ${i + 1}`,
  kind: "wall",
  material: material(o.x, o.y),
  x: o.x * TW,
  y: o.y * TW,
  w: o.w * TW,
  h: o.h * TW,
  radius: 0,
  url: "",
}));

// ---- Smart objects ----
smartObjects.push(
  { id: "tv-juntas", label: "TV Sala de juntas — Meet", kind: "meet", material: "wood", x: 73 * TW, y: 42 * TW, w: 64, h: 32, radius: 128, url: "" },
  { id: "tv-auditorio", label: "Pantalla Auditorio — Meet", kind: "meet", material: "wood", x: 48 * TW, y: 5 * TW, w: 128, h: 32, radius: 192, url: "" },
  { id: "board-creativa", label: "Pizarra Sala creativa", kind: "board", material: "wood", x: 89 * TW, y: 42 * TW, w: 64, h: 32, radius: 128, url: "https://excalidraw.com/" },
);

// ---- Spawn: recepción ----
const SPAWN_TILE = { x: 50, y: 52 };

// ============ Tiled JSON ============
let nextId = 1;
const map = {
  compressionlevel: -1,
  width: W,
  height: H,
  tilewidth: TW,
  tileheight: TW,
  infinite: false,
  orientation: "orthogonal",
  renderorder: "right-down",
  type: "map",
  version: "1.10",
  tiledversion: "1.10.2",
  nextlayerid: 7,
  nextobjectid: 1,
  properties: [{ name: "generator", type: "string", value: "scripts/gen-map.mjs (Quiiven office)" }],
  tilesets: [],
  layers: [
    { id: 1, name: "ground", type: "tilelayer", width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: ground },
    { id: 2, name: "walls", type: "tilelayer", width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: walls },
    { id: 3, name: "roof", type: "tilelayer", width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: roof },
    {
      id: 4,
      name: "collision",
      type: "objectgroup",
      objects: collisions.map((c) => ({ id: nextId++, name: c.name, type: "", x: c.x, y: c.y, width: c.w, height: c.h, rectangle: true })),
    },
    {
      id: 5,
      name: "zones",
      type: "objectgroup",
      objects: [
        ...zones.map((z) => ({
          id: nextId++,
          name: z.name,
          type: z.kind,
          x: z.x * TW,
          y: z.y * TW,
          width: z.w * TW,
          height: z.h * TW,
          rectangle: true,
          properties: [
            { name: "zoneId", type: "string", value: z.id },
            { name: "area", type: "string", value: z.area },
          ],
        })),
        { id: nextId++, name: "spawn", type: "spawn", x: SPAWN_TILE.x * TW, y: SPAWN_TILE.y * TW, width: TW, height: TW, rectangle: true, point: false },
      ],
    },
    {
      id: 6,
      name: "decor",
      type: "objectgroup",
      // Desks get an id from their tile position so a claimed desk keeps its
      // owner when the map is regenerated with other changes.
      objects: decor.map((d) => ({
        id: d.type === "desk" ? deskId(d) : nextId++,
        name: d.props.label ?? "",
        type: d.type,
        x: d.x * TW,
        y: d.y * TW,
        width: d.w * TW,
        height: d.h * TW,
        rectangle: true,
        properties: Object.entries(d.props)
          .filter(([k]) => k !== "label")
          .map(([name, value]) => ({ name, type: typeof value === "boolean" ? "bool" : "string", value: String(value) })),
      })),
    },
  ],
};
map.nextobjectid = Math.max(nextId, ...decor.filter((d) => d.type === "desk").map(deskId)) + 1;

writeFileSync(new URL("../apps/web/public/maps/demo.tmj", import.meta.url), JSON.stringify(map));
writeFileSync(new URL("../apps/web/public/walls.json", import.meta.url), JSON.stringify(wallsJson, null, 2));
writeFileSync(new URL("../apps/web/public/objects.json", import.meta.url), JSON.stringify(smartObjects, null, 2));
// Desks per team office (server: auto-assign a free desk of your team).
const deskList = decor
  .filter((d) => d.type === "desk" && !d.props.exec)
  .map((d) => {
    const z = zones.find((q) => d.x >= q.x && d.x < q.x + q.w && d.y >= q.y && d.y < q.y + q.h);
    return { deskId: deskId(d), zone: z?.id ?? "", color: d.props.color ?? "" };
  })
  .filter((d) => d.zone && !d.zone.startsWith("cabina"));
writeFileSync(new URL("../apps/web/public/desks.json", import.meta.url), JSON.stringify(deskList));
const desksTotalX = decor.filter((d) => d.type === "desk").length;
console.table(deskCount.map(([sala, personas, escritorios]) => ({ sala, personas, escritorios })));
console.log(
  `demo.tmj: ${W}x${H} tiles · ${zones.length} zonas · ${desksTotalX} escritorios · ${seats} sillas auditorio · ${decor.length} muebles · ${collisions.length} colisiones`,
);
console.log(`walls.json: ${wallsJson.length} muros · objects.json: ${smartObjects.length} objetos`);
