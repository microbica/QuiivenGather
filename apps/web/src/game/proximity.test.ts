import { describe, expect, it } from "vitest";
import { distancePx, isConnected } from "./proximity";

const R = 5 * 32; // 5 tiles
const open = { zoneId: "", zoneKind: "" };
const sala1 = { zoneId: "sala-1", zoneKind: "private" };
const sala2 = { zoneId: "sala-2", zoneKind: "private" };
const stand = { zoneId: "tv-1", zoneKind: "interact" };

describe("proximity", () => {
  it("distancia euclidiana", () => {
    expect(distancePx({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("radial en zona abierta", () => {
    expect(isConnected(open, open, 100, R)).toBe(true);
    expect(isConnected(open, open, R, R)).toBe(true);
    expect(isConnected(open, open, R + 1, R)).toBe(false);
  });

  it("misma zona privada conecta aunque estén lejos", () => {
    expect(isConnected(sala1, sala1, 9999, R)).toBe(true);
  });

  it("zona privada distinta suprime el radial", () => {
    expect(isConnected(sala1, sala2, 10, R)).toBe(false);
  });

  it("dentro/fuera de privada no conecta aunque estén pegados", () => {
    expect(isConnected(sala1, open, 10, R)).toBe(false);
    expect(isConnected(open, sala1, 10, R)).toBe(false);
  });

  it("zona interact no aísla, usa radial", () => {
    expect(isConnected(stand, open, 10, R)).toBe(true);
    expect(isConnected(stand, open, R + 50, R)).toBe(false);
  });

  it("conversación cerrada: solo se oyen sus miembros", () => {
    const a = { ...open, bubble: "b1" };
    expect(isConnected(a, { ...open, bubble: "b1" }, R + 200, R)).toBe(true);
    expect(isConnected(a, open, 10, R)).toBe(false);
    expect(isConnected(open, a, 10, R)).toBe(false);
    expect(isConnected(a, { ...open, bubble: "b2" }, 10, R)).toBe(false);
    expect(isConnected({ ...sala1, bubble: "b1" }, { ...sala1, bubble: "" }, 10, R)).toBe(false);
  });
});
