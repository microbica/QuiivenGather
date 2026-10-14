// Sesiones: cookie httpOnly <-> google sub, y link con sesiones Colyseus.
// Sin dependencias: parseo manual de cookies.
import { randomBytes } from "node:crypto";

export const SESSION_COOKIE = "gq_session";
const sessions = new Map<string, string>(); // sessionId(cookie) -> google sub
const colyseusLink = new Map<string, string>(); // colyseus sessionId -> google sub

export function createSession(sub: string): string {
  const id = randomBytes(24).toString("hex");
  sessions.set(id, sub);
  return id;
}

export function sessionSub(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) {
      const id = rest.join("=").trim();
      return sessions.get(id) ?? null;
    }
  }
  return null;
}

export function destroySession(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) {
      const id = rest.join("=").trim();
      const sub = sessions.get(id) ?? null;
      sessions.delete(id);
      return sub;
    }
  }
  return null;
}

export function setCookieHeader(sessionId: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`;
}

export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Link WS <-> Google: se crea en GameRoom.onJoin leyendo la cookie del upgrade. */
export function linkColyseus(colyseusId: string, sub: string): void {
  colyseusLink.set(colyseusId, sub);
}

export function unlinkColyseus(colyseusId: string): void {
  colyseusLink.delete(colyseusId);
}

export function linkedSub(colyseusId: string): string | null {
  return colyseusLink.get(colyseusId) ?? null;
}
