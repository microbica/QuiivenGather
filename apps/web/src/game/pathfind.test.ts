import { describe, expect, it } from "vitest";
import { buildNavGrid, findPath, lineClear, STEP } from "./pathfind";

const BODY = { w: 20, h: 28 };

describe("pathfind", () => {
  it("walks straight in an empty room (one waypoint)", () => {
    const g = buildNavGrid({ w: 320, h: 320 }, BODY, []);
    const p = findPath(g, { x: 32, y: 32 }, { x: 288, y: 288 });
    expect(p).toEqual([{ x: 288, y: 288 }]);
  });

  it("goes through a 1-tile doorway in a wall", () => {
    // Vertical wall at x=160..192 with a gap at y=128..160.
    const wall = [
      { x: 160, y: 0, w: 32, h: 128 },
      { x: 160, y: 160, w: 32, h: 160 },
    ];
    const g = buildNavGrid({ w: 320, h: 320 }, BODY, wall);
    const p = findPath(g, { x: 48, y: 48 }, { x: 288, y: 48 });
    expect(p).not.toBeNull();
    // Must pass through the doorway row.
    expect(p!.some((q) => q.y === 144)).toBe(true);
    // Every leg is walkable.
    let a = { x: 48, y: 48 };
    for (const q of p!) {
      expect(lineClear(g, a, q)).toBe(true);
      a = q;
    }
  });

  it("returns null when fully walled off", () => {
    const g = buildNavGrid({ w: 320, h: 320 }, BODY, [{ x: 160, y: 0, w: 32, h: 320 }]);
    expect(findPath(g, { x: 48, y: 48 }, { x: 288, y: 48 })).toBeNull();
  });

  it("snaps a target inside a wall to the nearest open point", () => {
    const g = buildNavGrid({ w: 320, h: 320 }, BODY, [{ x: 128, y: 128, w: 64, h: 64 }]);
    const p = findPath(g, { x: 32, y: 160 }, { x: 160, y: 160 });
    expect(p).not.toBeNull();
    const end = p![p!.length - 1];
    expect(end.x % STEP).toBe(0);
    expect(end.x <= 128 - 10 || end.y <= 128 - 14 || end.y >= 192 + 14 || end.x >= 192 + 10).toBe(true);
  });
});
