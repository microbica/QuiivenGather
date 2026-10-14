import { describe, expect, it } from "vitest";
import {
  distToRect,
  nearestObject,
  objectOrigin,
  resolveObjects,
} from "./objects";

const tv = {
  id: "tv",
  label: "TV",
  kind: "meet",
  x: 100,
  y: 100,
  w: 64,
  h: 40,
  radius: 96,
  url: "",
} as const;

describe("objects", () => {
  it("distToRect es 0 dentro y euclidiana fuera", () => {
    expect(distToRect(110, 110, { ...tv })).toBe(0);
    expect(distToRect(100, 100, { ...tv })).toBe(0);
    expect(distToRect(100 - 30, 110, { ...tv })).toBe(30);
  });

  it("nearestObject respeta radio y elige el más cercano", () => {
    const far = { ...tv, id: "far", x: 500, y: 500 };
    expect(nearestObject({ x: 110, y: 150 }, [{ ...tv }, far])).toEqual(
      expect.objectContaining({ id: "tv" }),
    );
    expect(nearestObject({ x: 0, y: 0 }, [{ ...tv }, far])).toBeNull();
  });

  it("resolveObjects valida y aplica override de Meet", () => {
    const objs = resolveObjects(
      [
        { ...tv, url: "" },
        { id: "bad" },
        "nonsense",
        { id: "", label: "x" },
      ],
      "https://meet.google.com/abc-defg-hij",
    );
    expect(objs.map((o) => o.id)).toEqual(["tv", "bad"]);
    expect(objs[0].url).toBe("https://meet.google.com/abc-defg-hij");
    expect(objs[1].kind).toBe("generic");
  });

  it("objectOrigin valida URLs", () => {
    expect(objectOrigin("https://meet.google.com/x")).toBe(
      "https://meet.google.com",
    );
    expect(objectOrigin("not a url")).toBe("");
  });
});
