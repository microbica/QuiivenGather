import { describe, expect, it } from "vitest";
import {
  clampMove,
  sanitizeChat,
  sanitizeName,
  validAnim,
  validDir,
} from "./validate";

describe("clampMove", () => {
  it("acepta movimiento normal a 170px/s", () => {
    // 170px/s * 0.1s = 17px < 260*0.1+6 = 32px
    const next = clampMove({ x: 100, y: 100 }, { x: 117, y: 100 }, 100);
    expect(next).toEqual({ x: 117, y: 100 });
  });

  it("recorta teleports al radio permitido", () => {
    const next = clampMove({ x: 100, y: 100 }, { x: 900, y: 900 }, 100);
    const dist = Math.hypot(next.x - 100, next.y - 100);
    expect(dist).toBeLessThanOrEqual(260 * 0.1 + 6 + 1); // +1 redondeo
    expect(next).not.toEqual({ x: 900, y: 900 });
  });

  it("sujeta a los bordes del mapa", () => {
    expect(clampMove({ x: 10, y: 10 }, { x: -50, y: -50 }, 1000)).toEqual({
      x: 0,
      y: 0,
    });
    const far = clampMove({ x: 1200, y: 900 }, { x: 9999, y: 9999 }, 1000);
    expect(far.x).toBeLessThanOrEqual(1280 - 20);
    expect(far.y).toBeLessThanOrEqual(960 - 28);
  });
});

describe("chat y nombres", () => {
  it("sanitizeChat recorta, limita y rechaza vacío", () => {
    expect(sanitizeChat("  hola  ")).toBe("hola");
    expect(sanitizeChat("   ")).toBeNull();
    expect(sanitizeChat(123)).toBeNull();
    expect(sanitizeChat("x".repeat(500))?.length).toBe(280);
  });

  it("sanitizeName con fallback", () => {
    expect(sanitizeName("  Ana  ", "fb")).toBe("Ana");
    expect(sanitizeName("", "fb")).toBe("fb");
    expect(sanitizeName(undefined, "fb")).toBe("fb");
  });

  it("dir/anim solo aceptan valores conocidos", () => {
    expect(validDir("left", "down")).toBe("left");
    expect(validDir("hack", "down")).toBe("down");
    expect(validAnim("walk", "idle")).toBe("walk");
    expect(validAnim("fly", "idle")).toBe("idle");
  });
});
