import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ADMIN_EMAIL,
  deleteObject,
  getRole,
  getUser,
  initDb,
  listObjects,
  setTestDbPath,
  upsertObject,
  upsertUser,
} from "./db.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "gq-db-"));
  setTestDbPath(join(dir, "test.db"));
});

afterAll(() => {
  setTestDbPath("");
  rmSync(dir, { recursive: true, force: true });
});

describe("db seed admin", () => {
  it("creates alejandro.moreno@quiiven.com as admin by default", () => {
    initDb();
    expect(getRole(ADMIN_EMAIL)).toBe("admin");
    expect(getUser(ADMIN_EMAIL)?.role).toBe("admin");
  });

  it("regular users get role user", () => {
    const u = upsertUser("persona@quiiven.com");
    expect(u.role).toBe("user");
    expect(getRole("persona@quiiven.com")).toBe("user");
  });
});

describe("db objects", () => {
  it("seeds from objects.json and lists them", () => {
    initDb();
    const objs = listObjects();
    expect(objs.length).toBeGreaterThan(0);
    expect(objs.map((o) => o.id)).toContain("tv-sala1");
  });

  it("upsert + delete object persists", () => {
    initDb();
    upsertObject({
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
    });
    expect(listObjects().map((o) => o.id)).toContain("obj-test");
    deleteObject("obj-test");
    expect(listObjects().map((o) => o.id)).not.toContain("obj-test");
  });
});
