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

  it("demo.tmj (oficina Quiiven) tiene capas, zonas por área y spawn libre", () => {
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
    // Auditorio para todos (privado), jardín y recepción abiertos.
    expect(zoneAt(50 * 32, 10 * 32, map.zones)?.id).toBe("auditorio");
    expect(zoneAt(50 * 32, 26 * 32, map.zones)?.kind).toBe("interact");
    expect(zoneAt(map.spawn.x, map.spawn.y, map.zones)?.id).toBe("recepcion");
    // Cada oficina de equipo trae su área para el color.
    expect(map.zones.find((z) => z.id === "ventas-jenn")?.area).toBe("ventas");
    expect(map.zones.find((z) => z.id === "mkt-col-c1")?.area).toBe("marketing");
    expect(map.decor.filter((d) => d.type === "desk").length).toBeGreaterThanOrEqual(56);
  });
});
