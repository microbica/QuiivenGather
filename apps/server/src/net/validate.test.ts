import { describe, expect, it } from "vitest";
import { MAP_H, MAP_W, PLAYER_H, PLAYER_W } from "@quiiven/protocol";
import {
  clampMove,
  sanitizeAvatarMsg,
  sanitizeBoardScene,
  sanitizeChat,
  sanitizeName,
  sanitizeStatus,
  sanitizeZone,
  validAnim,
  validBoardDoc,
  validDir,
  validKind,
  validMaterial,
  validRotation,
  validSignal,
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
    expect(far.x).toBeLessThanOrEqual(MAP_W - PLAYER_W);
    expect(far.y).toBeLessThanOrEqual(MAP_H - PLAYER_H);
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

  it("sanitizeZone recorta y tolera tipos", () => {
    expect(sanitizeZone(" sala-1 ")).toBe("sala-1");
    expect(sanitizeZone(undefined)).toBe("");
    expect(sanitizeZone(42)).toBe("");
    expect(sanitizeZone("z".repeat(100)).length).toBe(32);
  });

  it("validSignal solo reenvía a sesiones conectadas con kind válido", () => {
    const sessions = new Set(["a", "b"]);
    expect(validSignal({ to: "b", kind: "offer", sdp: "x" }, sessions)).toEqual({
      to: "b",
      kind: "offer",
      sdp: "x",
      candidate: undefined,
    });
    expect(validSignal({ to: "zzz", kind: "offer" }, sessions)).toBeNull();
    expect(validSignal({ to: "b", kind: "hack" }, sessions)).toBeNull();
    expect(validSignal({ to: "b", kind: "ice", candidate: "y" }, sessions)?.candidate).toBe("y");
  });

  it("dir/anim solo aceptan valores conocidos", () => {
    expect(validDir("left", "down")).toBe("left");
    expect(validDir("hack", "down")).toBe("down");
    expect(validAnim("walk", "idle")).toBe("walk");
    expect(validAnim("fly", "idle")).toBe("idle");
    expect(validAnim("sit", "idle")).toBe("sit");
    expect(validAnim("stretch", "idle")).toBe("stretch");
  });
});

describe("objetos (admin)", () => {
  it("validKind acepta los 6 kinds y cae a generic", () => {
    expect(validKind("wall")).toBe("wall");
    expect(validKind("window")).toBe("window");
    expect(validKind("door")).toBe("door");
    expect(validKind("meet")).toBe("meet");
    expect(validKind("hack")).toBe("generic");
    expect(validKind(undefined)).toBe("generic");
  });

  it("validMaterial acepta los 4 materiales y cae a wood", () => {
    expect(validMaterial("glass")).toBe("glass");
    expect(validMaterial("stone")).toBe("stone");
    expect(validMaterial("plástico")).toBe("wood");
    expect(validMaterial(42)).toBe("wood");
  });

  it("validRotation hace snap a pasos de 30°", () => {
    expect(validRotation(0)).toBe(0);
    expect(validRotation(30)).toBe(30);
    expect(validRotation(44)).toBe(30);
    expect(validRotation(46)).toBe(60);
    expect(validRotation(359)).toBe(0);
    expect(validRotation("nope")).toBe(0);
  });
});

describe("avatar visible", () => {
  it("sanitizeAvatarMsg acepta un avatar válido", () => {
    const a = sanitizeAvatarMsg({
      body: "femenino",
      skin: "#C98A5C",
      hair: "melena",
      hairColor: "#4a2e22",
      top: "camiseta",
      topColor: "#18d3b8",
      pet: "gato",
      petColor: "#f4f4f6",
      accessories: ["gorra", "gafas"],
    });
    expect(a.body).toBe("femenino");
    expect(a.skin).toBe("#c98a5c");
    expect(a.pet).toBe("gato");
    expect(a.accessories).toEqual(["gorra", "gafas"]);
  });

  it("sanitizeAvatarMsg rechaza valores desconocidos y basura", () => {
    const a = sanitizeAvatarMsg({
      body: "robot",
      skin: "red",
      hair: 42,
      topColor: "#zzzzzz",
      pet: "dragón",
      accessories: ["gorra", "hack", "gorra", 7],
    });
    expect(a.body).toBe("");
    expect(a.skin).toBe("");
    expect(a.hair).toBe("");
    expect(a.topColor).toBe("");
    expect(a.pet).toBe("");
    expect(a.accessories).toEqual(["gorra"]);
  });

  it("sanitizeAvatarMsg tolera no-objetos", () => {
    const a = sanitizeAvatarMsg(undefined);
    expect(a.body).toBe("");
    expect(a.accessories).toEqual([]);
  });
});

describe("presencia", () => {
  it("sanitizeStatus acepta los 5 estados", () => {
    for (const s of ["available", "meeting", "busy", "focus", "away"]) {
      expect(sanitizeStatus(s)).toBe(s);
    }
  });

  it("sanitizeStatus cae a available con basura", () => {
    expect(sanitizeStatus("invisible")).toBe("available");
    expect(sanitizeStatus(42)).toBe("available");
    expect(sanitizeStatus(undefined)).toBe("available");
  });
});

describe("pizarra colaborativa", () => {
  it("validBoardDoc acepta escenas con elements acotado", () => {
    expect(validBoardDoc({ type: "excalidraw", version: 2, elements: [] })).toBe(true);
    expect(validBoardDoc({ elements: [{}, {}] })).toBe(true);
    expect(validBoardDoc({})).toBe(false);
    expect(validBoardDoc(null)).toBe(false);
    expect(validBoardDoc([])).toBe(false);
    expect(validBoardDoc({ elements: "nope" })).toBe(false);
    expect(validBoardDoc({ elements: Array(5001).fill({}) })).toBe(false);
    expect(validBoardDoc({ elements: Array(5000).fill({}) })).toBe(true);
  });

  it("sanitizeBoardScene valida id y elements", () => {
    expect(sanitizeBoardScene({ boardId: "board-1", elements: [{ id: "a" }] })).toEqual({
      boardId: "board-1",
      elements: [{ id: "a" }],
    });
    expect(sanitizeBoardScene({ boardId: "bad id!", elements: [] })).toBeNull();
    expect(sanitizeBoardScene({ boardId: "x", elements: Array(5001).fill({}) })).toBeNull();
    expect(sanitizeBoardScene({ boardId: "x", elements: null })).toBeNull();
    expect(sanitizeBoardScene({})).toBeNull();
  });
});
