// Cliente de la API de administración (solo rol admin).
// Cookies httpOnly via fetch credentials, igual que api/google.ts.
const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:2567";

export interface AdminUser {
  email: string;
  role: string;
}

export interface AdminPlayerRow {
  email: string;
  x: number;
  y: number;
  dir: string;
  anim: string;
  zoneId: string;
  color: number;
  updatedAt: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = (body as { error?: unknown }).error;
    throw new Error(typeof err === "string" ? err : `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function listUsers(): Promise<AdminUser[]> {
  const r = await fetch(`${BASE}/api/admin/users`, { credentials: "include" });
  const body = await json<{ users: AdminUser[] }>(r);
  return body.users;
}

export async function setUserRole(email: string, role: string): Promise<AdminUser> {
  const r = await fetch(`${BASE}/api/admin/role`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  const body = await json<{ user: AdminUser }>(r);
  return body.user;
}

export async function deleteUser(email: string): Promise<AdminUser> {
  const r = await fetch(`${BASE}/api/admin/users/${encodeURIComponent(email)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const body = await json<{ deleted: AdminUser }>(r);
  return body.deleted;
}

export async function listPlayers(): Promise<AdminPlayerRow[]> {
  const r = await fetch(`${BASE}/api/admin/players`, { credentials: "include" });
  const body = await json<{ players: AdminPlayerRow[] }>(r);
  return body.players;
}
