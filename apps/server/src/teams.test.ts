import { describe, expect, it } from "vitest";
import { freeDeskIn, roomForRecord } from "./teams.js";

describe("teams → team office", () => {
  it("uses the sales team or marketing cell first", () => {
    expect(roomForRecord({ fldOGIkMgO8P5MdI4: [{ id: "recUeARDsE6T5ouM7", name: "Ventas: Equipo Jenn" }] })).toBe("ventas-jenn");
    expect(roomForRecord({ fldQB1ukcKYvSWgIv: ["recMcwco61x8XREBX"], fld3ZY7mrkP9DrWzw: { name: "Mercadeo" } })).toBe("mkt-gt-c3");
  });
  it("falls back to the area", () => {
    expect(roomForRecord({ fld3ZY7mrkP9DrWzw: { name: "Tech" } })).toBe("tech");
    expect(roomForRecord({ fld3ZY7mrkP9DrWzw: { name: "Ventas" } })).toBe("ventas-direccion");
    expect(roomForRecord({ fldQZrjmSZ3trM4Tv: { valuesByLinkedRecordId: {} } })).toBe("");
    expect(roomForRecord({ fldQZrjmSZ3trM4Tv: ["Operaciones"] })).toBe("operaciones");
  });
  it("picks the first free desk of the office", () => {
    const list = [
      { deskId: 100205, zone: "tech", color: "" },
      { deskId: 100105, zone: "tech", color: "" },
      { deskId: 100106, zone: "rrhh", color: "" },
    ];
    expect(freeDeskIn("tech", new Set(), list)?.deskId).toBe(100105);
    expect(freeDeskIn("tech", new Set([100105]), list)?.deskId).toBe(100205);
    expect(freeDeskIn("tech", new Set([100105, 100205]), list)).toBeNull();
  });
});
