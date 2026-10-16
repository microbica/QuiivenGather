import { describe, expect, it } from "vitest";
import { buildInteractables, nearestInteractable } from "./interactions";
import type { DecorItem } from "./mapLoader";

const item = (type: string, x: number, y: number, w: number, h: number, props: Record<string, string> = {}): DecorItem => ({
  type,
  label: "",
  props,
  x,
  y,
  w,
  h,
});

describe("interactions", () => {
  it("a desk chair is one seat; a sofa offers one seat per tile", () => {
    const list = buildInteractables(
      [item("chair", 0, 0, 64, 32, { facing: "down" }), item("sofa", 200, 0, 128, 32), item("desk", 0, 32, 64, 32)],
      32,
    );
    expect(list.filter((i) => i.id.startsWith("chair"))).toHaveLength(1);
    expect(list.filter((i) => i.id.startsWith("sofa"))).toHaveLength(4);
    expect(list.some((i) => i.id.startsWith("desk"))).toBe(false);
  });

  it("coffee, water and mats map to their activities", () => {
    const list = buildInteractables([item("coffee", 0, 0, 32, 64), item("water", 100, 0, 32, 32), item("mat", 200, 0, 64, 64)], 32);
    expect(list.map((i) => i.activity)).toEqual(["drink", "drink", "stretch"]);
  });

  it("finds the nearest one within range only", () => {
    const list = buildInteractables([item("seat", 0, 0, 32, 32), item("seat", 320, 0, 32, 32)], 32);
    expect(nearestInteractable(list, 20, 30)?.id).toBe("seat-0-0");
    expect(nearestInteractable(list, 160, 30)).toBeNull();
  });
});
