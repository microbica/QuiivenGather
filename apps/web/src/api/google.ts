// Cliente de la API Google (Fase 4.5). Cookies httpOnly via fetch credentials.
const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:2567";

export interface GoogleStatus {
  linked: boolean;
  configured: boolean;
  email?: string | null;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  htmlLink: string;
  hangoutLink: string;
}

export interface MeetingResult {
  eventId: string;
  htmlLink: string;
  meetUri: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getStatus(): Promise<GoogleStatus> {
  return json(await fetch(`${BASE}/auth/google/status`, { credentials: "include" }));
}

export async function unlink(): Promise<void> {
  await fetch(`${BASE}/auth/google/unlink`, {
    method: "POST",
    credentials: "include",
  });
}

export async function getEvents(): Promise<CalendarEvent[]> {
  const r = await fetch(`${BASE}/api/calendar/events`, { credentials: "include" });
  const body = await json<{ events: CalendarEvent[] }>(r);
  return body.events;
}

export async function createMeeting(
  title: string,
  minutes: number,
  startISO?: string,
): Promise<MeetingResult> {
  const r = await fetch(`${BASE}/api/meetings`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, minutes, startISO }),
  });
  return json(r);
}

/** Abre el flujo OAuth en popup y resuelve al cerrarse (cuando enlace). */
export function startOAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    const w = window.open(
      `${BASE}/auth/google`,
      "google-oauth",
      "width=480,height=640",
    );
    if (!w) {
      resolve(false);
      return;
    }
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "google-linked") {
        cleanup();
        resolve(true);
      }
    };
    const onPoll = setInterval(() => {
      if (w.closed) {
        cleanup();
        resolve(false);
      }
    }, 500);
    const cleanup = () => {
      clearInterval(onPoll);
      window.removeEventListener("message", onMsg);
    };
    window.addEventListener("message", onMsg);
  });
}
