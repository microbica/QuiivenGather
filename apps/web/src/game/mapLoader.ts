// Pure map logic: parse Tiled .tmj, AABB collision, rect zones.
// No PixiJS here so it stays unit-testable. All coordinates in pixels.

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zone extends AABB {
  id: string;
  label: string;
  kind: "private" | "spawn" | "interact";
}

export interface GameMap {
  tile: number;
  widthTiles: number;
  heightTiles: number;
  widthPx: number;
  heightPx: number;
  ground: number[];
  walls: number[];
  roof: number[];
  collisions: AABB[];
  zones: Zone[];
  spawn: { x: number; y: number };
}

interface TmjObject {
  name?: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: { name: string; value: unknown }[];
}

interface TmjLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: TmjObject[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseMap(json: any): GameMap {
  const tile = json.tilewidth as number;
  const widthTiles = json.width as number;
  const heightTiles = json.height as number;
  const layers = json.layers as TmjLayer[];

  const tileLayer = (name: string): number[] => {
    const layer = layers.find((l) => l.name === name && l.type === "tilelayer");
    if (!layer?.data) throw new Error(`map missing tilelayer "${name}"`);
    return layer.data;
  };

  const collisions: AABB[] = [];
  const zones: Zone[] = [];
  let spawn = { x: (widthTiles * tile) / 2, y: (heightTiles * tile) / 2 };

  for (const layer of layers.filter((l) => l.type === "objectgroup")) {
    for (const o of layer.objects ?? []) {
      if (layer.name === "collision") {
        collisions.push({ x: o.x, y: o.y, w: o.width ?? 0, h: o.height ?? 0 });
      } else if (layer.name === "zones") {
        if (o.type === "spawn") {
          spawn = { x: o.x + (o.width ?? 0) / 2, y: o.y + (o.height ?? 0) / 2 };
        } else {
          const zoneId =
            o.properties?.find((p) => p.name === "zoneId")?.value ?? o.name;
          zones.push({
            id: String(zoneId ?? o.name ?? "zone"),
            label: o.name ?? "zone",
            kind: o.type === "private" ? "private" : "interact",
            x: o.x,
            y: o.y,
            w: o.width ?? 0,
            h: o.height ?? 0,
          });
        }
      }
    }
  }

  return {
    tile,
    widthTiles,
    heightTiles,
    widthPx: widthTiles * tile,
    heightPx: heightTiles * tile,
    ground: tileLayer("ground"),
    walls: tileLayer("walls"),
    roof: tileLayer("roof"),
    collisions,
    zones,
    spawn,
  };
}

export function overlaps(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function hitsCollision(box: AABB, collisions: AABB[]): boolean {
  return collisions.some((c) => overlaps(box, c));
}

export function zoneAt(x: number, y: number, zones: Zone[]): Zone | null {
  for (const z of zones) {
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
  }
  return null;
}

/** Axis-separated move: slide along walls instead of sticking. */
export function moveWithCollision(
  pos: { x: number; y: number },
  dx: number,
  dy: number,
  size: { w: number; h: number },
  collisions: AABB[],
  bounds: { w: number; h: number },
): { x: number; y: number } {
  const tryX = {
    x: Math.min(Math.max(pos.x + dx, 0), bounds.w - size.w),
    y: pos.y,
    w: size.w,
    h: size.h,
  };
  const x = hitsCollision(tryX, collisions) ? pos.x : tryX.x;
  const tryY = {
    x,
    y: Math.min(Math.max(pos.y + dy, 0), bounds.h - size.h),
    w: size.w,
    h: size.h,
  };
  const y = hitsCollision(tryY, collisions) ? pos.y : tryY.y;
  return { x, y };
}
