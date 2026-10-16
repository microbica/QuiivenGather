// Rutas Google: OAuth + Calendar + Meet (Fase 4.5).
import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import {
  ALLOWED_DOMAIN,
  buildAuthUrl,
  exchangeCode,
  fetchProfile,
  isEmailAllowed,
  isGoogleConfigured,
  refreshAccess,
} from "./google.js";
import {
  clearCookieHeader,
  createSession,
  destroySession,
  sessionSub,
  setCookieHeader,
} from "./sessions.js";
import { deleteTokens, deleteTokensByEmail, getTokens, saveTokens } from "./store.js";
import { deleteUser, getRole, listPlayers, listUsers, setUserRole, upsertUser } from "../db.js";

const pendingState = new Map<string, number>(); // state -> expiry ms

function webOrigin(): string {
  return process.env.SERVER_CORS_ORIGIN ?? "http://localhost:5173";
}

function requireSession(req: Request): string | null {
  return sessionSub(req.headers.cookie);
}

/** Devuelve el email si la sesión pertenece a un admin; si no, null. */
async function requireAdmin(req: Request): Promise<string | null> {
  const sub = requireSession(req);
  if (!sub) return null;
  const t = getTokens(sub);
  if (!t) return null;
  if ((await getRole(t.email)) !== "admin") return null;
  return t.email;
}

