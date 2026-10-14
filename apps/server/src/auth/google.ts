// Google OAuth 2.0 + Calendar/Meet (Fase 4.5). Solo stdlib (fetch, crypto).
// Flujo server-side: el secret nunca sale del backend.

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export function googleEnv(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      "http://localhost:2567/auth/google/callback",
  };
}

export function isGoogleConfigured(): boolean {
  const { clientId, clientSecret } = googleEnv();
  return clientId.length > 0 && clientSecret.length > 0;
}

// Login del juego: solo dominio corporativo (Fase 5 / auth real).
export const ALLOWED_DOMAIN = (
  process.env.GOOGLE_ALLOWED_DOMAIN ?? "quiiven.com"
).toLowerCase();
export const ALLOWED_EMAILS = (process.env.GOOGLE_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isEmailAllowed(email: string): boolean {
  const e = email.toLowerCase();
  if (ALLOWED_EMAILS.includes(e)) return true;
  return e.endsWith(`@${ALLOWED_DOMAIN}`);
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = googleEnv();
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const { clientId, clientSecret, redirectUri } = googleEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const body = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
  };
}

export async function refreshAccess(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = googleEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return {
    access_token: body.access_token,
    expires_at: Date.now() + body.expires_in * 1000,
  };
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  const body = (await res.json()) as {
    sub: string;
    email: string;
    name: string;
  };
  return { sub: body.sub, email: body.email, name: body.name };
}

/** Solo acepta links de Meet (evita publicar URLs arbitrarias en el estado). */
export function validMeetUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const t = url.trim();
  if (!t.startsWith("https://meet.google.com/") || t.length > 200) return null;
  try {
    const u = new URL(t);
    if (u.host !== "meet.google.com") return null;
    return u.toString();
  } catch {
    return null;
  }
}
