// PostgreSQL via `pg` (pure JS). Migraciones en src/db/migrations/ se ejecutan
// en orden al iniciar. Reemplaza al anterior node:sqlite.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, types } from "pg";

// BIGINT (OID 20) viene como string por defecto en `pg`. Parseamos a number
// porque todos nuestros valores caben en MAX_SAFE_INTEGER (timestamps ~1.7e12,
// color hasta 0xFFFFFF = 16M, x/y hasta 3200).
types.setTypeParser(20, (v: string) => parseInt(v, 10));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resuelve src/db/migrations en dev (tsx, __dirname=src) y dist/db/migrations en prod. */
function resolveMigrationsDir(): string {
  const candidates = [
    // tsx/dev: src/… ; prod: dist/… (ver scripts/copy-assets.mjs).
    path.resolve(__dirname, "db", "migrations"),
    // cwd = apps/server (pnpm dev / tsx).
    path.resolve(process.cwd(), "src", "db", "migrations"),
    // cwd = raíz del monorepo.
    path.resolve(process.cwd(), "apps", "server", "src", "db", "migrations"),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* noop */
    }
  }
  return candidates[0]; // error claro (ENOENT) si no existe ninguno
}
const MIGRATIONS_DIR = resolveMigrationsDir();

/** El seed lee apps/web/public desde cwd=apps/server (dev) o raíz/Docker (prod). */
function resolvePublicDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "..", "..", "apps", "web", "public"), // dev: cwd=apps/server
    path.resolve(process.cwd(), "apps", "web", "public"), // raíz monorepo y Docker (/app)
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* noop */
    }
  }
  return candidates[0];
}
const DEFAULT_URL = ""; // forzar DATABASE_URL

let pool: Pool | null = null;
let customUrl: string | null = null;

export function setTestDatabaseUrl(url: string | null): void {
  customUrl = url;
}

function getConnectionString(): string {
  const url = customUrl ?? process.env.DATABASE_URL ?? DEFAULT_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL no configurada. Define la variable de entorno o usa setTestDatabaseUrl().",
    );
  }
  return url;
}

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

export interface DbPlayerState {
  x: number;
  y: number;
  dir: string;
  anim: string;
  zoneId: string;
  color: number;
}

export const ADMIN_EMAIL =
  process.env.GOOGLE_ADMIN_EMAIL ?? "alejandro.moreno@quiiven.com";

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const url = getConnectionString();
  pool = new Pool({ connectionString: url });
  // Verificar conexión (fail-fast con mensaje claro).
  await pool.query("SELECT 1");
  return pool;
}

export async function initDb(): Promise<void> {
  // Asegura que el pool existe y las migraciones están aplicadas.
  await runMigrations(await getPool());
  await seedAdmin(await getPool());
  await seedObjects(await getPool());
}

