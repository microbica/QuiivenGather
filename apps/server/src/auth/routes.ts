// Rutas Google: OAuth + Calendar + Meet (Fase 4.5).
import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import {
  buildAuthUrl,
  exchangeCode,
  fetchProfile,
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
import { deleteTokens, getTokens, saveTokens } from "./store.js";

const pendingState = new Map<string, number>(); // state -> expiry ms

function webOrigin(): string {
  return process.env.SERVER_CORS_ORIGIN ?? "http://localhost:5173";
}

function requireSession(req: Request): string | null {
  return sessionSub(req.headers.cookie);
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
      const prev = getTokens(profile.sub);
      saveTokens(
        profile.sub,
        profile,
        tokens,
        tokens.refresh_token ?? prev?.refreshToken,
      );
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

  r.get("/auth/google/status", (req, res) => {
    const sub = requireSession(req);
    if (!sub) {
      res.json({ linked: false, configured: isGoogleConfigured() });
      return;
    }
    const t = getTokens(sub);
    res.json({ linked: !!t, email: t?.email ?? null });
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

  return r;
}
