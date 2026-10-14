import { describe, expect, it } from "vitest";
import {
  hitsCollision,
  moveWithCollision,
  parseMap,
  zoneAt,
} from "./mapLoader";
import demoTmjRaw from "../../public/maps/demo.tmj?raw";

const demoMap = JSON.parse(demoTmjRaw);

const collisions = [
  { x: 0, y: 0, w: 100, h: 32 },
];

describe("mapLoader", () => {
  it("para en pared con movimiento separado por ejes", () => {
    // Corre hacia la pared superior: x avanza, y se queda.
    const next = moveWithCollision(
      { x: 50, y: 40 },
      10,
      -20,
      { w: 20, h: 28 },
      collisions,
      { w: 1000, h: 1000 },
    );
    expect(next.x).toBe(60);
    expect(next.y).toBe(40);
    expect(hitsCollision({ ...next, w: 20, h: 28 }, collisions)).toBe(false);
  });

  it("respeta límites del mapa", () => {
    const next = moveWithCollision(
      { x: 5, y: 5 },
      -100,
      -100,
      { w: 20, h: 28 },
      [],
      { w: 200, h: 200 },
    );
    expect(next).toEqual({ x: 0, y: 0 });
  });

  it("demo.tmj tiene las 5 capas y spawn dentro del mapa", () => {
    const map = parseMap(demoMap);
    expect(map.widthTiles).toBe(100);
    expect(map.heightTiles).toBe(60);
    expect(map.ground).toHaveLength(6000);
    expect(map.collisions.length).toBeGreaterThan(0);
    expect(map.zones.some((z) => z.kind === "private")).toBe(true);
    expect(map.spawn.x).toBeGreaterThan(0);
    expect(map.spawn.y).toBeGreaterThan(0);
    // Spawn no está dentro de una colisión.
    expect(
      hitsCollision(
        { x: map.spawn.x - 10, y: map.spawn.y - 14, w: 20, h: 28 },
        map.collisions,
      ),
    ).toBe(false);
    // Patio es público.
    expect(zoneAt(50 * 32, 5 * 32, map.zones)?.id).toBe("patio");
  });
});
