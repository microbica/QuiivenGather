// Test manual del módulo db (PostgreSQL). Excluido del vitest run normal.
// Ejecutar con DATABASE_URL apuntando a una base de datos de prueba:
//   cd apps/server && TEST_DATABASE_URL=postgresql://... npx vitest run db.manual.test.ts
// Requiere una base de datos PostgreSQL accesible.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_EMAIL,
  deleteObject,
  getRole,
  getUser,
  initDb,
  listObjects,
  savePlayerState,
  getPlayerState,
  setTestDatabaseUrl,
  upsertObject,
  upsertUser,
} from "./db.js";

let dbUrl = "";

beforeAll(() => {
  dbUrl = process.env.TEST_DATABASE_URL ?? "";
  if (!dbUrl) {
    throw new Error(
      "Define TEST_DATABASE_URL con la URL de una base de datos PostgreSQL de prueba.",
    );
  }
  setTestDatabaseUrl(dbUrl);
});

afterAll(() => {
  setTestDatabaseUrl("");
});

describe("db seed admin", () => {
  it("crea alejandro.moreno@quiiven.com como admin por defecto", async () => {
    await initDb();
    expect(await getRole(ADMIN_EMAIL)).toBe("admin");
    expect((await getUser(ADMIN_EMAIL))?.role).toBe("admin");
  });

  it("usuarios nuevos obtienen rol user", async () => {
    const u = await upsertUser("persona@quiiven.com");
    expect(u.role).toBe("user");
    expect(await getRole("persona@quiiven.com")).toBe("user");
  });
});

describe("db objects", () => {
  it("seed desde objects.json + walls.json y lista", async () => {
    await initDb();
    const objs = await listObjects();
    expect(objs.length).toBeGreaterThan(0);
    expect(objs.map((o) => o.id)).toContain("tv-sala1");
  });

  it("upsert + delete object persiste", async () => {
    await initDb();
    await upsertObject({
      id: "obj-test",
      label: "Test",
      kind: "board",
      material: "wood",
      x: 10,
      y: 20,
      w: 64,
      h: 40,
      radius: 96,
      url: "",
      rotation: 0,
    });
    const ids1 = (await listObjects()).map((o) => o.id);
    expect(ids1).toContain("obj-test");
    await deleteObject("obj-test");
    const ids2 = (await listObjects()).map((o) => o.id);
    expect(ids2).not.toContain("obj-test");
  });
});

describe("db player state", () => {
  it("guarda y recupera posición", async () => {
    await initDb();
    const email = `test-${Date.now()}@quiiven.com`;
    await upsertUser(email);
    await savePlayerState(email, {
      x: 100, y: 200, dir: "right", anim: "walk", zoneId: "corridor", color: 0xff00ff,
    });
    const s = await getPlayerState(email);
    expect(s).not.toBeNull();
    expect(s!.x).toBe(100);
    expect(s!.y).toBe(200);
    expect(s!.dir).toBe("right");
    expect(s!.color).toBe(0xff00ff);
  });
});
