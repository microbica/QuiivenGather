// Copia assets no-TS a dist/ después de tsc: las migraciones .sql se leen en
// runtime con import.meta.url (ver src/db.ts) y tsc no las emite.
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(path.join(root, "dist", "db"), { recursive: true });
cpSync(
  path.join(root, "src", "db", "migrations"),
  path.join(root, "dist", "db", "migrations"),
  { recursive: true },
);
console.log("[build] migrations -> dist/db/migrations OK");
