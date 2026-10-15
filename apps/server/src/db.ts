// SQLite (node:sqlite, built-in en Node 22, sin nativo): users con rol y
// objetos inteligentes del mapa. Server autoritativo.
// Migraciones en src/db/migrations/ — se ejecutan en orden al iniciar.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "db", "migrations");
const DB_PATH = path.resolve(process.cwd(), "data", "gather.db");
mkdirSync(path.dirname(DB_PATH), { recursive: true });

export interface DbUser {
  email: string;
  role: string;
}

export interface DbObject {
  id: string;
  label: string;
  kind: string;
  material: string;
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  url: string;
  rotation: number;
}

export const ADMIN_EMAIL =
  process.env.GOOGLE_ADMIN_EMAIL ?? "alejandro.moreno@quiiven.com";

let db: DatabaseSync;
let customDbPath: string | null = null;

export function setTestDbPath(p: string): void {
  customDbPath = p;
}

function getDbPath(): string {
  return customDbPath ?? DB_PATH;
}

function init(): DatabaseSync {
  if (db) return db;
  const dbPath = getDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  runMigrations(db);
  seedAdmin();
  seedObjects();
  return db;
}

export function initDb(): void {
  init();
}

function runMigrations(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `);
  const applied = new Set(
    (database.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const insert = database.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    database.exec("BEGIN");
    try {
      database.exec(sql);
      insert.run(file, Date.now());
      database.exec("COMMIT");
    } catch (e) {
      database.exec("ROLLBACK");
      throw e;
    }
  }
}

function seedAdmin(): void {
  const stmt = db.prepare(
    "INSERT INTO users (email, role, created_at) VALUES (?, 'admin', ?) ON CONFLICT(email) DO NOTHING",
  );
  stmt.run(ADMIN_EMAIL.toLowerCase(), Date.now());
}

function seedObjectsFrom(file: string, stmt: ReturnType<typeof db.prepare>): void {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return;
  }
  if (!Array.isArray(raw)) return;
  for (const o of raw as unknown[]) {
    const obj = o as Record<string, unknown>;
    const id = String(obj.id ?? "");
    if (!id) continue;
    stmt.run(
      id,
      String(obj.label ?? id),
      String(obj.kind ?? "board"),
      String(obj.material ?? "wood"),
      Number(obj.x ?? 0),
      Number(obj.y ?? 0),
      Number(obj.w ?? 64),
      Number(obj.h ?? 40),
      Number(obj.radius ?? 96),
      String(obj.url ?? ""),
      Number(obj.rotation ?? 0),
    );
  }
}

function seedObjects(): void {
  const row = db.prepare("SELECT COUNT(*) AS n FROM objects").get() as {
    n: number;
  };
  if (row.n > 0) return;
  const publicDir = path.resolve(
    process.cwd(),
    "..",
    "..",
    "apps",
    "web",
    "public",
  );
  const stmt = db.prepare(
    `INSERT INTO objects (id, label, kind, material, x, y, w, h, radius, url, rotation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Orden: primero objetos "lógicos" (TV, pizarra), luego muros del mapa.
  seedObjectsFrom(path.join(publicDir, "objects.json"), stmt);
  seedObjectsFrom(path.join(publicDir, "walls.json"), stmt);
}

export function getUser(email: string): DbUser | null {
  const row = init()
    .prepare("SELECT email, role FROM users WHERE email = ?")
    .get(email.toLowerCase()) as DbUser | undefined;
  return row ?? null;
}

export function upsertUser(email: string): DbUser {
  const lower = email.toLowerCase();
  const existing = getUser(lower);
  if (existing) return existing;
  init()
    .prepare(
      "INSERT INTO users (email, role, created_at) VALUES (?, 'user', ?)",
    )
    .run(lower, Date.now());
  return { email: lower, role: "user" };
}

export function getRole(email: string): string {
  const u = getUser(email);
  if (u) return u.role;
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? "admin" : "user";
}

export function listObjects(): DbObject[] {
  return init()
    .prepare("SELECT * FROM objects")
    .all() as unknown as DbObject[];
}

export function upsertObject(o: DbObject): void {
  init()
    .prepare(
      `INSERT INTO objects (id, label, kind, material, x, y, w, h, radius, url, rotation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label=excluded.label, kind=excluded.kind, material=excluded.material,
         x=excluded.x, y=excluded.y, w=excluded.w, h=excluded.h,
         radius=excluded.radius, url=excluded.url, rotation=excluded.rotation`,
    )
    .run(o.id, o.label, o.kind, o.material, o.x, o.y, o.w, o.h, o.radius, o.url, o.rotation);
}

export function deleteObject(id: string): void {
  init().prepare("DELETE FROM objects WHERE id = ?").run(id);
}