async function runMigrations(p: Pool): Promise<void> {
  await p.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at BIGINT NOT NULL
    );
  `);
  const { rows } = await p.query<{ name: string }>(
    "SELECT name FROM _migrations",
  );
  const applied = new Set(rows.map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const insert = "INSERT INTO _migrations (name, applied_at) VALUES ($1, $2)";
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(insert, [file, Date.now()]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

async function seedAdmin(p: Pool): Promise<void> {
  // Invariante: la cuenta bootstrap siempre es admin (se re-aplica en cada arranque).
  await p.query(
    "INSERT INTO users (email, role, created_at) VALUES ($1, 'admin', $2) ON CONFLICT(email) DO UPDATE SET role = 'admin'",
    [ADMIN_EMAIL.toLowerCase(), Date.now()],
  );
}

async function seedObjectsFromFile(
  p: Pool,
  sql: string,
  file: string,
): Promise<void> {
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
    await p.query(sql, [
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
    ]);
  }
}

async function seedObjects(p: Pool): Promise<void> {
  const { rows } = await p.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM objects",
  );
  if (Number(rows[0].n) > 0) return;
  const publicDir = resolvePublicDir();
  const sql =
    `INSERT INTO objects (id, label, kind, material, x, y, w, h, radius, url, rotation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`;
  // Orden: primero objetos "lógicos" (TV, pizarra), luego muros del mapa.
  await seedObjectsFromFile(p, sql, path.join(publicDir, "objects.json"));
  await seedObjectsFromFile(p, sql, path.join(publicDir, "walls.json"));
}

export async function getUser(email: string): Promise<DbUser | null> {
  const lower = email.toLowerCase();
  const { rows } = await (await getPool()).query<DbUser>(
    "SELECT email, role FROM users WHERE email = $1",
    [lower],
  );
  return rows[0] ?? null;
}

export async function upsertUser(email: string): Promise<DbUser> {
  const lower = email.toLowerCase();
  const existing = await getUser(lower);
  if (existing) return existing;
  // La cuenta bootstrap nace como admin; el resto como user.
  const role = lower === ADMIN_EMAIL.toLowerCase() ? "admin" : "user";
  const p = await getPool();
  await p.query(
    "INSERT INTO users (email, role, created_at) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
    [lower, role, Date.now()],
  );
  return { email: lower, role };
}

export const VALID_ROLES = ["admin", "user"] as const;
export type Role = (typeof VALID_ROLES)[number];

/** Todos los usuarios (visible solo para admin vía API). */
export async function listUsers(): Promise<DbUser[]> {
  const { rows } = await (await getPool()).query<DbUser>(
    "SELECT email, role FROM users ORDER BY email",
  );
  return rows;
}

export interface DbPlayerRow extends DbPlayerState {
  email: string;
  updatedAt: number;
}

/** Estado guardado de todos los jugadores (tabla de admin). */
export async function listPlayers(): Promise<DbPlayerRow[]> {
  const { rows } = await (await getPool()).query<{
    email: string;
    x: number;
    y: number;
    dir: string;
    anim: string;
    zone_id: string;
    color: number;
    updated_at: number;
  }>(
    "SELECT email, x, y, dir, anim, zone_id, color, updated_at FROM players ORDER BY email",
  );
  return rows.map((r) => ({
    email: r.email,
    x: r.x,
    y: r.y,
    dir: r.dir,
    anim: r.anim,
    zoneId: r.zone_id,
    color: r.color,
    updatedAt: r.updated_at,
  }));
}

/**
 * Borra un usuario y su estado guardado. Devuelve la fila borrada o null
 * si el email no existe. Los tokens Google se borran aparte (store.ts).
 */
export async function deleteUser(email: string): Promise<DbUser | null> {
  const lower = email.toLowerCase();
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM players WHERE email = $1", [lower]);
    await client.query("DELETE FROM desks WHERE email = $1", [lower]);
    const { rows } = await client.query<DbUser>(
      "DELETE FROM users WHERE email = $1 RETURNING email, role",
      [lower],
    );
    await client.query("COMMIT");
    return rows[0] ?? null;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Cambia el rol de un usuario existente; null si el email no existe. */
export async function setUserRole(
  email: string,
  role: Role,
): Promise<DbUser | null> {
  const { rows } = await (await getPool()).query<DbUser>(
    "UPDATE users SET role = $2 WHERE email = $1 RETURNING email, role",
    [email.toLowerCase(), role],
  );
  return rows[0] ?? null;
}

export async function getRole(email: string): Promise<string> {
  const u = await getUser(email);
  if (u) return u.role;
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? "admin" : "user";
}

export async function listObjects(): Promise<DbObject[]> {
  const { rows } = await (await getPool()).query<DbObject>(
    "SELECT id, label, kind, material, x, y, w, h, radius, url, rotation FROM objects",
  );
  return rows;
}

export async function upsertObject(o: DbObject): Promise<void> {
  await (await getPool()).query(
    `INSERT INTO objects (id, label, kind, material, x, y, w, h, radius, url, rotation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       label=excluded.label, kind=excluded.kind, material=excluded.material,
       x=excluded.x, y=excluded.y, w=excluded.w, h=excluded.h,
       radius=excluded.radius, url=excluded.url, rotation=excluded.rotation`,
    [
      o.id,
      o.label,
      o.kind,
      o.material,
      o.x,
      o.y,
      o.w,
      o.h,
      o.radius,
      o.url,
      o.rotation,
    ],
  );
}

export async function deleteObject(id: string): Promise<void> {
  await (await getPool()).query("DELETE FROM objects WHERE id = $1", [id]);
}

export async function getPlayerState(email: string): Promise<DbPlayerState | null> {
  const { rows } = await (await getPool()).query<{
    x: number;
    y: number;
    dir: string;
    anim: string;
    zone_id: string;
    color: number;
  }>(
    "SELECT x, y, dir, anim, zone_id, color FROM players WHERE email = $1",
    [email.toLowerCase()],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    x: r.x,
    y: r.y,
    dir: r.dir,
    anim: r.anim,
    zoneId: r.zone_id,
    color: r.color,
  };
}

export async function savePlayerState(
  email: string,
  s: DbPlayerState,
): Promise<void> {
  await (await getPool()).query(
    `INSERT INTO players (email, x, y, dir, anim, zone_id, color, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (email) DO UPDATE SET
       x=excluded.x, y=excluded.y, dir=excluded.dir,
       anim=excluded.anim, zone_id=excluded.zone_id,
       color=excluded.color, updated_at=excluded.updated_at`,
    [email.toLowerCase(), s.x, s.y, s.dir, s.anim, s.zoneId, s.color, Date.now()],
  );
}

/** Escena guardada de una pizarra (JSON Excalidraw) o null si está vacía. */
export async function getBoardScene(boardId: string): Promise<unknown | null> {
  const { rows } = await (await getPool()).query<{ scene: unknown }>(
    "SELECT scene FROM board_scenes WHERE board_id = $1",
    [boardId],
  );
  return rows[0]?.scene ?? null;
}

/** Guarda (upsert) la escena de una pizarra. Ya validada en la ruta. */
export async function saveBoardScene(boardId: string, scene: unknown): Promise<void> {
  await (await getPool()).query(
    `INSERT INTO board_scenes (board_id, scene, updated_at) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (board_id) DO UPDATE SET scene = excluded.scene, updated_at = excluded.updated_at`,
    [boardId, JSON.stringify(scene), Date.now()],
  );
}

export interface DbDesk {
  deskId: number;
  email: string;
  ownerName: string;
  /** Decoración ya validada (JSON). */
  config: string;
}

/** Escritorios reclamados (se cargan al crear la sala). */
export async function listDesks(): Promise<DbDesk[]> {
  const { rows } = await (await getPool()).query<{ desk_id: number; email: string; owner_name: string; config: unknown }>(
    "SELECT desk_id, email, owner_name, config FROM desks",
  );
  return rows.map((r) => ({ deskId: r.desk_id, email: r.email, ownerName: r.owner_name, config: JSON.stringify(r.config ?? {}) }));
}

/**
 * Guarda el escritorio de una persona (suelta el que tuviera antes). Devuelve
 * false si ese escritorio ya es de otra persona.
 */
export async function saveDesk(email: string, deskId: number, ownerName: string, config: string): Promise<boolean> {
  const lower = email.toLowerCase();
  const client = await (await getPool()).connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM desks WHERE email = $1 AND desk_id <> $2", [lower, deskId]);
    const { rowCount } = await client.query(
      `INSERT INTO desks (desk_id, email, owner_name, config, updated_at) VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (desk_id) DO UPDATE SET owner_name = excluded.owner_name, config = excluded.config, updated_at = excluded.updated_at
       WHERE desks.email = excluded.email`,
      [deskId, lower, ownerName, config, Date.now()],
    );
    if (!rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Suelta un escritorio (por dueño o por id, para el admin). */
export async function releaseDesk(by: { email?: string; deskId?: number }): Promise<void> {
  const p = await getPool();
  if (by.email) await p.query("DELETE FROM desks WHERE email = $1", [by.email.toLowerCase()]);
  else if (by.deskId !== undefined) await p.query("DELETE FROM desks WHERE desk_id = $1", [by.deskId]);
}

/** Cierra el pool. Llamar en shutdown. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