async function googleFetch(
  sub: string,
  path: string,
  init?: RequestInit,
): Promise<Awaited<ReturnType<typeof fetch>>> {
  const stored = getTokens(sub);
  if (!stored) throw new Error("not linked");
  let access = stored.accessToken;
  if (stored.expiresAt - Date.now() < 60_000) {
    const fresh = await refreshAccess(stored.refreshToken);
    saveTokens(
      sub,
      { email: stored.email, name: stored.name },
      fresh,
      stored.refreshToken,
    );
    access = fresh.access_token;
  }
  const doFetch = (token: string) =>
    fetch(`https://www.googleapis.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  let res = await doFetch(access);
  if (res.status === 401) {
    const fresh = await refreshAccess(stored.refreshToken);
    saveTokens(
      sub,
      { email: stored.email, name: stored.name },
      fresh,
      stored.refreshToken,
    );
    res = await doFetch(fresh.access_token);
  }
  return res;
}

export function googleRouter(): Router {
  const r = Router();

  r.get("/auth/google", (_req, res) => {
    if (!isGoogleConfigured()) {
      res.status(500).send("Google OAuth no configurado (ver .env)");
      return;
    }
    const state = randomBytes(16).toString("hex");
    pendingState.set(state, Date.now() + 10 * 60_000);
    res.redirect(buildAuthUrl(state));
  });

  r.get("/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const exp = state ? pendingState.get(state) : undefined;
      if (!code || !state || !exp || exp < Date.now()) {
        res.status(400).send("state inválido o expirado");
        return;
      }
      pendingState.delete(state);
      const tokens = await exchangeCode(code);
      const profile = await fetchProfile(tokens.access_token);
      // Login del juego: solo dominio permitido (@quiiven.com por defecto).
      if (!isEmailAllowed(profile.email)) {
        res.status(403).send(
          `<!doctype html><html><body><script>window.opener&&window.opener.postMessage({type:"google-denied",reason:"domain"},"${webOrigin()}");window.close();</script><p>Acceso denegado: se requiere cuenta @${ALLOWED_DOMAIN}.</p></body></html>`,
        );
        return;
      }
      const prev = getTokens(profile.sub);
      saveTokens(
        profile.sub,
        profile,
        tokens,
        tokens.refresh_token ?? prev?.refreshToken,
      );
      await upsertUser(profile.email);
      const sessionId = createSession(profile.sub);
      const secure = webOrigin().startsWith("https://");
      res.setHeader("Set-Cookie", setCookieHeader(sessionId, secure));
      // Popup: avisa al opener y se cierra.
      res.send(
        `<!doctype html><html><body><script>window.opener&&window.opener.postMessage({type:"google-linked"},"${webOrigin()}");window.close();</script><p>Vinculado, puedes cerrar esta ventana.</p></body></html>`,
      );
    } catch (e) {
      res.status(500).send(`OAuth error: ${e instanceof Error ? e.message : e}`);
    }
  });

  r.get("/auth/google/status", async (req, res) => {
    const sub = requireSession(req);
    if (!sub) {
      res.json({ linked: false, configured: isGoogleConfigured(), authorized: false });
      return;
    }
    const t = getTokens(sub);
    const authorized = !!t && isEmailAllowed(t.email);
    res.json({
      linked: !!t,
      email: t?.email ?? null,
      authorized,
      role: t ? await getRole(t.email) : "user",
    });
  });

  r.post("/auth/google/unlink", (req, res) => {
    const sub = destroySession(req.headers.cookie);
    if (sub) deleteTokens(sub);
    res.setHeader("Set-Cookie", clearCookieHeader());
    res.json({ ok: true });
  });

  r.get("/api/calendar/events", async (req, res) => {
    const sub = requireSession(req);
    if (!sub) {
      res.status(401).json({ error: "not linked" });
      return;
    }
    try {
      const timeMin = encodeURIComponent(new Date().toISOString());
      const gres = await googleFetch(
        sub,
        `/calendar/v3/calendars/primary/events?timeMin=${timeMin}&maxResults=10&singleEvents=true&orderBy=startTime`,
      );
      if (!gres.ok) throw new Error(`calendar: ${gres.status}`);
      const body = (await gres.json()) as {
        items?: {
          id: string;
          summary?: string;
          start?: { dateTime?: string; date?: string };
          htmlLink?: string;
          hangoutLink?: string;
        }[];
      };
      res.json({
        events: (body.items ?? []).map((e) => ({
          id: e.id,
          summary: e.summary ?? "(sin título)",
          start: e.start?.dateTime ?? e.start?.date ?? "",
          htmlLink: e.htmlLink ?? "",
          hangoutLink: e.hangoutLink ?? "",
        })),
      });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : e });
    }
  });

  r.post("/api/meetings", async (req, res) => {
    const sub = requireSession(req);
    if (!sub) {
      res.status(401).json({ error: "not linked" });
      return;
    }
    try {
      const { title, minutes, startISO } = req.body as {
        title?: unknown;
        minutes?: unknown;
        startISO?: unknown;
      };
      const summary =
        typeof title === "string" && title.trim()
          ? title.trim().slice(0, 120)
          : "Reunión gatherQuiiven";
      const mins =
        typeof minutes === "number" && minutes >= 5 && minutes <= 480
          ? Math.round(minutes)
          : 30;
      const start =
        typeof startISO === "string" && !Number.isNaN(Date.parse(startISO))
          ? new Date(startISO)
          : new Date();
      const end = new Date(start.getTime() + mins * 60_000);
      const gres = await googleFetch(
        sub,
        "/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        {
          method: "POST",
          body: JSON.stringify({
            summary,
            description: "Creada desde gatherQuiiven",
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
            conferenceData: {
              createRequest: {
                requestId: randomBytes(8).toString("hex"),
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
        },
      );
      if (!gres.ok) throw new Error(`calendar create: ${gres.status}`);
      const body = (await gres.json()) as {
        id: string;
        htmlLink?: string;
        hangoutLink?: string;
        conferenceData?: { entryPoints?: { uri?: string }[] };
      };
      const meetUri =
        body.hangoutLink ??
        body.conferenceData?.entryPoints?.find((e) => e.uri)?.uri ??
        "";
      res.json({ eventId: body.id, htmlLink: body.htmlLink ?? "", meetUri });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : e });
    }
  });

  // Administración de roles (solo admin). Ver la columna `role` de la tabla `users`.
  r.get("/api/admin/users", async (req, res) => {
    if (!(await requireAdmin(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json({ users: await listUsers() });
  });

  r.post("/api/admin/role", async (req, res) => {
    const me = await requireAdmin(req);
    if (!me) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const { email, role } = req.body as {
      email?: unknown;
      role?: unknown;
    };
    if (typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "invalid email" });
      return;
    }
    if (role !== "admin" && role !== "user") {
      res.status(400).json({ error: "role must be 'admin' or 'user'" });
      return;
    }
    const lower = email.trim().toLowerCase();
    // Anti-bloqueo: nadie puede quitarse el admin a sí mismo.
    if (lower === me.toLowerCase() && role !== "admin") {
      res.status(400).json({ error: "cannot demote yourself" });
      return;
    }
    const u = await setUserRole(lower, role);
    if (!u) {
      res.status(404).json({ error: "unknown user (debe entrar al menos una vez)" });
      return;
    }
    res.json({ user: u });
  });

  // Estado guardado de jugadores (tabla de admin, solo lectura).
  r.get("/api/admin/players", async (req, res) => {
    if (!(await requireAdmin(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json({ players: await listPlayers() });
  });

  // Borra un usuario: estado guardado + fila + tokens. Sin auto-borrado.
  r.delete("/api/admin/users/:email", async (req, res) => {
    const me = await requireAdmin(req);
    if (!me) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const email = decodeURIComponent(req.params.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) {
      res.status(400).json({ error: "invalid email" });
      return;
    }
    if (email === me.toLowerCase()) {
      res.status(400).json({ error: "cannot delete yourself" });
      return;
    }
    const u = await deleteUser(email);
    if (!u) {
      res.status(404).json({ error: "unknown user" });
      return;
    }
    deleteTokensByEmail(email);
    res.json({ deleted: u });
  });

  return r;
}
