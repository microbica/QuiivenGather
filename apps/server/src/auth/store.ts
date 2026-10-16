// Token store: refresh tokens cifrados con AES-256-GCM en disco local.
// Clave desde GOOGLE_TOKEN_KEY (hex 64). En prod: Postgres + KMS.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TokenSet } from "./google.js";

const DEFAULT_FILE = join(process.cwd(), "data", "google-tokens.json");
let customFile: string | null = null;

export function setTestTokenFile(p: string): void {
  customFile = p;
}

function getFile(): string {
  return customFile ?? DEFAULT_FILE;
}

function key(): Buffer {
  const hex = process.env.GOOGLE_TOKEN_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("GOOGLE_TOKEN_KEY debe ser hex de 32 bytes");
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}

function decrypt(enc: string): string {
  const [iv, tag, data] = enc.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

interface Stored {
  email: string;
  name: string;
  access: string; // encrypted TokenSet fragment
  refresh: string; // encrypted
  expiresAt: number;
}

function readAll(): Record<string, Stored> {
  try {
    return JSON.parse(readFileSync(getFile(), "utf8")) as Record<string, Stored>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Stored>): void {
  mkdirSync(dirname(getFile()), { recursive: true });
  writeFileSync(getFile(), JSON.stringify(all), { mode: 0o600 });
}

export function saveTokens(
  sub: string,
  profile: { email: string; name: string },
  tokens: TokenSet,
  prevRefresh?: string,
): void {
  const all = readAll();
  const prev = all[sub];
  const refresh = tokens.refresh_token ?? prevRefresh ?? "";
  all[sub] = {
    email: profile.email,
    name: profile.name,
    access: encrypt(tokens.access_token),
    refresh: refresh ? encrypt(refresh) : (prev?.refresh ?? ""),
    expiresAt: tokens.expires_at,
  };
  writeAll(all);
}

export function getTokens(sub: string): {
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null {
  const s = readAll()[sub];
  if (!s || !s.refresh) return null;
  return {
    email: s.email,
    name: s.name,
    accessToken: decrypt(s.access),
    refreshToken: decrypt(s.refresh),
    expiresAt: s.expiresAt,
  };
}

export function deleteTokens(sub: string): void {
  const all = readAll();
  delete all[sub];
  writeAll(all);
}

/** Borra los tokens de todas las sesiones vinculadas a un email. Devuelve si borró algo. */
export function deleteTokensByEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const all = readAll();
  let changed = false;
  for (const [sub, s] of Object.entries(all)) {
    if (s.email.toLowerCase() === lower) {
      delete all[sub];
      changed = true;
    }
  }
  if (changed) writeAll(all);
  return changed;
}
