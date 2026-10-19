import { describe, expect, it } from "vitest";
import { DESK_ITEMS, FLOOR_ITEMS, defaultDesk, paintDesk, paintDeskScene, paintFloor, paintItemThumb, sanitizeDesk } from "./desk";

describe("desk", () => {
  it("paints every desk and floor item without errors", () => {
    for (const i of DESK_ITEMS) {
      expect(paintItemThumb(i.id).px.some(Boolean)).toBe(true);
      const d = paintDesk({ ...defaultDesk(1), left: i.id, right: i.id }, "down");
      expect(d.px.length).toBe(d.w * d.h);
    }
    for (const f of FLOOR_ITEMS) expect(paintFloor(f.id).px.some(Boolean)).toBe(true);
    expect(paintDeskScene(defaultDesk(1)).px.some(Boolean)).toBe(true);
  });

  it("keeps desks saved before the new options", () => {
    const old = sanitizeDesk({ deskId: 7, material: "roble", chairColor: "#ff7442", left: "cactus", right: "bandera-col" });
    expect(old).toMatchObject({ deskId: 7, material: "roble", setup: "monitor", chairStyle: "ergonomica", floor: "ninguno", left: "cactus", right: "bandera-col" });
    expect(sanitizeDesk({ deskId: 1, left: "nope", floor: "nope" })).toMatchObject({ left: "ninguno", floor: "ninguno" });
  });
});
